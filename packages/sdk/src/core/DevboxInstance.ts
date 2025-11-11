/**
 * Devbox instance class for managing individual Devbox containers
 */

import type { ListFilesResponse } from '@sealos/devbox-shared/types'
import FormData from 'form-data'
import type { DevboxSDK } from '../core/DevboxSDK'
import type {
  BatchUploadOptions,
  CommandResult,
  DevboxInfo,
  FileChangeEvent,
  FileMap,
  FileWatchWebSocket,
  MonitorData,
  ProcessStatus,
  ReadOptions,
  ResourceInfo,
  TimeRange,
  TransferResult,
  WatchRequest,
  WriteOptions,
} from '../core/types'
import type { DevboxRuntime } from '../api/types'

export class DevboxInstance {
  private info: DevboxInfo
  private sdk: DevboxSDK

  constructor(info: DevboxInfo, sdk: DevboxSDK) {
    this.info = info
    this.sdk = sdk
  }

  // Properties
  get name(): string {
    return this.info.name
  }

  get status(): string {
    return this.info.status
  }

  get runtime(): DevboxRuntime {
    return this.info.runtime
  }

  get resources(): ResourceInfo {
    return this.info.resources
  }

  get serverUrl(): string {
    if (!this.info.podIP) {
      throw new Error(`Devbox '${this.name}' does not have a pod IP address`)
    }
    return `http://${this.info.podIP}:3000`
  }

  // Lifecycle operations
  async start(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.startDevbox(this.name)
    // Refresh the instance info after starting
    await this.refreshInfo()
  }

  async pause(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.pauseDevbox(this.name)
    await this.refreshInfo()
  }

  async restart(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.restartDevbox(this.name)
    await this.refreshInfo()
  }

  async shutdown(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.shutdownDevbox(this.name)
    await this.refreshInfo()
  }

  async delete(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.deleteDevbox(this.name)
  }

  /**
   * Refresh the instance information from the API
   */
  async refreshInfo(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    this.info = await apiClient.getDevbox(this.name)
  }

  async writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void> {
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver();
    console.log(await urlResolver.getServerUrl(this.name));
    await urlResolver.executeWithConnection(this.name, async client => {
      let contentString: string
      let encoding: string
      
      if (Buffer.isBuffer(content)) {
        encoding = options?.encoding || 'base64'
        contentString = encoding === 'base64' ? content.toString('base64') : content.toString('utf-8')
      } else {
        encoding = options?.encoding || 'utf-8'
        contentString = encoding === 'base64' ? Buffer.from(content, 'utf-8').toString('base64') : content
      }
      
      await client.post('/api/v1/files/write', {
        body: {
          path,
          content: contentString,
          encoding,
          ...options,
        },
      })
    })
  }

