/**
 * Devbox REST API client with kubeconfig authentication
 */

import type { DevboxCreateConfig, DevboxInfo, MonitorData, TimeRange } from '../core/types'
import { DevboxSDKError, ERROR_CODES } from '../utils/error'
import { KubeconfigAuthenticator } from './auth'
import { APIEndpoints } from './endpoints'
import type {
  APIClientConfig,
  APIResponse,
  DevboxCreateRequest,
  DevboxListResponse,
  DevboxSSHInfoResponse,
  MonitorDataPoint,
  MonitorRequest,
} from './types'

/**
 * Simple HTTP client implementation
 */
class SimpleHTTPClient {
  private baseUrl: string
  private timeout: number
  private retries: number

  constructor(config: { baseUrl?: string; timeout?: number; retries?: number }) {
    this.baseUrl = config.baseUrl || 'https://api.sealos.io'
    this.timeout = config.timeout || 30000
    this.retries = config.retries || 3
  }

  async request(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>
      params?: Record<string, any>
      data?: any
    } = {}
  ): Promise<APIResponse> {
    const url = new URL(path, this.baseUrl)

    // Add query parameters
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }

    if (options.data) {
      fetchOptions.body = JSON.stringify(options.data)
    }

    let lastError: Error = new Error('Unknown error')
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        const response = await fetch(url.toString(), {
          ...fetchOptions,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new DevboxSDKError(
            `HTTP ${response.status}: ${response.statusText}`,
            this.getErrorCodeFromStatus(response.status),
            { status: response.status, statusText: response.statusText }
          )
        }

        const data = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : await response.text()

        return {
          data,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        }
      } catch (error) {
        lastError = error as Error

        if (attempt === this.retries || !this.shouldRetry(error as Error)) {
          break
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
    }

    throw lastError
  }

  private shouldRetry(error: Error): boolean {
    if (error instanceof DevboxSDKError) {
      return [
        ERROR_CODES.CONNECTION_TIMEOUT,
        ERROR_CODES.CONNECTION_FAILED,
        ERROR_CODES.SERVER_UNAVAILABLE,
        'SERVICE_UNAVAILABLE' as any,
      ].includes(error.code)
    }
    return error.name === 'AbortError' || error.message.includes('fetch')
  }

  private getErrorCodeFromStatus(status: number): string {
    switch (status) {
      case 401:
        return ERROR_CODES.AUTHENTICATION_FAILED
      case 403:
        return ERROR_CODES.AUTHENTICATION_FAILED
      case 404:
        return ERROR_CODES.DEVBOX_NOT_FOUND
      case 408:
        return ERROR_CODES.CONNECTION_TIMEOUT
      case 429:
        return 'TOO_MANY_REQUESTS'
      case 500:
        return ERROR_CODES.INTERNAL_ERROR
      case 502:
        return ERROR_CODES.SERVER_UNAVAILABLE
      case 503:
        return 'SERVICE_UNAVAILABLE' as any
      case 504:
        return ERROR_CODES.CONNECTION_TIMEOUT
      default:
        return ERROR_CODES.INTERNAL_ERROR
    }
  }

  get(url: string, options?: any): Promise<APIResponse> {
    return this.request('GET', url, options)
  }

  post(url: string, options?: any): Promise<APIResponse> {
    return this.request('POST', url, options)
  }

  put(url: string, options?: any): Promise<APIResponse> {
    return this.request('PUT', url, options)
  }

  delete(url: string, options?: any): Promise<APIResponse> {
    return this.request('DELETE', url, options)
  }
}

export class DevboxAPI {
  private httpClient: SimpleHTTPClient
  private authenticator: KubeconfigAuthenticator
  private endpoints: APIEndpoints

  constructor(config: APIClientConfig) {
    this.httpClient = new SimpleHTTPClient({
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      retries: config.retries,
    })
    this.authenticator = new KubeconfigAuthenticator(config.kubeconfig)
    this.endpoints = new APIEndpoints(config.baseUrl)
  }

  /**
   * Create a new Devbox instance
   */
  async createDevbox(config: DevboxCreateConfig): Promise<DevboxInfo> {
    const request: DevboxCreateRequest = {
      name: config.name,
      runtime: config.runtime,
      resource: config.resource,
      ports: config.ports?.map(p => ({ number: p.number, protocol: p.protocol })),
      env: config.env,
    }

    try {
      const response = await this.httpClient.post(this.endpoints.devboxCreate(), {
        headers: this.authenticator.getAuthHeaders(),
        data: request,
      })

      return this.transformSSHInfoToDevboxInfo(response.data as DevboxSSHInfoResponse)
    } catch (error) {
      throw this.handleAPIError(error, 'Failed to create Devbox')
    }
  }

