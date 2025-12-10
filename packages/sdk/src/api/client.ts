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
  DevboxCreateResponse,
  DevboxDetail,
  DevboxGetResponse,
  DevboxListApiResponse,
  DevboxListItem,
  DevboxListResponse,
  DevboxSSHInfoResponse,
  MonitorDataPoint,
  MonitorRequest,
} from './types'
import { DevboxRuntime } from './types'

/**
 * HTTP client for Sealos API server communication
 * Used for Devbox lifecycle management (create, start, stop, etc.)
 */
class SealosAPIClient {
  private baseUrl: string
  private timeout: number
  private retries: number
  private rejectUnauthorized: boolean
  private getAuthHeaders?: () => Record<string, string>

  constructor(config: {
    baseUrl?: string
    timeout?: number
    retries?: number
    rejectUnauthorized?: boolean
    getAuthHeaders?: () => Record<string, string>
  }) {
    this.baseUrl = config.baseUrl || 'https://devbox.usw.sealos.io'
    this.timeout = config.timeout || 30000
    this.retries = config.retries || 3
    this.rejectUnauthorized = config.rejectUnauthorized ??
      (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0')
    this.getAuthHeaders = config.getAuthHeaders
    if (!this.rejectUnauthorized) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }
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
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.getAuthHeaders ? this.getAuthHeaders() : {}),
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

        // console.log('fetchOptions',fetchOptions)

        const response = await fetch(url.toString(), {
          ...fetchOptions,
          signal: controller.signal,
        })

        // console.log('response.url', response.ok, url.toString(), fetchOptions,)

        clearTimeout(timeoutId)

        if (!response.ok) {
          let errorData: { error?: string; code?: string; timestamp?: number } = {}
          try {
            const contentType = response.headers.get('content-type') || ''
            if (contentType.includes('application/json')) {
              errorData = (await response.json()) as { error?: string; code?: string; timestamp?: number }
            } else {
              const errorText = await response.text().catch(() => 'Unable to read error response')
              try {
                errorData = JSON.parse(errorText) as { error?: string; code?: string; timestamp?: number }
              } catch {

                errorData = { error: errorText }
              }
            }
          } catch (e) {
            // Ignore parsing error, use default error message
          }

          const errorMessage = errorData.error || response.statusText
          const errorCode = errorData.code || this.getErrorCodeFromStatus(response.status)

          throw new DevboxSDKError(
            errorMessage,
            errorCode,
            {
              status: response.status,
              statusText: response.statusText,
              timestamp: errorData.timestamp,
              serverErrorCode: errorData.code,
            }
          )
        }

        const contentType = response.headers.get('content-type')
        const data = contentType?.includes('application/json')
          ? await response.json()
          : await response.text()

        // console.log('response.data', url.toString(), data)

