/**
 * Connection manager for handling HTTP connections to Devbox containers
 */

import type { DevboxSDKConfig } from '../core/types'
import { DevboxSDKError, ERROR_CODES } from '../utils/error'
import { ConnectionPool } from './pool'

export class ConnectionManager {
  private pool: ConnectionPool
  private apiClient: any // This would be injected from the SDK
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 60000 // 60 seconds

  constructor(config: DevboxSDKConfig) {
    this.pool = new ConnectionPool(config.connectionPool)
  }

  /**
   * Set the API client for resolving server URLs
   */
  setAPIClient(apiClient: any): void {
    this.apiClient = apiClient
  }

  /**
   * Execute an operation with a managed connection
   */
  async executeWithConnection<T>(
    devboxName: string,
    operation: (client: any) => Promise<T>
  ): Promise<T> {
    const serverUrl = await this.getServerUrl(devboxName)
    const client = await this.pool.getConnection(devboxName, serverUrl)

    try {
      return await operation(client)
    } catch (error) {
      // Handle connection errors and cleanup if needed
      await this.handleConnectionError(client, error)
      throw error
    } finally {
      // The connection will be automatically released by the pool
      // when it's no longer needed
    }
  }

  /**
   * Get the server URL for a Devbox instance (with caching)
   */
  async getServerUrl(devboxName: string): Promise<string> {
    if (!this.apiClient) {
      throw new DevboxSDKError(
        'API client not set. Call setAPIClient() first.',
        ERROR_CODES.INTERNAL_ERROR
      )
    }

    // Check cache first
    const cached = this.getFromCache(`url:${devboxName}`)
    if (cached) {
      return cached
    }

    try {
      const devboxInfo = await this.getDevboxInfo(devboxName)
      
      if (!devboxInfo) {
        throw new DevboxSDKError(
          `Devbox '${devboxName}' not found`,
          ERROR_CODES.DEVBOX_NOT_FOUND
        )
      }

      // Try to get URL from ports (publicAddress or privateAddress)
      if (devboxInfo.ports && devboxInfo.ports.length > 0) {
        const port = devboxInfo.ports[0]
        
        // Prefer public address
        if (port.publicAddress) {
          const url = port.publicAddress
          this.setCache(`url:${devboxName}`, url)
          return url
        }
        
        // Fallback to private address
        if (port.privateAddress) {
          const url = port.privateAddress
          this.setCache(`url:${devboxName}`, url)
          return url
        }
      }

      // Fallback to podIP if available
      if (devboxInfo.podIP) {
        const url = `http://${devboxInfo.podIP}:3000`
        this.setCache(`url:${devboxName}`, url)
        return url
      }

      throw new DevboxSDKError(
        `Devbox '${devboxName}' does not have an accessible URL`,
        ERROR_CODES.CONNECTION_FAILED
      )
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
  
  /**
   * Get Devbox info with caching
   */
  private async getDevboxInfo(devboxName: string): Promise<any> {
    // Check cache
    const cached = this.getFromCache(`devbox:${devboxName}`)
    if (cached) {
      return cached
    }

    try {
      const devboxInfo = await this.apiClient.getDevbox(devboxName)
      this.setCache(`devbox:${devboxName}`, devboxInfo)
      return devboxInfo
    } catch (error) {
      return null
    }
  }
  
  /**
   * Get value from cache if not expired
   */
  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data
  }
  
  /**
   * Set value in cache
   */
  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }
  
  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Handle connection errors and cleanup
   */
  private async handleConnectionError(client: any, error: any): Promise<void> {
    // If it's a connection-related error, we might need to clean up the connection
    if (
      error instanceof DevboxSDKError &&
      (error.code === ERROR_CODES.CONNECTION_FAILED ||
        error.code === ERROR_CODES.CONNECTION_TIMEOUT ||
        error.code === ERROR_CODES.SERVER_UNAVAILABLE)
    ) {
      // The connection pool will handle cleanup automatically
      // through health checks and connection lifecycle management
    }
  }

  /**
   * Close all connections and cleanup resources
   */
  async closeAllConnections(): Promise<void> {
    await this.pool.closeAllConnections()
    this.clearCache()
  }

  /**
   * Get connection pool statistics
   */
  getConnectionStats(): any {
    return this.pool.getStats()
  }

  /**
   * Perform health check on a specific Devbox
   */
  async checkDevboxHealth(devboxName: string): Promise<boolean> {
    try {
      const serverUrl = await this.getServerUrl(devboxName)
      const client = await this.pool.getConnection(devboxName, serverUrl)

      const response = await client.get('/health')
      return response.data?.status === 'healthy'
    } catch (error) {
      return false
    }
  }
}
