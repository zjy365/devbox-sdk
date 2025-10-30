/**
 * Server Type Definitions
 */

export interface ServerConfig {
  port: number
  host?: string
  workspacePath: string
  enableCors: boolean
  maxFileSize: number
}

export interface WriteFileRequest {
  path: string
  content: string
  encoding?: 'utf8' | 'base64' | 'binary' | 'hex'
  permissions?: string
}

export interface ReadFileRequest {
  path: string
  encoding?: 'utf8' | 'base64' | 'binary' | 'hex'
}

export interface BatchUploadRequest {
  files: Array<{
    path: string
    content: string
    encoding?: 'utf8' | 'base64' | 'binary' | 'hex'
  }>
}

export interface FileOperationResult {
  path: string
  success: boolean
  size?: number
  error?: string
}

export interface ProcessExecRequest {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  shell?: string
  timeout?: number
}

export interface ProcessStatusResponse {
  pid: number
  status: 'running' | 'completed' | 'failed'
  exitCode?: number
  stdout?: string
  stderr?: string
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  timestamp: number
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
}

// Session types
export interface CreateSessionRequest {
  workingDir?: string
  env?: Record<string, string>
  shell?: string
}

export interface UpdateSessionEnvRequest {
  id: string
  env: Record<string, string>
}

export interface TerminateSessionRequest {
  id: string
}

export interface SessionInfo {
  id: string
  status: 'active' | 'terminated'
  workingDir: string
  env: Record<string, string>
  createdAt: number
  lastActivity: number
}

export interface SessionExecRequest {
  sessionId: string
  command: string
}

export interface SessionExecResponse {
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

export interface SessionChangeDirRequest {
  sessionId: string
  path: string
}
