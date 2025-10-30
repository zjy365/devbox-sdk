/**
 * Session Handler
 * Handles persistent shell session operations
 */

import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import { errorResponse, notFoundResponse, successResponse } from '../core/response-builder'
import type { SessionManager } from '../session/manager'
import type {
  CreateSessionRequest,
  SessionInfo,
  TerminateSessionRequest,
  UpdateSessionEnvRequest,
} from '../types/server'

export class SessionHandler {
  private sessionManager: SessionManager

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
  }

  /**
   * Create a new session
   */
  async handleCreateSession(request: CreateSessionRequest): Promise<Response> {
    try {
      const sessionInfo = await this.sessionManager.createSession({
        workingDir: request.workingDir,
        env: request.env,
        shell: request.shell,
      })

      return successResponse(sessionInfo, 201)
    } catch (error) {
      return errorResponse(
        new DevboxError('Failed to create session', ErrorCode.INTERNAL_ERROR, {
          cause: error as Error,
        })
      )
    }
  }

  /**
   * Get session by ID
   */
  async handleGetSession(id: string): Promise<Response> {
    try {
      const session = this.sessionManager.getSession(id)
      if (!session) {
        return notFoundResponse(`Session ${id} not found`)
      }

      const sessionInfo = session.getStatus()
      return successResponse(sessionInfo)
    } catch (error) {
      return errorResponse(
        new DevboxError('Failed to get session', ErrorCode.INTERNAL_ERROR, {
          cause: error as Error,
        })
      )
    }
  }

  /**
   * Update session environment variables
   */
  async handleUpdateSessionEnv(request: UpdateSessionEnvRequest): Promise<Response> {
    try {
      const success = await this.sessionManager.updateSessionEnv(request.id, request.env)
      if (!success) {
        return notFoundResponse(`Session ${request.id} not found`)
      }

      return successResponse({ success: true })
    } catch (error) {
      return errorResponse(
        new DevboxError('Failed to update session environment', ErrorCode.INTERNAL_ERROR, {
          cause: error as Error,
        })
      )
    }
  }

  /**
   * Terminate a session
   */
  async handleTerminateSession(request: TerminateSessionRequest): Promise<Response> {
    try {
      const success = await this.sessionManager.terminateSession(request.id)
      if (!success) {
        return notFoundResponse(`Session ${request.id} not found`)
      }

      return successResponse({ success: true })
    } catch (error) {
      return errorResponse(
        new DevboxError('Failed to terminate session', ErrorCode.INTERNAL_ERROR, {
          cause: error as Error,
        })
      )
    }
  }

  /**
   * List all sessions
   */
  async handleListSessions(): Promise<Response> {
    try {
      const sessions = this.sessionManager.getAllSessions()
      return successResponse({ sessions })
    } catch (error) {
      return errorResponse(
        new DevboxError('Failed to list sessions', ErrorCode.INTERNAL_ERROR, {
          cause: error as Error,
        })
      )
    }
  }

  /**
   * Execute command in session
   */
  async handleExecuteCommand(sessionId: string, command: string): Promise<Response> {
    try {
      const session = this.sessionManager.getSession(sessionId)
      if (!session) {
        return notFoundResponse(`Session ${sessionId} not found`)
      }

      const result = await session.execute(command)
      return successResponse(result)
    } catch (error) {
      return errorResponse(
        new DevboxError('Failed to execute command in session', ErrorCode.INTERNAL_ERROR, {
          cause: error as Error,
        })
      )
    }
  }

  /**
   * Change working directory in session
   */
  async handleChangeDirectory(sessionId: string, path: string): Promise<Response> {
    try {
      const session = this.sessionManager.getSession(sessionId)
      if (!session) {
        return notFoundResponse(`Session ${sessionId} not found`)
      }

      await session.changeDirectory(path)
      return successResponse({ success: true, workingDir: path })
    } catch (error) {
      return errorResponse(
        new DevboxError('Failed to change directory in session', ErrorCode.INTERNAL_ERROR, {
          cause: error as Error,
        })
      )
    }
  }
}
