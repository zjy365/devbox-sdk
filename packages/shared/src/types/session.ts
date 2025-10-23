/**
 * Session management types shared between SDK and Server
 */

/**
 * Session state
 */
export type SessionState = 'creating' | 'active' | 'idle' | 'terminating' | 'terminated'

/**
 * Session information
 */
export interface SessionInfo {
  id: string
  state: SessionState
  workingDir: string
  env: Record<string, string>
  createdAt: Date
  lastActivityAt: Date
  shellPid?: number
}

/**
 * Create session request
 */
export interface CreateSessionRequest {
  workingDir?: string
  env?: Record<string, string>
  shell?: string
}

/**
 * Create session response
 */
export interface CreateSessionResponse {
  id: string
  state: SessionState
  workingDir: string
  createdAt: string
}

/**
 * Get session request
 */
export interface GetSessionRequest {
  id: string
}

/**
 * Get session response
 */
export interface GetSessionResponse extends SessionInfo {
  createdAt: string
  lastActivityAt: string
}

/**
 * Update session environment request
 */
export interface UpdateSessionEnvRequest {
  id: string
  env: Record<string, string>
}

/**
 * Update session environment response
 */
export interface UpdateSessionEnvResponse {
  success: boolean
  id: string
  env: Record<string, string>
}

/**
 * Terminate session request
 */
export interface TerminateSessionRequest {
  id: string
}

/**
 * Terminate session response
 */
export interface TerminateSessionResponse {
  success: boolean
  id: string
  state: SessionState
}

/**
 * List sessions response
 */
export interface ListSessionsResponse {
  sessions: SessionInfo[]
  totalCount: number
}
