/**
 * Core type definitions for the Devbox SDK
 */

export interface DevboxSDKConfig {
  /** kubeconfig content for authentication */
  kubeconfig: string
  /** Optional base URL for the Devbox API */
  baseUrl?: string
  /** Optional mock server URL for development/testing */
  mockServerUrl?: string
  /** HTTP client configuration */
  http?: HttpClientConfig
}

export interface HttpClientConfig {
  /** Request timeout in milliseconds */
  timeout?: number
  /** Number of retry attempts */
  retries?: number
  /** Proxy configuration */
  proxy?: string
  /** Allow self-signed certificates (ONLY for development/testing, NOT recommended for production) */
  rejectUnauthorized?: boolean
}

import type { DevboxRuntime } from '../api/types'

export interface DevboxCreateConfig {
  /** Name of the Devbox instance */
  name: string
  /** Runtime environment (node.js, python, go, etc.) */
  runtime: DevboxRuntime
  /** Resource allocation */
  resource: ResourceInfo
  /** Port configurations */
  ports?: PortConfig[]
  /** Environment variables */
  env?: Record<string, string>
}

export interface ResourceInfo {
  /** CPU cores allocated */
  cpu: number
  /** Memory allocated in GB */
  memory: number
}

export interface PortConfig {
  /** Port number */
  number: number
  /** Protocol (HTTP, TCP, etc.) */
  protocol: string
}

export interface DevboxInfo {
  /** Devbox instance name */
  name: string
  /** Current status */
  status: string
  /** Runtime environment */
  runtime: DevboxRuntime
  /** Resource information */
  resources: ResourceInfo
  /** Pod IP address */
  podIP?: string
  /** SSH connection information */
  ssh?: SSHInfo
  /** Port configurations */
  ports?: Array<{
    number: number
    portName: string
    protocol: string
    serviceName: string
    privateAddress: string
    privateHost: string
    networkName: string
    publicHost?: string
    publicAddress?: string
    customDomain?: string
  }>
  /** Agent server configuration */
  agentServer?: {
    url: string
    token: string
  }
}

export interface SSHInfo {
  /** SSH host */
  host: string
  /** SSH port */
  port: number
  /** SSH username */
  user: string
  /** SSH private key */
  privateKey: string
}

export interface FileMap {
  [path: string]: Buffer | string
}

export interface WriteOptions {
  /** File encoding */
  encoding?: string
  /** File permissions */
  mode?: number
  /** Create parent directories if they don't exist */
  createDirs?: boolean
}

export interface ReadOptions {
  /** File encoding */
  encoding?: string
  /** Offset for reading */
  offset?: number
  /** Length to read */
  length?: number
}

export interface BatchUploadOptions {
  /** Maximum concurrent uploads */
  concurrency?: number
  /** Chunk size for large files */
  chunkSize?: number
  /** Progress callback */
  onProgress?: (progress: TransferProgress) => void
}

export interface TransferProgress {
  /** Number of files processed */
  processed: number
  /** Total number of files */
  total: number
  /** Bytes transferred */
  bytesTransferred: number
  /** Total bytes to transfer */
  totalBytes: number
  /** Transfer progress percentage */
  progress: number
}

export interface TransferResult {
  /** Transfer was successful */
  success: boolean
  /** Upload results for each file */
  results: Array<{
    path: string
    success: boolean
    size?: number
    error?: string
  }>
  /** Total number of files */
  totalFiles: number
  /** Number of successfully uploaded files */
  successCount: number
}

export interface TransferError {
  /** File path */
  path: string
  /** Error message */
  error: string
  /** Error code */
  code: string
}

// File move options
export interface MoveFileOptions {
  source: string
  destination: string
  overwrite?: boolean
}

// File move response
export type MoveFileResponse = Record<string, never>

// File rename options
export interface RenameFileOptions {
  oldPath: string
  newPath: string
}

// File rename response
export type RenameFileResponse = Record<string, never>

// File download options
export interface DownloadFileOptions {
  paths: string[]
  format?: 'tar.gz' | 'tar' | 'multipart' | 'direct'
}

// Ports response
export interface PortsResponse {
  ports: number[]
  lastUpdatedAt: number
}

// Temporarily disabled - ws module removed
// export interface FileChangeEvent {
//   /** Event type (add, change, unlink) */
//   type: 'add' | 'change' | 'unlink'
//   /** File path */
//   path: string
//   /** Event timestamp */
//   timestamp: number
// }

// /**
//  * WebSocket watch request message
//  */
// export interface WatchRequest {
//   type: 'watch'
//   path: string
//   recursive?: boolean
// }

// /**
//  * WebSocket message for file watching
//  */
// export interface WebSocketMessage {
//   type: 'watch' | 'unwatch' | 'ping' | 'pong'
//   path?: string
//   data?: unknown
// }

// /**
//  * File watch WebSocket interface
//  */
// export interface FileWatchWebSocket {
//   onopen: () => void
//   onmessage: (event: { data: string | Buffer | ArrayBuffer }) => void
//   onerror: (error: Event) => void
//   onclose: (event: { code?: number; reason?: string; wasClean?: boolean }) => void
//   send(data: string): void
//   close(code?: number, reason?: string): void
//   readyState: number
// }

