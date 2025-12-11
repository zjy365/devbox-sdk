import { DevboxAPI } from '../api/client'
import { ContainerUrlResolver } from '../http/manager'
import { DevboxInstance } from './devbox-instance'
import type {
  DevboxCreateConfig,
  DevboxInfo,
  DevboxSDKConfig,
  MonitorData,
  TimeRange,
} from './types'

export class DevboxSDK {
  private apiClient: DevboxAPI
  private urlResolver: ContainerUrlResolver

  constructor(config: DevboxSDKConfig) {
    this.apiClient = new DevboxAPI({
      kubeconfig: config.kubeconfig,
      baseUrl: config.baseUrl,
      timeout: config.http?.timeout,
      retries: config.http?.retries,
      rejectUnauthorized: config.http?.rejectUnauthorized,
    })
    this.urlResolver = new ContainerUrlResolver(config)
    this.urlResolver.setAPIClient(this.apiClient)
  }

  async createDevbox(config: DevboxCreateConfig): Promise<DevboxInstance> {
    const devboxInfo = await this.apiClient.createDevbox(config)
    return new DevboxInstance(devboxInfo, this)
  }

  async getDevbox(name: string): Promise<DevboxInstance> {
    const devboxInfo = await this.apiClient.getDevbox(name)
    return new DevboxInstance(devboxInfo, this)
  }

  async listDevboxes(): Promise<DevboxInstance[]> {
    const devboxes = await this.apiClient.listDevboxes()
    return devboxes.map((info: DevboxInfo) => new DevboxInstance(info, this))
  }

  async getMonitorData(devboxName: string, timeRange?: TimeRange): Promise<MonitorData[]> {
    return await this.apiClient.getMonitorData(devboxName, timeRange)
  }

  async close(): Promise<void> {
    await this.urlResolver.closeAllConnections()
    console.log('[DevboxSDK] Closed all connections and cleaned up resources')
  }

  getAPIClient(): DevboxAPI {
    return this.apiClient
  }

  getUrlResolver(): ContainerUrlResolver {
    return this.urlResolver
  }
}

export { DevboxInstance } from './devbox-instance'
