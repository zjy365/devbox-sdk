/**
 * Devbox SDK - Main Entry Point
 * Enterprise TypeScript SDK for Sealos Devbox management
 */

// Basic version export
export const VERSION = '1.0.0'

// Export core classes
export { DevboxSDK } from './core/devbox-sdk'
export { DevboxInstance } from './core/devbox-instance'

// Export API client
export { DevboxAPI } from './api/client'

export { ContainerUrlResolver } from './http/manager'
export { DevboxContainerClient } from './http/client'

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
  // FileChangeEvent, // Temporarily disabled - ws module removed
  CommandResult,
  ProcessStatus,
  MonitorData,
  TimeRange,
  ResourceInfo,
  HttpClientConfig,
  ProcessExecOptions,
  ProcessExecResponse,
  CodeRunOptions,
  SyncExecutionResponse,
  ProcessInfo,
  ListProcessesResponse,
  GetProcessStatusResponse,
  GetProcessLogsResponse,
  KillProcessOptions,
  GitAuth,
  GitCloneOptions,
  GitPullOptions,
  GitPushOptions,
  GitBranchInfo,
  GitStatus,
  MoveFileOptions,
  MoveFileResponse,
  RenameFileOptions,
  RenameFileResponse,
  DownloadFileOptions,
  PortsResponse,
} from './core/types'

// Export API types and enums
export { DevboxRuntime } from './api/types'
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
import { DevboxSDK } from './core/devbox-sdk'
export default DevboxSDK
