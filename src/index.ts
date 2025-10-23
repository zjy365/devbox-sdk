/**
 * Main library exports for the Devbox SDK
 */

// Core SDK
export { DevboxSDK } from './core/DevboxSDK'

// Type definitions
export type {
  DevboxSDKConfig,
  DevboxCreateConfig,
  DevboxInfo,
  ResourceInfo,
  PortConfig,
  SSHInfo,
  FileMap,
  WriteOptions,
  ReadOptions,
  BatchUploadOptions,
  TransferProgress,
  TransferResult,
  TransferError,
  FileChangeEvent,
  TimeRange,
  MonitorData,
  CommandResult,
  ProcessStatus,
  DevboxStatus,
  ConnectionPoolConfig,
  HttpClientConfig
} from './core/types'

// Constants
export {
  DEFAULT_CONFIG,
  API_ENDPOINTS,
  ERROR_CODES,
  SUPPORTED_RUNTIMES,
  HTTP_STATUS
} from './core/constants'

// Classes for advanced usage
export { DevboxAPI } from './api/client'
export { ConnectionManager } from './connection/manager'
export { DevboxInstance } from './devbox/DevboxInstance'

// Error classes
export { DevboxSDKError } from './utils/error'

// Version information
export const VERSION = '1.0.0'
