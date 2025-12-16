import type { DevboxInfo, DevboxSDKConfig } from '../core/types'
import { DevboxNotReadyError, DevboxSDKError, ERROR_CODES } from '../utils/error'
import { DevboxContainerClient } from './client'

interface IDevboxAPIClient {
  getDevbox(name: string): Promise<DevboxInfo>
}

export class ContainerUrlResolver {
  private apiClient?: IDevboxAPIClient
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 60000
  private mockServerUrl?: string
  private baseUrl: string
  private timeout: number

  constructor(config: DevboxSDKConfig) {
    this.mockServerUrl = config.mockServerUrl || process.env.MOCK_SERVER_URL
    this.baseUrl = config.baseUrl || process.env.DEVBOX_API_URL || 'https://devbox.usw.sealos.io'
    this.timeout = config.http?.timeout || 30000
  }

  setAPIClient(apiClient: IDevboxAPIClient): void {
    this.apiClient = apiClient
  }

  async executeWithConnection<T>(
    devboxName: string,
    operation: (client: DevboxContainerClient) => Promise<T>
  ): Promise<T> {
    const devboxInfo = await this.getDevboxInfo(devboxName)
    const serverUrl = this.extractUrlFromDevboxInfo(devboxInfo!)
    // console.log('serverUrl', serverUrl)

    // Check if Devbox is ready (has agentServer info)
    const token = devboxInfo?.agentServer?.token
    if (!serverUrl || !token) {
      // Devbox exists but is not ready yet - throw friendly error
      throw new DevboxNotReadyError(devboxName, devboxInfo?.status, {
        hasServerUrl: !!serverUrl,
        hasToken: !!token,
        currentStatus: devboxInfo?.status,
      })
    }

    const client = new DevboxContainerClient(serverUrl, this.timeout, token)
    return await operation(client)
  }

  async getServerUrl(devboxName: string): Promise<string> {
    const configuredUrl = this.getConfiguredServerUrl()
    if (configuredUrl) {
      return configuredUrl
    }

    if (!this.apiClient) {
      throw new DevboxSDKError(
        'API client not set. Call setAPIClient() first.',
        ERROR_CODES.INTERNAL_ERROR
      )
    }

    const cached = this.getFromCache(`url:${devboxName}`)
    if (cached && typeof cached === 'string') {
      return cached
    }

    try {
      const url = await this.resolveServerUrlFromAPI(devboxName)
      this.setCache(`url:${devboxName}`, url)
      return url
    } catch (error) {
      if (error instanceof DevboxSDKError) {
        throw error
      }
      throw new DevboxSDKError(
        `Failed to get server URL for '${devboxName}': ${(error as Error).message}`,
        ERROR_CODES.CONNECTION_FAILED,
        { originalError: (error as Error).message }
      )
    }
  }

  private getConfiguredServerUrl(): string | null {
    if (this.mockServerUrl) {
      return this.mockServerUrl
    }
    return null
  }

  private async resolveServerUrlFromAPI(devboxName: string): Promise<string> {
    const devboxInfo = await this.getDevboxInfo(devboxName)

    if (!devboxInfo) {
      throw new DevboxSDKError(`Devbox '${devboxName}' not found`, ERROR_CODES.DEVBOX_NOT_FOUND)
    }

    const url = this.extractUrlFromDevboxInfo(devboxInfo)
    if (!url) {
      throw new DevboxSDKError(
        `Devbox '${devboxName}' does not have an accessible URL`,
        ERROR_CODES.CONNECTION_FAILED
      )
    }

    return url
  }

  private extractUrlFromDevboxInfo(devboxInfo: DevboxInfo): string | null {
    // Priority 1: Use agentServer URL if available
    if (devboxInfo.agentServer?.url) {
      const serviceName = devboxInfo.agentServer.url
      // Extract domain part from baseUrl
      // Example: https://devbox.staging-usw-1.sealos.io -> staging-usw-1.sealos.io
      const urlObj = new URL(this.baseUrl)
      const domain = urlObj.hostname.replace(/^devbox\./, '') // Remove devbox. prefix
      // Build complete URL: https://devbox-{serviceName}-agent.{domain}/
      return `${urlObj.protocol}//devbox-${serviceName}-agent.${domain}`
    }

    // Priority 2: Use port addresses
    if (devboxInfo.ports && devboxInfo.ports.length > 0) {
      const port = devboxInfo.ports[0]
      if (port?.publicAddress) {
        return port.publicAddress
      }
      if (port?.privateAddress) {
        return port.privateAddress
      }
    }

    // Priority 3: Fallback to podIP
    if (devboxInfo.podIP) {
      return `http://${devboxInfo.podIP}:3000`
    }

    return null
  }

  private async getDevboxInfo(devboxName: string): Promise<DevboxInfo | null> {
    const cached = this.getFromCache(`devbox:${devboxName}`)
    if (cached) {
      return cached as DevboxInfo
    }

    try {
      if (!this.apiClient) {
        throw new Error('API client not set')
      }
      const devboxInfo = await this.apiClient.getDevbox(devboxName)
      this.setCache(`devbox:${devboxName}`, devboxInfo)
      return devboxInfo
    } catch (error) {
      return null
    }
  }

  private getFromCache(key: string): unknown | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  clearCache(): void {
    this.cache.clear()
  }

  async closeAllConnections(): Promise<void> {
    this.clearCache()
  }

  async checkDevboxHealth(devboxName: string): Promise<boolean> {
    try {
      const devboxInfo = await this.getDevboxInfo(devboxName)
      const serverUrl = this.extractUrlFromDevboxInfo(devboxInfo!)
      if (!serverUrl) return false
      const token = devboxInfo?.agentServer?.token
      if (!token) return false
      const client = new DevboxContainerClient(serverUrl, this.timeout, token)
      const response = await client.get<{ healthStatus?: string; status?: number }>('/health')
      // Check healthStatus field (API returns: { status: 0, healthStatus: "ok", ... })
      return response.data?.healthStatus === 'ok'
    } catch (error) {
      return false
    }
  }
}
