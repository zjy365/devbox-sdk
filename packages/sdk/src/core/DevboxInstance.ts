/**
 * Devbox instance class for managing individual Devbox containers
 */

import type {
  DevboxInfo,
  FileMap,
  WriteOptions,
  ReadOptions,
  BatchUploadOptions,
  TransferResult,
  FileChangeEvent,
  CommandResult,
  ProcessStatus,
  MonitorData,
  TimeRange
} from '../core/types'
import type { DevboxSDK } from '../core/DevboxSDK'

export class DevboxInstance {
  private info: DevboxInfo
  private sdk: DevboxSDK

  constructor (info: DevboxInfo, sdk: DevboxSDK) {
    this.info = info
    this.sdk = sdk
  }

  // Properties
  get name (): string {
    return this.info.name
  }

  get status (): string {
    return this.info.status
  }

  get runtime (): string {
    return this.info.runtime
  }

  get resources (): any {
    return this.info.resources
  }

  get serverUrl (): string {
    if (!this.info.podIP) {
      throw new Error(`Devbox '${this.name}' does not have a pod IP address`)
    }
    return `http://${this.info.podIP}:3000`
  }

  // Lifecycle operations
  async start (): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.startDevbox(this.name)
    // Refresh the instance info after starting
    await this.refreshInfo()
  }

  async pause (): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.pauseDevbox(this.name)
    await this.refreshInfo()
  }

  async restart (): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.restartDevbox(this.name)
    await this.refreshInfo()
  }

  async delete (): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.deleteDevbox(this.name)
  }

  /**
   * Refresh the instance information from the API
   */
  async refreshInfo (): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    this.info = await apiClient.getDevbox(this.name)
  }

  // File operations (instance methods)
  async writeFile (path: string, content: string | Buffer, options?: WriteOptions): Promise<void> {
    return await this.sdk.writeFile(this.name, path, content, options)
  }

  async readFile (path: string, options?: ReadOptions): Promise<Buffer> {
    return await this.sdk.readFile(this.name, path, options)
  }

  async uploadFiles (files: FileMap, options?: BatchUploadOptions): Promise<TransferResult> {
    return await this.sdk.uploadFiles(this.name, files, options)
  }

  // File watching (instance method)
  async watchFiles (path: string, callback: (event: FileChangeEvent) => void): Promise<any> {
    return await this.sdk.watchFiles(this.name, path, callback)
  }

  // Process execution (HTTP API)
  async executeCommand (command: string): Promise<CommandResult> {
    const connectionManager = this.sdk.getConnectionManager()
    return await connectionManager.executeWithConnection(this.name, async (client) => {
      const response = await client.post('/process/exec', {
        command,
        shell: '/bin/bash'
      })
      return response.data
    })
  }

  // Get process status
  async getProcessStatus (pid: number): Promise<ProcessStatus> {
    const connectionManager = this.sdk.getConnectionManager()
    return await connectionManager.executeWithConnection(this.name, async (client) => {
      const response = await client.get(`/process/status/${pid}`)
      return response.data
    })
  }

  // Monitoring
  async getMonitorData (timeRange?: TimeRange): Promise<MonitorData[]> {
    return await this.sdk.getMonitorData(this.name, timeRange)
  }

  // Health check
  async isHealthy (): Promise<boolean> {
    try {
      const connectionManager = this.sdk.getConnectionManager()
      return await connectionManager.checkDevboxHealth(this.name)
    } catch (error) {
      return false
    }
  }

  /**
   * Wait for the Devbox to be ready and healthy
   */
  async waitForReady (timeout: number = 60000): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const isHealthy = await this.isHealthy()
        if (isHealthy) {
          return
        }
      } catch (error) {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error(`Devbox '${this.name}' did not become ready within ${timeout}ms`)
  }

  /**
   * Get detailed information about the instance
   */
  async getDetailedInfo (): Promise<DevboxInfo> {
    await this.refreshInfo()
    return { ...this.info }
  }
}
