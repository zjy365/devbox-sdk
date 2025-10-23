/**
 * Connection pool type definitions
 */

export interface HTTPConnection {
  /** Unique connection identifier */
  id: string
  /** HTTP client instance */
  client: any
  /** Target Devbox name */
  devboxName: string
  /** Server URL */
  serverUrl: string
  /** Last used timestamp */
  lastUsed: number
  /** Connection active status */
  isActive: boolean
  /** Health status */
  healthStatus: 'healthy' | 'unhealthy' | 'unknown'
  /** Connection creation time */
  createdAt: number
  /** Number of times this connection was used */
  useCount: number
}

export interface ConnectionPoolConfig {
  /** Maximum number of connections per pool */
  maxSize?: number
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
  /** Keep-alive interval in milliseconds */
  keepAliveInterval?: number
  /** Health check interval in milliseconds */
  healthCheckInterval?: number
  /** Maximum idle time before connection is closed */
  maxIdleTime?: number
}

export interface PoolStats {
  /** Total number of connections in pool */
  totalConnections: number
  /** Number of active connections */
  activeConnections: number
  /** Number of healthy connections */
  healthyConnections: number
  /** Number of unhealthy connections */
  unhealthyConnections: number
  /** Connection reuse rate */
  reuseRate: number
  /** Average connection lifetime in milliseconds */
  averageLifetime: number
  /** Total bytes transferred */
  bytesTransferred: number
  /** Total operations performed */
  totalOperations: number
}

export interface HealthCheckResult {
  /** Connection health status */
  isHealthy: boolean
  /** Response time in milliseconds */
  responseTime: number
  /** Error message if unhealthy */
  error?: string
  /** Check timestamp */
  timestamp: number
}

export type ConnectionStrategy = 'round-robin' | 'least-used' | 'random'
