/**
 * Session Manager
 * Manages multiple persistent shell sessions
 */

import { Session } from './session'
import { createLogger, type Logger } from '@sealos/devbox-shared/logger'

export interface SessionConfig {
  workingDir?: string
  env?: Record<string, string>
  shell?: string
}

export interface SessionInfo {
  id: string
  status: 'active' | 'terminated'
  workingDir: string
  env: Record<string, string>
  createdAt: number
  lastActivity: number
}

export class SessionManager {
  private sessions = new Map<string, Session>()
  private logger: Logger
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    this.logger = createLogger()
    this.cleanupInterval = setInterval(() => this.cleanupSessions(), 60000) // 1 minute
  }

  /**
   * Create a new session
   */
  async createSession(config: SessionConfig = {}): Promise<SessionInfo> {
    const id = this.generateSessionId()
    const session = new Session(id, {
      workingDir: config.workingDir || '/workspace',
      env: config.env || {},
      shell: config.shell || 'bash'
    })

    this.sessions.set(id, session)
    
    this.logger.info(`Created session ${id}`)
    
    return {
      id,
      status: 'active',
      workingDir: session.workingDir,
      env: session.env,
      createdAt: Date.now(),
      lastActivity: Date.now()
    }
  }

  /**
   * Get session by ID
   */
  getSession(id: string): Session | null {
    return this.sessions.get(id) || null
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      status: session.isActive ? 'active' : 'terminated',
      workingDir: session.workingDir,
      env: session.env,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    }))
  }

  /**
   * Terminate a session
   */
  async terminateSession(id: string): Promise<boolean> {
    const session = this.sessions.get(id)
    if (!session) {
      return false
    }

    await session.terminate()
    this.sessions.delete(id)
    
    this.logger.info(`Terminated session ${id}`)
    return true
  }

  /**
   * Update session environment variables
   */
  async updateSessionEnv(id: string, env: Record<string, string>): Promise<boolean> {
    const session = this.sessions.get(id)
    if (!session) {
      return false
    }

    await session.updateEnv(env)
    this.logger.info(`Updated environment for session ${id}`)
    return true
  }

  /**
   * Cleanup inactive sessions
   */
  private cleanupSessions(): void {
    const now = Date.now()
    const maxIdleTime = 30 * 60 * 1000 // 30 minutes

    for (const [id, session] of this.sessions) {
      if (!session.isActive || (now - session.lastActivity) > maxIdleTime) {
        this.logger.info(`Cleaning up inactive session ${id}`)
        session.terminate()
        this.sessions.delete(id)
      }
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    clearInterval(this.cleanupInterval)
    
    for (const [id, session] of this.sessions) {
      await session.terminate()
    }
    
    this.sessions.clear()
    this.logger.info('Cleaned up all sessions')
  }
}