export interface TimeRange {
  /** Start timestamp */
  start: number
  /** End timestamp */
  end: number
  /** Step interval */
  step?: string
}

export interface MonitorData {
  /** CPU usage percentage */
  cpu: number
  /** Memory usage percentage */
  memory: number
  /** Network I/O */
  network: {
    /** Bytes received */
    bytesIn: number
    /** Bytes sent */
    bytesOut: number
  }
  /** Disk usage */
  disk: {
    /** Used bytes */
    used: number
    /** Total bytes */
    total: number
  }
  /** Timestamp */
  timestamp: number
}

// Process execution request options
export interface ProcessExecOptions {
  /** Command to execute */
  command: string
  /** Command arguments */
  args?: string[]
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Shell to use for execution */
  shell?: string
  /** Timeout in seconds */
  timeout?: number
}

// Code execution options
export interface CodeRunOptions {
  /** Language to use ('node' | 'python'). If not specified, will auto-detect */
  language?: 'node' | 'python'
  /** Command line arguments */
  argv?: string[]
  /** Environment variables */
  env?: Record<string, string>
  /** Working directory */
  cwd?: string
  /** Timeout in seconds */
  timeout?: number
}

// Asynchronous execution response
export interface ProcessExecResponse {
  success: boolean
  processId: string
  pid: number
  processStatus: string
  exitCode?: number
}

// Synchronous execution response
export interface SyncExecutionResponse {
  success: boolean
  stdout: string
  stderr: string
  exitCode?: number
  durationMs: number
  startTime: number
  endTime: number
}

// Process information
export interface ProcessInfo {
  processId: string
  pid: number
  command: string
  processStatus: string
  startTime: number
  endTime?: number
  exitCode?: number
}

// Process list response
export interface ListProcessesResponse {
  success: boolean
  processes: ProcessInfo[]
}

// Process status response
export interface GetProcessStatusResponse {
  success: boolean
  processId: string
  pid: number
  processStatus: string
  // startedAt: number // Unix timestamp (seconds)
}

// Process logs response
export interface GetProcessLogsResponse {
  success: boolean
  processId: string
  logs: string[]
}

// Kill process options
export interface KillProcessOptions {
  signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT'
}

// Legacy types (deprecated, kept for backward compatibility during migration)
export interface CommandResult {
  /** Command exit code */
  exitCode: number
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Execution duration in milliseconds */
  duration: number
  /** Process ID */
  pid?: number
}

export interface ProcessStatus {
  /** Process ID */
  pid: number
  /** Process state */
  state: 'running' | 'completed' | 'failed' | 'unknown'
  /** Exit code if completed */
  exitCode?: number
  /** CPU usage */
  cpu?: number
  /** Memory usage */
  memory?: number
  /** Start time */
  startTime: number
  /** Running time in milliseconds */
  runningTime: number
}

export type DevboxStatus = 'Creating' | 'Running' | 'Stopped' | 'Error' | 'Deleting' | 'Unknown'

// Git authentication options
export interface GitAuth {
  /** Username for authentication */
  username?: string
  /** Password for authentication */
  password?: string
  /** Personal access token or API token */
  token?: string
  /** SSH key path (for SSH authentication) */
  sshKey?: string
}

// Git clone options
export interface GitCloneOptions {
  /** Repository URL */
  url: string
  /** Target directory to clone into */
  targetDir?: string
  /** Branch to clone */
  branch?: string
  /** Specific commit to checkout */
  commit?: string
  /** Shallow clone depth */
  depth?: number
  /** Authentication options */
  auth?: GitAuth
}

// Git pull options
export interface GitPullOptions {
  /** Remote name (default: origin) */
  remote?: string
  /** Branch to pull (default: current branch) */
  branch?: string
  /** Authentication options */
  auth?: GitAuth
}

// Git push options
export interface GitPushOptions {
  /** Remote name (default: origin) */
  remote?: string
  /** Branch to push (default: current branch) */
  branch?: string
  /** Authentication options */
  auth?: GitAuth
  /** Force push */
  force?: boolean
}

// Git branch information
export interface GitBranchInfo {
  /** Branch name */
  name: string
  /** Whether this is the current branch */
  isCurrent: boolean
  /** Whether this is a remote branch */
  isRemote: boolean
  /** Latest commit hash */
  commit: string
  /** Number of commits ahead of remote */
  ahead?: number
  /** Number of commits behind remote */
  behind?: number
}

// Git repository status
export interface GitStatus {
  /** Current branch name */
  currentBranch: string
  /** Whether working directory is clean */
  isClean: boolean
  /** Number of commits ahead of remote */
  ahead: number
  /** Number of commits behind remote */
  behind: number
  /** Staged files */
  staged: string[]
  /** Modified files */
  modified: string[]
  /** Untracked files */
  untracked: string[]
  /** Deleted files */
  deleted: string[]
}
