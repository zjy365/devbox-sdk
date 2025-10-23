/**
 * HTTP connection pool implementation for Devbox containers
 */

import { DevboxSDKError, ERROR_CODES } from '../utils/error'
import { DEFAULT_CONFIG } from '../core/constants'
import type {
  HTTPConnection,
  ConnectionPoolConfig,
  PoolStats,
  HealthCheckResult,
  ConnectionStrategy
} from './types'

/**
 * Simple HTTP client for container communication
 */
class ContainerHTTPClient {
  private baseUrl: string
  private timeout: number

  constructor (baseUrl: string, timeout: number = 30000) {
    this.baseUrl = baseUrl
    this.timeout = timeout
  }

  async get (path: string, options?: any): Promise<any> {
    return this.request('GET', path, options)
  }

  async post (path: string, options?: any): Promise<any> {
    return this.request('POST', path, options)
  }

  async put (path: string, options?: any): Promise<any> {
    return this.request('PUT', path, options)
  }

  async delete (path: string, options?: any): Promise<any> {
    return this.request('DELETE', path, options)
  }

  private async request (method: string, path: string, options?: any): Promise<any> {
    const url = new URL(path, this.baseUrl)

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    }

    if (options?.data) {
      fetchOptions.body = JSON.stringify(options.data)
    }

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url.toString(), {
        ...fetchOptions,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new DevboxSDKError(
          `HTTP ${response.status}: ${response.statusText}`,
          ERROR_CODES.CONNECTION_FAILED,
          { status: response.status, statusText: response.statusText }
        )
      }

      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        return {
          data: await response.json(),
          arrayBuffer: () => response.arrayBuffer(),
          headers: Object.fromEntries(response.headers.entries())
        }
      } else {
        return response.arrayBuffer()
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  async close (): Promise<void> {
    // No explicit cleanup needed for fetch-based client
  }
}

export class ConnectionPool {
  private connections: Map<string, HTTPConnection[]> = new Map()
  private config: Required<ConnectionPoolConfig>
  private healthCheckInterval?: NodeJS.Timeout
  private stats: PoolStats
  private strategy: ConnectionStrategy

  constructor (config: ConnectionPoolConfig = {}) {
    this.config = {
      maxSize: config.maxSize || DEFAULT_CONFIG.CONNECTION_POOL.MAX_SIZE,
      connectionTimeout: config.connectionTimeout || DEFAULT_CONFIG.CONNECTION_POOL.CONNECTION_TIMEOUT,
      keepAliveInterval: config.keepAliveInterval || DEFAULT_CONFIG.CONNECTION_POOL.KEEP_ALIVE_INTERVAL,
      healthCheckInterval: config.healthCheckInterval || DEFAULT_CONFIG.CONNECTION_POOL.HEALTH_CHECK_INTERVAL,
      maxIdleTime: config.maxIdleTime || 300000 // 5 minutes
    }

    this.strategy = 'least-used'
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      healthyConnections: 0,
      unhealthyConnections: 0,
      reuseRate: 0,
      averageLifetime: 0,
      bytesTransferred: 0,
      totalOperations: 0
    }

