/**
 * Main Devbox SDK class for managing Sealos Devbox instances
 */

import { DevboxAPI } from '../api/client'
import { ConnectionManager } from '../connection/manager'
import type {
  DevboxSDKConfig,
  DevboxCreateConfig,
  DevboxInfo,
  FileMap,
  WriteOptions,
  ReadOptions,
  BatchUploadOptions,
  TransferResult,
  FileChangeEvent,
  TimeRange,
  MonitorData
} from './types'
import { DevboxInstance } from '../devbox/DevboxInstance'

export class DevboxSDK {
  private apiClient: DevboxAPI
  private connectionManager: ConnectionManager

  constructor (config: DevboxSDKConfig) {
    this.apiClient = new DevboxAPI(config)
    this.connectionManager = new ConnectionManager(config)
  }

  /**
   * Create a new Devbox instance
   */
  async createDevbox (config: DevboxCreateConfig): Promise<DevboxInstance> {
    const devboxInfo = await this.apiClient.createDevbox(config)
    return new DevboxInstance(devboxInfo, this)
  }

  /**
   * Get an existing Devbox instance
   */
  async getDevbox (name: string): Promise<DevboxInstance> {
    const devboxInfo = await this.apiClient.getDevbox(name)
    return new DevboxInstance(devboxInfo, this)
  }

  /**
   * List all Devbox instances
   */
  async listDevboxes (): Promise<DevboxInstance[]> {
    const devboxes = await this.apiClient.listDevboxes()
    return devboxes.map((info: DevboxInfo) => new DevboxInstance(info, this))
  }

  /**
   * Write a file to a Devbox instance
   */
  async writeFile (
    devboxName: string,
    path: string,
    content: string | Buffer,
    options?: WriteOptions
  ): Promise<void> {
    return await this.connectionManager.executeWithConnection(
      devboxName,
      async (client) => {
        const response = await client.post('/files/write', {
          path,
          content: content.toString('base64'),
          encoding: 'base64',
          ...options
        })
        return response.data
      }
    )
  }

  /**
   * Read a file from a Devbox instance
   */
  async readFile (
    devboxName: string,
    path: string,
    options?: ReadOptions
  ): Promise<Buffer> {
    return await this.connectionManager.executeWithConnection(
      devboxName,
      async (client) => {
        const response = await client.get('/files/read', {
          params: { path, ...options }
        })
        return Buffer.from(await response.arrayBuffer())
      }
    )
  }

  /**
   * Upload multiple files to a Devbox instance
   */
  async uploadFiles (
    devboxName: string,
    files: FileMap,
    options?: BatchUploadOptions
  ): Promise<TransferResult> {
    return await this.connectionManager.executeWithConnection(
      devboxName,
      async (client) => {
        const response = await client.post('/files/batch-upload', {
          files: Object.entries(files).map(([path, content]) => ({
            path,
            content: content.toString('base64'),
            encoding: 'base64'
          }))
        })
        return response.data
      }
    )
  }

  /**
   * Watch files in a Devbox instance for changes
   */
  async watchFiles (
    devboxName: string,
    path: string,
    callback: (event: FileChangeEvent) => void
  ): Promise<any> {
    const serverUrl = await this.connectionManager.getServerUrl(devboxName)
    const { default: WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://${serverUrl.replace('http://', '')}/ws`) as any

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'watch', path }))
    }

    ws.onmessage = (event: any) => {
      const fileEvent = JSON.parse(event.data)
      callback(fileEvent)
    }

    return ws
  }

  /**
   * Get monitoring data for a Devbox instance
   */
  async getMonitorData (
    devboxName: string,
    timeRange?: TimeRange
  ): Promise<MonitorData[]> {
    return await this.apiClient.getMonitorData(devboxName, timeRange)
  }

  /**
   * Close all connections and cleanup resources
   */
  async close (): Promise<void> {
    await this.connectionManager.closeAllConnections()
  }

  /**
   * Get the API client (for advanced usage)
   */
  getAPIClient (): DevboxAPI {
    return this.apiClient
  }

  /**
   * Get the connection manager (for advanced usage)
   */
  getConnectionManager (): ConnectionManager {
    return this.connectionManager
  }
}

// Re-export DevboxInstance for convenience
export { DevboxInstance } from '../devbox/DevboxInstance'
