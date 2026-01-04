/**
 * Server-specific types shared between SDK and Server
 */

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  uptime: number
  version: string
  timestamp: string
  checks?: {
    filesystem?: boolean
    memory?: boolean
    sessions?: boolean
  }
}

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number
  host: string
  workspaceDir: string
  maxFileSize: number
  // Temporarily disabled - ws module removed
  // enableFileWatch: boolean
  // enableWebSocket: boolean
}

/**
 * Server metrics
 */
export interface ServerMetrics {
  requestsTotal: number
  requestsActive: number
  filesUploaded: number
  filesDownloaded: number
  bytesTransferred: number
  sessionsActive: number
  processesActive: number
  uptime: number
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
}
