/**
 * Devbox SDK - Main Entry Point
 * Enterprise TypeScript SDK for Sealos Devbox management
 */

// Basic version export
export const VERSION = '1.0.0'

// Export core classes
export { DevboxSDK } from './core/DevboxSDK'
export { DevboxInstance } from './core/DevboxInstance'

// Export API client
export { DevboxAPI } from './api/client'

// Export connection management
export { ConnectionManager } from './connection/manager'
export { ConnectionPool } from './http/pool'

// Export error handling
export {
  DevboxSDKError,
  AuthenticationError,
  ConnectionError,
  FileOperationError,
  DevboxNotFoundError,
  ValidationError
} from './utils/error'

// Export constants
export { DEFAULT_CONFIG, API_ENDPOINTS, ERROR_CODES, SUPPORTED_RUNTIMES, HTTP_STATUS } from './core/constants'

// Export types for TypeScript users
export type {
  DevboxSDKConfig,
  DevboxCreateConfig,
  DevboxInfo,
  DevboxStatus,
  RuntimeConfig,
  ResourceConfig,
  PortConfig,
  SSHConfig,
  FileMap,
  WriteOptions,
  ReadOptions,
  BatchUploadOptions,
  TransferResult,
  FileChangeEvent,
  CommandResult,
  ProcessStatus,
  MonitorData,
  TimeRange,
  HealthResponse,
  ProcessExecRequest,
  ProcessStatusResponse,
  ServerConfig,
  WriteFileRequest,
  ReadFileRequest,
  BatchUploadRequest,
  FileOperationResult
} from './core/types'

// Default export for convenience
export { DevboxSDK as default }
