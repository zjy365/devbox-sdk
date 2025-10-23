/**
 * Core type definitions for the Devbox SDK
 */

export interface DevboxSDKConfig {
  /** kubeconfig content for authentication */
  kubeconfig: string
  /** Optional base URL for the Devbox API */
  baseUrl?: string
  /** Connection pool configuration */
  connectionPool?: ConnectionPoolConfig
  /** HTTP client configuration */
  http?: HttpClientConfig
}

export interface ConnectionPoolConfig {
  /** Maximum number of connections in the pool */
  maxSize?: number
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
  /** Keep-alive interval in milliseconds */
  keepAliveInterval?: number
  /** Health check interval in milliseconds */
  healthCheckInterval?: number
}

export interface HttpClientConfig {
  /** Request timeout in milliseconds */
  timeout?: number
  /** Number of retry attempts */
  retries?: number
  /** Proxy configuration */
  proxy?: string
}

export interface DevboxCreateConfig {
  /** Name of the Devbox instance */
  name: string
  /** Runtime environment (node.js, python, go, etc.) */
  runtime: string
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
  runtime: string
  /** Resource information */
  resources: ResourceInfo
  /** Pod IP address */
  podIP?: string
  /** SSH connection information */
  ssh?: SSHInfo
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
  /** Number of files processed */
  processed: number
  /** Total number of files */
  total: number
  /** Bytes transferred */
  bytesTransferred: number
  /** Transfer duration in milliseconds */
  duration: number
  /** Errors encountered during transfer */
  errors?: TransferError[]
}

export interface TransferError {
  /** File path */
  path: string
  /** Error message */
  error: string
  /** Error code */
  code: string
}

export interface FileChangeEvent {
  /** Event type (add, change, unlink) */
  type: 'add' | 'change' | 'unlink'
  /** File path */
  path: string
  /** Event timestamp */
  timestamp: number
}

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

export type DevboxStatus = 'creating' | 'running' | 'paused' | 'error' | 'deleting' | 'unknown'
