import { DevboxAPI } from '../api/client'
import { ContainerUrlResolver } from '../http/manager'
import { DevboxInstance } from './devbox-instance'
import type {
  DevboxCreateConfig,
  DevboxCreateOptions,
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

  /**
   * Create a new Devbox instance (async, returns immediately without waiting)
   * @param config Devbox creation configuration
   * @returns DevboxInstance (may not be ready immediately - use waitForReady() if needed)
   * @description This method returns immediately after creating the Devbox without waiting for it to be ready.
   * The returned instance may not be ready for file operations or commands.
   * Use `createDevbox()` (default behavior) or call `waitForReady()` on the instance if you need to wait.
   */
  async createDevboxAsync(config: DevboxCreateConfig): Promise<DevboxInstance> {
    const devboxInfo = await this.apiClient.createDevbox(config)
    return new DevboxInstance(devboxInfo, this)
  }

  /**
   * Create a new Devbox instance
   * @param config Devbox creation configuration
   * @param options Creation options (waitUntilReady defaults to true)
   * @returns DevboxInstance (ready for use if waitUntilReady is true)
   * @description By default, this method waits for the Devbox to be fully ready before returning.
   * Set `options.waitUntilReady = false` to return immediately without waiting.
   */
  async createDevbox(
    config: DevboxCreateConfig,
    options: DevboxCreateOptions = {}
  ): Promise<DevboxInstance> {
    const {
      waitUntilReady = true,
      timeout = 180000, // 3 minutes
      checkInterval,
      useExponentialBackoff = true,
      initialCheckInterval = 200, // 0.2 seconds - faster initial checks
      maxCheckInterval = 5000, // 5 seconds
      backoffMultiplier = 1.5,
    } = options

    const instance = await this.createDevboxAsync(config)

    if (waitUntilReady) {
      await instance.waitForReady({
        timeout,
        checkInterval,
        useExponentialBackoff,
        initialCheckInterval,
        maxCheckInterval,
        backoffMultiplier,
      })
    }

    return instance
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
  }

  getAPIClient(): DevboxAPI {
    return this.apiClient
  }

  getUrlResolver(): ContainerUrlResolver {
    return this.urlResolver
  }
}

export { DevboxInstance } from './devbox-instance'
