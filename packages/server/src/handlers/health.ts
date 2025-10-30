/**
 * Health Handler
 * Handles health checks and server metrics
 */

import { successResponse, errorResponse } from '../core/response-builder'
import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import { SessionManager } from '../session/manager'
import { createLogger, type Logger } from '@sealos/devbox-shared/logger'

export interface ServerMetrics {
  uptime: number
  memory: {
    used: number
    total: number
    percentage: number
  }
  sessions: {
    total: number
    active: number
  }
  processes: {
    total: number
    running: number
  }
  timestamp: number
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
  checks: {
    filesystem: boolean
    sessions: boolean
    memory: boolean
  }
}

export class HealthHandler {
  private sessionManager: SessionManager
  private logger: Logger
  private startTime: number

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
    this.logger = createLogger()
    this.startTime = Date.now()
  }

  /**
   * Handle health check request
   */
  async handleHealth(): Promise<Response> {
    try {
      const checks = await this.performHealthChecks()
      const isHealthy = Object.values(checks).every(check => check === true)

      const healthStatus: HealthStatus = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        checks
      }

      return successResponse(healthStatus)
    } catch (error) {
      this.logger.error('Health check failed:', error as Error)
      return errorResponse(
        new DevboxError(
          'Health check failed',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }

  /**
   * Handle metrics request
   */
  async handleMetrics(): Promise<Response> {
    try {
      const metrics = await this.collectMetrics()
      return successResponse(metrics)
    } catch (error) {
      this.logger.error('Failed to collect metrics:', error as Error)
      return errorResponse(
        new DevboxError(
          'Failed to collect metrics',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }

  /**
   * Perform various health checks
   */
  private async performHealthChecks(): Promise<{
    filesystem: boolean
    sessions: boolean
    memory: boolean
  }> {
    const checks = {
      filesystem: false,
      sessions: false,
      memory: false
    }

    try {
      // Check filesystem access
      await Bun.write('/tmp/health-check', 'test')
      await Bun.file('/tmp/health-check').text()
      checks.filesystem = true
    } catch (error) {
      this.logger.warn('Filesystem health check failed:', { error: error as Error })
    }

    try {
      // Check session manager
      const sessionCount = this.sessionManager.getSessionCount()
      checks.sessions = true
    } catch (error) {
      this.logger.warn('Session health check failed:', { error: error as Error })
    }

    try {
      // Check memory usage
      const memUsage = process.memoryUsage()
      const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100
      checks.memory = memPercentage < 90 // Consider unhealthy if >90% memory used
    } catch (error) {
      this.logger.warn('Memory health check failed:', { error: error as Error })
    }

    return checks
  }

  /**
   * Collect server metrics
   */
  private async collectMetrics(): Promise<ServerMetrics> {
    const memUsage = process.memoryUsage()
    const sessions = this.sessionManager.getAllSessions()
    const activeSessions = sessions.filter(s => s.status === 'active')

    return {
      uptime: process.uptime(),
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      sessions: {
        total: sessions.length,
        active: activeSessions.length
      },
      processes: {
        total: 0, // TODO: Implement process tracking
        running: 0
      },
      timestamp: Date.now()
    }
  }

  /**
   * Get detailed health information
   */
  async getDetailedHealth(): Promise<Response> {
    try {
      const checks = await this.performHealthChecks()
      const metrics = await this.collectMetrics()
      const sessions = this.sessionManager.getAllSessions()

      const detailedHealth = {
        status: Object.values(checks).every(check => check === true) ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        checks,
        metrics,
        sessions: sessions.map(s => ({
          id: s.id,
          status: s.status,
          workingDir: s.workingDir,
          lastActivity: s.lastActivity
        }))
      }

      return successResponse(detailedHealth)
    } catch (error) {
      this.logger.error('Failed to get detailed health:', error as Error)
      return errorResponse(
        new DevboxError(
          'Failed to get detailed health',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }
}
