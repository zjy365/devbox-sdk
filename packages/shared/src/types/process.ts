/**
 * Process execution types shared between SDK and Server
 */

/**
 * Process status
 */
export type ProcessStatus = 'running' | 'completed' | 'failed' | 'timeout' | 'killed'

/**
 * Process execution request
 */
export interface ProcessExecRequest {
  command: string
  shell?: string
  cwd?: string
  env?: Record<string, string>
  timeout?: number
  sessionId?: string
}

/**
 * Process execution result
 */
export interface ProcessExecResult {
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  signal?: string
  timedOut?: boolean
}

/**
 * Process execution response
 */
export interface ProcessExecResponse extends ProcessExecResult {
  success: boolean
  timestamp: string
}

/**
 * Background process information
 */
export interface ProcessInfo {
  id: string
  pid?: number
  command: string
  status: ProcessStatus
  startTime: Date
  endTime?: Date
  exitCode?: number
  sessionId?: string
}

/**
 * Start process request
 */
export interface StartProcessRequest {
  command: string
  shell?: string
  cwd?: string
  env?: Record<string, string>
  sessionId?: string
}

/**
 * Start process response
 */
export interface StartProcessResponse {
  id: string
  pid?: number
  command: string
  status: ProcessStatus
  startTime: string
}

/**
 * Process status request
 */
export interface ProcessStatusRequest {
  id: string
}

/**
 * Process status response
 */
export interface ProcessStatusResponse {
  id: string
  pid?: number
  command: string
  status: ProcessStatus
  startTime: string
  endTime?: string
  exitCode?: number
  stdout?: string
  stderr?: string
}

/**
 * Kill process request
 */
export interface KillProcessRequest {
  id: string
  signal?: string
}

/**
 * Kill process response
 */
export interface KillProcessResponse {
  success: boolean
  id: string
  signal: string
}

/**
 * Process logs request
 */
export interface ProcessLogsRequest {
  id: string
  tail?: number
  follow?: boolean
}

/**
 * Process logs response
 */
export interface ProcessLogsResponse {
  id: string
  stdout: string
  stderr: string
  isComplete: boolean
}
