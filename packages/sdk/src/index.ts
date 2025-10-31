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
export { ConnectionManager } from './http/manager'
export { ConnectionPool } from './http/pool'

// Export error handling
export {
  DevboxSDKError,
  AuthenticationError,
  ConnectionError,
  FileOperationError,
  DevboxNotFoundError,
  ValidationError,
} from './utils/error'

// Export constants
export {
  DEFAULT_CONFIG,
  API_ENDPOINTS,
  ERROR_CODES,
  SUPPORTED_RUNTIMES,
  HTTP_STATUS,
} from './core/constants'

// Export types for TypeScript users
export type {
  DevboxSDKConfig,
  DevboxCreateConfig,
  DevboxInfo,
  DevboxStatus,
  PortConfig,
  SSHInfo,
  FileMap,
  WriteOptions,
  ReadOptions,
  BatchUploadOptions,
  TransferResult,
  TransferProgress,
  TransferError,
  FileChangeEvent,
  CommandResult,
  ProcessStatus,
  MonitorData,
  TimeRange,
  ResourceInfo,
  ConnectionPoolConfig,
  HttpClientConfig,
} from './core/types'

// Export API types
export type {
  APIResponse,
  CreateDevboxRequest,
  UpdateDevboxRequest,
  PortConfig as APIPortConfig,
  EnvVar,
  DevboxDetailApiResponse,
  DevboxListApiResponse,
  TemplatesApiResponse,
  ReleaseListApiResponse,
  MonitorDataApiResponse,
} from './api/types'

// Default export for convenience
import { DevboxSDK } from './core/DevboxSDK'
export default DevboxSDK
