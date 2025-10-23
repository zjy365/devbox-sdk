/**
 * Shared types for Devbox SDK
 *
 * This module exports all type definitions used across SDK and Server packages,
 * ensuring type consistency and single source of truth.
 */

// File operation types
export type {
  FileEncoding,
  FileMetadata,
  WriteFileRequest,
  WriteFileResponse,
  ReadFileRequest,
  ReadFileResponse,
  ListFilesRequest,
  ListFilesResponse,
  DeleteFileRequest,
  DeleteFileResponse,
  BatchUploadRequest,
  FileOperationResult,
  BatchUploadResponse,
  FileWatchEventType,
  FileWatchEvent,
  FileTransferOptions
} from './file'

// Process execution types
export type {
  ProcessStatus,
  ProcessExecRequest,
  ProcessExecResult,
  ProcessExecResponse,
  ProcessInfo,
  StartProcessRequest,
  StartProcessResponse,
  ProcessStatusRequest,
  ProcessStatusResponse,
  KillProcessRequest,
  KillProcessResponse,
  ProcessLogsRequest,
  ProcessLogsResponse
} from './process'

// Session management types
export type {
  SessionState,
  SessionInfo,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionRequest,
  GetSessionResponse,
  UpdateSessionEnvRequest,
  UpdateSessionEnvResponse,
  TerminateSessionRequest,
  TerminateSessionResponse,
  ListSessionsResponse
} from './session'

// Devbox lifecycle types
export type {
  DevboxRuntime,
  DevboxState,
  ResourceConfig,
  PortConfig,
  DevboxInfo,
  CreateDevboxRequest,
  CreateDevboxResponse,
  GetDevboxRequest,
  GetDevboxResponse,
  ListDevboxesRequest,
  ListDevboxesResponse,
  DeleteDevboxRequest,
  DeleteDevboxResponse,
  StartDevboxRequest,
  StartDevboxResponse,
  StopDevboxRequest,
  StopDevboxResponse,
  RestartDevboxRequest,
  RestartDevboxResponse
} from './devbox'

// Server types
export type { HealthResponse, ServerConfig, ServerMetrics } from './server'