  async readFile(path: string, options?: ReadOptions): Promise<Buffer> {
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<{
        success: boolean
        path: string
        content: string
        size: number
        encoding?: string
      }>('/api/v1/files/read', {
        body: { path, ...options },
      })

      const responseData = response.data
      if (!responseData.success || !responseData.content) {
        throw new Error('Failed to read file: invalid response')
      }

      const encoding = options?.encoding || responseData.encoding || 'utf-8'
      if (encoding === 'base64') {
        return Buffer.from(responseData.content, 'base64')
      }
      return Buffer.from(responseData.content, 'utf-8')
    })
  }

  /**
   * Validate file path to prevent directory traversal attacks
   */
  private validatePath(path: string): void {
    if (!path || path.length === 0) {
      throw new Error('Path cannot be empty')
    }

    // Check for directory traversal attempts
    const normalized = path.replace(/\\/g, '/')
    if (normalized.includes('../') || normalized.includes('..\\')) {
      throw new Error(`Path traversal detected: ${path}`)
    }

    // Ensure absolute paths start from workspace
    if (normalized.startsWith('/') && (normalized.startsWith('/../') || normalized === '/..')) {
      throw new Error(`Invalid absolute path: ${path}`)
    }
  }

  async deleteFile(path: string): Promise<void> {
    // Validate path to prevent directory traversal
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver()
    await urlResolver.executeWithConnection(this.name, async client => {
      await client.post('/api/v1/files/delete', {
        body: { path },
      })
    })
  }

  async listFiles(path: string): Promise<ListFilesResponse> {
    // Validate path to prevent directory traversal
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.get<ListFilesResponse>('/api/v1/files/list', {
        params: { path },
      })
      return response.data
    })
  }

  async uploadFiles(files: FileMap, options?: BatchUploadOptions & { targetDir?: string }): Promise<TransferResult> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      // Create FormData for multipart/form-data upload
      const formData = new FormData()

      // Add targetDir (required by OpenAPI spec)
      const targetDir = options?.targetDir || '/'
      formData.append('targetDir', targetDir)

      // Add files as binary data
      // Note: OpenAPI spec expects files array, but form-data typically uses
      // the same field name for multiple files
      for (const [filePath, content] of Object.entries(files)) {
        const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content)
        // Use the file path as the filename, and append to 'files' field
        formData.append('files', buffer, {
          filename: filePath.split('/').pop() || 'file',
          // Store the full path in a custom header or use a different approach
          // For now, we'll use the filename and let the server handle path reconstruction
        })
      }

      const response = await client.post<TransferResult>('/api/v1/files/batch-upload', {
        body: formData as unknown as FormData,
      })
      return response.data
    })
  }

  // File watching (instance method)
  async watchFiles(
    path: string,
    callback: (event: FileChangeEvent) => void
  ): Promise<FileWatchWebSocket> {
    const urlResolver = this.sdk.getUrlResolver()
      const serverUrl = await urlResolver.getServerUrl(this.name)
    const { default: WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://${serverUrl.replace('http://', '')}/ws`) as unknown as FileWatchWebSocket

    ws.onopen = () => {
      const watchRequest: WatchRequest = { type: 'watch', path }
      ws.send(JSON.stringify(watchRequest))
    }

    ws.onmessage = (event: any) => {
      try {
        const data = typeof event.data === 'string' ? event.data : event.data?.toString() || ''
        const fileEvent = JSON.parse(data) as FileChangeEvent
        callback(fileEvent)
      } catch (error) {
        console.error('Failed to parse file watch event:', error)
      }
    }

    return ws
  }

  // Process execution
  async executeCommand(command: string): Promise<CommandResult> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<CommandResult>('/api/v1/process/exec', {
        body: {
          command,
          shell: '/bin/bash',
        },
      })
      return response.data
    })
  }

  // Get process status
  async getProcessStatus(pid: number): Promise<ProcessStatus> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.get<ProcessStatus>(`/api/v1/process/status/${pid}`)
      return response.data
    })
  }

  // Monitoring
  async getMonitorData(timeRange?: TimeRange): Promise<MonitorData[]> {
    return await this.sdk.getMonitorData(this.name, timeRange)
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      const urlResolver = this.sdk.getUrlResolver()
      return await urlResolver.checkDevboxHealth(this.name)
    } catch (error) {
      return false
    }
  }

  /**
   * Wait for the Devbox to be ready and healthy
   * @param timeout Timeout in milliseconds (default: 300000 = 5 minutes)
   * @param checkInterval Check interval in milliseconds (default: 2000)
   */
  async waitForReady(timeout = 300000, checkInterval = 2000): Promise<void> {
    const startTime = Date.now()

    console.log(`[DevboxInstance] Waiting for devbox '${this.name}' to be ready...`)

    while (Date.now() - startTime < timeout) {
      try {
        // 1. Check Devbox status via API
        await this.refreshInfo()

        if (this.status === 'Running') {
          // 2. Check health status via Bun server
          const healthy = await this.isHealthy()

          if (healthy) {
            console.log(`[DevboxInstance] Devbox '${this.name}' is ready and healthy`)
            return
          }
        }

        // Log current status for debugging
        console.log(`[DevboxInstance] Current status: ${this.status}, waiting...`)
      } catch (error) {
        // Log error but continue waiting
        console.warn(
          `[DevboxInstance] Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    throw new Error(`Devbox '${this.name}' did not become ready within ${timeout}ms`)
  }

  /**
   * Get detailed information about the instance
   */
  async getDetailedInfo(): Promise<DevboxInfo> {
    await this.refreshInfo()
    return { ...this.info }
  }
}