  /**
   * Get an existing Devbox instance
   */
  async getDevbox(name: string): Promise<DevboxInfo> {
    try {
      const response = await this.httpClient.get(this.endpoints.devboxGet(name), {
        headers: this.authenticator.getAuthHeaders(),
      })

      return this.transformSSHInfoToDevboxInfo(response.data as DevboxSSHInfoResponse)
    } catch (error) {
      throw this.handleAPIError(error, `Failed to get Devbox '${name}'`)
    }
  }

  /**
   * List all Devbox instances
   */
  async listDevboxes(): Promise<DevboxInfo[]> {
    try {
      const response = await this.httpClient.get(this.endpoints.devboxList(), {
        headers: this.authenticator.getAuthHeaders(),
      })

      const listResponse = response.data as DevboxListResponse
      return listResponse.devboxes.map(this.transformSSHInfoToDevboxInfo)
    } catch (error) {
      throw this.handleAPIError(error, 'Failed to list Devboxes')
    }
  }

  /**
   * Start a Devbox instance
   */
  async startDevbox(name: string): Promise<void> {
    try {
      await this.httpClient.post(this.endpoints.devboxStart(name), {
        headers: this.authenticator.getAuthHeaders(),
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to start Devbox '${name}'`)
    }
  }

  /**
   * Pause a Devbox instance
   */
  async pauseDevbox(name: string): Promise<void> {
    try {
      await this.httpClient.post(this.endpoints.devboxPause(name), {
        headers: this.authenticator.getAuthHeaders(),
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to pause Devbox '${name}'`)
    }
  }

  /**
   * Restart a Devbox instance
   */
  async restartDevbox(name: string): Promise<void> {
    try {
      await this.httpClient.post(this.endpoints.devboxRestart(name), {
        headers: this.authenticator.getAuthHeaders(),
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to restart Devbox '${name}'`)
    }
  }

  /**
   * Delete a Devbox instance
   */
  async deleteDevbox(name: string): Promise<void> {
    try {
      await this.httpClient.delete(this.endpoints.devboxDelete(name), {
        headers: this.authenticator.getAuthHeaders(),
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to delete Devbox '${name}'`)
    }
  }

  /**
   * Get monitoring data for a Devbox instance
   */
  async getMonitorData(name: string, timeRange?: TimeRange): Promise<MonitorData[]> {
    try {
      const params: MonitorRequest = {
        start: timeRange?.start || Date.now() - 3600000, // Default 1 hour ago
        end: timeRange?.end || Date.now(),
        step: timeRange?.step,
      }

      const response = await this.httpClient.get(this.endpoints.devboxMonitor(name), {
        headers: this.authenticator.getAuthHeaders(),
        params,
      })

      const dataPoints = response.data as MonitorDataPoint[]
      return dataPoints.map(this.transformMonitorData)
    } catch (error) {
      throw this.handleAPIError(error, `Failed to get monitor data for '${name}'`)
    }
  }

  /**
   * Test authentication
   */
  async testAuth(): Promise<boolean> {
    try {
      await this.httpClient.get(this.endpoints.devboxList(), {
        headers: this.authenticator.getAuthHeaders(),
      })
      return true
    } catch (error) {
      return false
    }
  }

  private transformSSHInfoToDevboxInfo(sshInfo: DevboxSSHInfoResponse): DevboxInfo {
    return {
      name: sshInfo.name,
      status: sshInfo.status,
      runtime: sshInfo.runtime,
      resources: sshInfo.resources,
      podIP: sshInfo.podIP,
      ssh: sshInfo.ssh
        ? {
            host: sshInfo.ssh.host,
            port: sshInfo.ssh.port,
            user: sshInfo.ssh.user,
            privateKey: sshInfo.ssh.privateKey,
          }
        : undefined,
    }
  }

  private transformMonitorData(dataPoint: MonitorDataPoint): MonitorData {
    return {
      cpu: dataPoint.cpu,
      memory: dataPoint.memory,
      network: dataPoint.network,
      disk: dataPoint.disk,
      timestamp: dataPoint.timestamp,
    }
  }

  private handleAPIError(error: any, context: string): DevboxSDKError {
    if (error instanceof DevboxSDKError) {
      return error
    }

    return new DevboxSDKError(`${context}: ${error.message}`, ERROR_CODES.INTERNAL_ERROR, {
      originalError: error,
    })
  }
}