        return {
          data,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        }
      } catch (error) {
        lastError = error as Error

        if (error instanceof Error && 'cause' in error && error.cause instanceof Error) {
          const cause = error.cause
          if (cause.message.includes('certificate') || (cause as any).code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
            console.error('⚠️  SSL/TLS certificate error detected. Set http.rejectUnauthorized: false in config for development/testing.')
          }
        }

        if (attempt === this.retries || !this.shouldRetry(error as Error)) {
          break
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 1000))
      }
    }
    throw lastError
  }

  private shouldRetry(error: Error): boolean {
    if (error instanceof DevboxSDKError) {
      // Don't retry on client errors (4xx) except for timeout errors
      const nonRetryable4xxCodes = [
        ERROR_CODES.UNAUTHORIZED,
        ERROR_CODES.INVALID_TOKEN,
        ERROR_CODES.TOKEN_EXPIRED,
        ERROR_CODES.INVALID_REQUEST,
        ERROR_CODES.MISSING_REQUIRED_FIELD,
        ERROR_CODES.INVALID_FIELD_VALUE,
        ERROR_CODES.NOT_FOUND,
        ERROR_CODES.FILE_NOT_FOUND,
        ERROR_CODES.PROCESS_NOT_FOUND,
        ERROR_CODES.SESSION_NOT_FOUND,
        ERROR_CODES.CONFLICT,
        ERROR_CODES.VALIDATION_ERROR,
        ERROR_CODES.AUTHENTICATION_FAILED,
      ]

      if (nonRetryable4xxCodes.includes(error.code as any)) {
        return false
      }

      // Retry on timeout and server errors
      return [
        ERROR_CODES.CONNECTION_TIMEOUT,
        ERROR_CODES.CONNECTION_FAILED,
        ERROR_CODES.SERVER_UNAVAILABLE,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        ERROR_CODES.OPERATION_TIMEOUT,
        ERROR_CODES.SESSION_TIMEOUT,
        ERROR_CODES.INTERNAL_ERROR,
      ].includes(error.code as any)
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
  private httpClient: SealosAPIClient
  private authenticator: KubeconfigAuthenticator
  private endpoints: APIEndpoints

  constructor(config: APIClientConfig) {
    this.authenticator = new KubeconfigAuthenticator(config.kubeconfig)
    this.httpClient = new SealosAPIClient({
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      retries: config.retries,
      rejectUnauthorized: config.rejectUnauthorized,
      getAuthHeaders: () => this.authenticator.getAuthHeaders(),
    })
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
        data: request,
      })
      const responseData = response.data as { data: DevboxCreateResponse }
      return this.transformCreateResponseToDevboxInfo(
        responseData.data,
        config.runtime,
        config.resource
      )
    } catch (error) {
      throw this.handleAPIError(error, 'Failed to create Devbox')
    }
  }

  /**
   * Get an existing Devbox instance
   */
  async getDevbox(name: string): Promise<DevboxInfo> {
    try {
      const response = await this.httpClient.get(this.endpoints.devboxGet(name))

      const responseData = response.data as { data: DevboxDetail }
      return this.transformDetailToDevboxInfo(responseData.data)
    } catch (error) {
      throw this.handleAPIError(error, `Failed to get Devbox '${name}'`)
    }
  }

  /**
   * List all Devbox instances
   */
  async listDevboxes(): Promise<DevboxInfo[]> {
    try {
      const response = await this.httpClient.get(this.endpoints.devboxList())
      const listResponse = response.data as DevboxListApiResponse
      return listResponse.data.map(this.transformListItemToDevboxInfo)
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
        data: {},
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
        data: {},
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
        data: {},
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
      await this.httpClient.delete(this.endpoints.devboxDelete(name))
    } catch (error) {
      throw this.handleAPIError(error, `Failed to delete Devbox '${name}'`)
    }
  }

  /**
   * Update a Devbox instance configuration
   */
  async updateDevbox(name: string, config: any): Promise<void> {
    try {
      await this.httpClient.request('PATCH', this.endpoints.devboxUpdate(name), {
        data: config,
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to update Devbox '${name}'`)
    }
  }

  /**
   * Shutdown a Devbox instance
   */
  async shutdownDevbox(name: string): Promise<void> {
    try {
      await this.httpClient.post(this.endpoints.devboxShutdown(name), {
        data: {},
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to shutdown Devbox '${name}'`)
    }
  }

  /**
   * Get available runtime templates
   */
  async getTemplates(): Promise<any> {
    try {
      const response = await this.httpClient.get(this.endpoints.devboxTemplates())
      return response.data
    } catch (error) {
      throw this.handleAPIError(error, 'Failed to get templates')
    }
  }

  /**
   * Update port configuration for a Devbox
   */
  async updatePorts(name: string, ports: any[]): Promise<void> {
    try {
      await this.httpClient.put(this.endpoints.devboxPorts(name), {
        data: { ports },
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to update ports for '${name}'`)
    }
  }

  /**
   * Configure autostart for a Devbox
   */
  async configureAutostart(name: string, config?: any): Promise<void> {
    try {
      await this.httpClient.post(this.endpoints.devboxAutostart(name), {
        data: config || {},
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to configure autostart for '${name}'`)
    }
  }

  /**
   * List releases for a Devbox
   */
  async listReleases(name: string): Promise<any[]> {
    try {
      const response = await this.httpClient.get(this.endpoints.releaseList(name))
      const responseData = response.data as { data?: any[] } | undefined
      return responseData?.data || []
    } catch (error) {
      throw this.handleAPIError(error, `Failed to list releases for '${name}'`)
    }
  }

  /**
   * Create a release for a Devbox
   */
  async createRelease(name: string, config: any): Promise<void> {
    try {
      await this.httpClient.post(this.endpoints.releaseCreate(name), {
        data: config,
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to create release for '${name}'`)
    }
  }

  /**
   * Delete a release
   */
  async deleteRelease(name: string, tag: string): Promise<void> {
    try {
      await this.httpClient.delete(this.endpoints.releaseDelete(name, tag))
    } catch (error) {
      throw this.handleAPIError(error, `Failed to delete release '${tag}' for '${name}'`)
    }
  }

  /**
   * Deploy a release
   */
  async deployRelease(name: string, tag: string): Promise<void> {
    try {
      await this.httpClient.post(this.endpoints.releaseDeploy(name, tag), {
        data: {},
      })
    } catch (error) {
      throw this.handleAPIError(error, `Failed to deploy release '${tag}' for '${name}'`)
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
      await this.httpClient.get(this.endpoints.devboxList())
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

  private transformListItemToDevboxInfo(listItem: DevboxListItem): DevboxInfo {
    return {
      name: listItem.name,
      status: listItem.status,
      runtime: listItem.runtime,
      resources: listItem.resources,
    }
  }

  /**
   * Safely convert a string to DevboxRuntime enum
   * Returns the enum value if valid, otherwise returns a default value
   */
  private stringToRuntime(value: string | null | undefined): DevboxRuntime {
    if (!value) {
      return DevboxRuntime.TEST_AGENT // Default fallback
    }
    // Check if the value matches any enum value
    const runtimeValues = Object.values(DevboxRuntime) as string[]
    if (runtimeValues.includes(value)) {
      return value as DevboxRuntime
    }
    // If not found, return default
    return DevboxRuntime.TEST_AGENT
  }

  private transformCreateResponseToDevboxInfo(
    createResponse: DevboxCreateResponse,
    runtime: DevboxRuntime,
    resource: { cpu: number; memory: number }
  ): DevboxInfo {
    return {
      name: createResponse.name,
      status: 'Pending', // New devboxes start in Pending state
      runtime: runtime, // Use the runtime from the create request
      resources: {
        cpu: resource.cpu, // Use the resource from the create request
        memory: resource.memory, // Use the resource from the create request
      },
      ssh: {
        host: createResponse.domain,
        port: createResponse.sshPort,
        user: createResponse.userName,
        privateKey: createResponse.base64PrivateKey,
      },
    }
  }

  /**
   * Transform DevboxDetail (actual API response) to DevboxInfo
   */
  private transformDetailToDevboxInfo(detail: DevboxDetail): DevboxInfo {
    // Handle runtime: may be string or enum value
    const runtime = typeof detail.runtime === 'string'
      ? this.stringToRuntime(detail.runtime)
      : detail.runtime

    // Handle SSH info: only set if privateKey exists
    const ssh = detail.ssh?.privateKey ? {
      host: detail.ssh.host,
      port: detail.ssh.port,
      user: detail.ssh.user,
      privateKey: detail.ssh.privateKey,
    } : undefined

    // Extract podIP (from pods array if exists)
    let podIP: string | undefined
    if (detail.pods && detail.pods.length > 0) {
      // Try to extract IP from pods, may need to adjust based on actual API response structure
      // If API returns pods with IP info, can extract here
    }

    return {
      name: detail.name,
      status: detail.status,
      runtime,
      resources: detail.resources,
      podIP,
      ssh,
      ports: detail.ports,
      agentServer: detail.agentServer,
    }
  }

  /**
   * Transform DevboxGetResponse to DevboxInfo (legacy method, kept for backward compatibility)
   */
  private transformGetResponseToDevboxInfo(getResponse: DevboxGetResponse): DevboxInfo {
    // Handle status: may be string or object
    const status = typeof getResponse.status === 'string'
      ? getResponse.status
      : getResponse.status.value

    // Handle resources: prefer resources object, otherwise use direct cpu/memory fields
    const resources = getResponse.resources || {
      cpu: getResponse.cpu || 0,
      memory: getResponse.memory || 0,
    }

    // Handle runtime: prefer runtime field, otherwise use iconId
    const runtime = getResponse.runtime
      ? this.stringToRuntime(getResponse.runtime)
      : (getResponse.iconId ? this.stringToRuntime(getResponse.iconId) : DevboxRuntime.TEST_AGENT)

    return {
      name: getResponse.name,
      status,
      runtime,
      resources,
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