    this.startHealthMonitoring()
  }

  /**
   * Get a connection from the pool or create a new one
   */
  async getConnection (devboxName: string, serverUrl: string): Promise<ContainerHTTPClient> {
    const poolKey = this.getPoolKey(devboxName, serverUrl)
    let pool = this.connections.get(poolKey)

    if (!pool) {
      pool = []
      this.connections.set(poolKey, pool)
    }

    // Try to find an existing healthy, inactive connection
    let connection = this.findAvailableConnection(pool)

    if (!connection && pool.length < this.config.maxSize) {
      // Create new connection if pool is not full
      connection = await this.createConnection(devboxName, serverUrl)
      pool.push(connection)
    }

    if (!connection) {
      throw new DevboxSDKError(
        `Connection pool exhausted for ${devboxName}`,
        ERROR_CODES.CONNECTION_POOL_EXHAUSTED
      )
    }

    // Perform health check before using
    if (!await this.isConnectionHealthy(connection)) {
      await this.removeConnection(connection)
      // Retry with a new connection
      return this.getConnection(devboxName, serverUrl)
    }

    connection.isActive = true
    connection.lastUsed = Date.now()
    connection.useCount++
    this.stats.totalOperations++

    return connection.client
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection (connectionId: string): void {
    const connection = this.findConnectionById(connectionId)
    if (connection) {
      connection.isActive = false
      connection.lastUsed = Date.now()
    }
  }

  /**
   * Remove a connection from the pool
   */
  async removeConnection (connection: HTTPConnection): Promise<void> {
    const poolKey = this.getPoolKey(connection.devboxName, connection.serverUrl)
    const pool = this.connections.get(poolKey)

    if (pool) {
      const index = pool.findIndex(conn => conn.id === connection.id)
      if (index !== -1) {
        pool.splice(index, 1)
        await connection.client.close()
        this.updateStats()
      }
    }
  }

  /**
   * Close all connections in the pool
   */
  async closeAllConnections (): Promise<void> {
    const closePromises: Promise<void>[] = []

    for (const pool of this.connections.values()) {
      for (const connection of pool) {
        closePromises.push(connection.client.close())
      }
    }

    await Promise.all(closePromises)
    this.connections.clear()

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.updateStats()
  }

  /**
   * Get pool statistics
   */
  getStats (): PoolStats {
    return { ...this.stats }
  }

  private findAvailableConnection (pool: HTTPConnection[]): HTTPConnection | null {
    const healthyConnections = pool.filter(conn =>
      !conn.isActive && conn.healthStatus === 'healthy'
    )

    if (healthyConnections.length === 0) {
      return null
    }

    switch (this.strategy) {
      case 'least-used':
        return healthyConnections.reduce((min, conn) =>
          conn.useCount < min.useCount ? conn : min
        )
      case 'random':
        return healthyConnections[Math.floor(Math.random() * healthyConnections.length)] || null
      case 'round-robin':
      default:
        return healthyConnections[0] || null
    }
  }

  private async createConnection (devboxName: string, serverUrl: string): Promise<HTTPConnection> {
    const client = new ContainerHTTPClient(serverUrl, this.config.connectionTimeout)

    const connection: HTTPConnection = {
      id: this.generateConnectionId(),
      client,
      devboxName,
      serverUrl,
      lastUsed: Date.now(),
      isActive: false,
      healthStatus: 'unknown',
      createdAt: Date.now(),
      useCount: 0
    }

    // Perform initial health check
    const healthResult = await this.performHealthCheck(client)
    connection.healthStatus = healthResult.isHealthy ? 'healthy' : 'unhealthy'

    return connection
  }

  private async performHealthCheck (client: ContainerHTTPClient): Promise<HealthCheckResult> {
    const startTime = Date.now()

    try {
      await client.get('/health', { timeout: 5000 })
      return {
        isHealthy: true,
        responseTime: Date.now() - startTime,
        timestamp: Date.now()
      }
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      }
    }
  }

  private async isConnectionHealthy (connection: HTTPConnection): Promise<boolean> {
    // Quick check based on last known status and time
    const timeSinceLastCheck = Date.now() - connection.lastUsed
    if (connection.healthStatus === 'healthy' && timeSinceLastCheck < this.config.keepAliveInterval) {
      return true
    }

    // Perform actual health check
    const result = await this.performHealthCheck(connection.client)
    connection.healthStatus = result.isHealthy ? 'healthy' : 'unhealthy'
    connection.lastUsed = Date.now()

    return result.isHealthy
  }

  private startHealthMonitoring (): void {
    if (!this.config.healthCheckInterval) {
      return
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performRoutineHealthChecks()
      await this.cleanupIdleConnections()
      this.updateStats()
    }, this.config.healthCheckInterval)
  }

  private async performRoutineHealthChecks (): Promise<void> {
    const healthCheckPromises: Promise<void>[] = []

    for (const pool of this.connections.values()) {
      for (const connection of pool) {
        if (!connection.isActive) {
          healthCheckPromises.push(
            this.performHealthCheck(connection.client).then(result => {
              connection.healthStatus = result.isHealthy ? 'healthy' : 'unhealthy'
            })
          )
        }
      }
    }

    await Promise.all(healthCheckPromises)
  }

  private async cleanupIdleConnections (): Promise<void> {
    const now = Date.now()
    const connectionsToRemove: HTTPConnection[] = []

    for (const pool of this.connections.values()) {
      for (const connection of pool) {
        if (!connection.isActive && (now - connection.lastUsed) > this.config.maxIdleTime) {
          connectionsToRemove.push(connection)
        }
      }
    }

    for (const connection of connectionsToRemove) {
      await this.removeConnection(connection)
    }
  }

  private updateStats (): void {
    let totalConnections = 0
    let activeConnections = 0
    let healthyConnections = 0
    let unhealthyConnections = 0
    let totalLifetime = 0
    let totalUseCount = 0

    for (const pool of this.connections.values()) {
      for (const connection of pool) {
        totalConnections++
        if (connection.isActive) activeConnections++
        if (connection.healthStatus === 'healthy') healthyConnections++
        if (connection.healthStatus === 'unhealthy') unhealthyConnections++
        totalLifetime += Date.now() - connection.createdAt
        totalUseCount += connection.useCount
      }
    }

    this.stats = {
      totalConnections,
      activeConnections,
      healthyConnections,
      unhealthyConnections,
      reuseRate: totalUseCount > 0 ? (totalUseCount - totalConnections) / totalUseCount : 0,
      averageLifetime: totalConnections > 0 ? totalLifetime / totalConnections : 0,
      bytesTransferred: this.stats.bytesTransferred, // Updated elsewhere
      totalOperations: this.stats.totalOperations
    }
  }

  private findConnectionById (connectionId: string): HTTPConnection | undefined {
    for (const pool of this.connections.values()) {
      const connection = pool.find(conn => conn.id === connectionId)
      if (connection) return connection
    }
    return undefined
  }

  private getPoolKey (devboxName: string, serverUrl: string): string {
    return `${devboxName}:${serverUrl}`
  }

  private generateConnectionId (): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}
