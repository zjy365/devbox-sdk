/**
 * File operation types shared between SDK and Server
 */

/**
 * File encoding types
 */
export type FileEncoding = 'utf8' | 'base64' | 'binary' | 'hex'

/**
 * File metadata
 */
export interface FileMetadata {
  path: string
  size: number
  mimeType?: string
  permissions?: string
  created?: Date
  modified?: Date
  isDirectory: boolean
}

/**
 * Write file request
 */
export interface WriteFileRequest {
  path: string
  content: string
  encoding?: FileEncoding
  permissions?: string
}

/**
 * Write file response
 */
export interface WriteFileResponse {
  success: boolean
  path: string
  size: number
  timestamp: string
}

/**
 * Read file request
 */
export interface ReadFileRequest {
  path: string
  encoding?: FileEncoding
}

/**
 * Read file response
 */
export interface ReadFileResponse {
  content: string
  encoding: FileEncoding
  size: number
  mimeType?: string
}

/**
 * List files request
 */
export interface ListFilesRequest {
  path: string
  recursive?: boolean
  includeHidden?: boolean
}

/**
 * List files response
 */
export interface ListFilesResponse {
  files: FileMetadata[]
  totalCount: number
}

/**
 * Delete file request
 */
export interface DeleteFileRequest {
  path: string
  recursive?: boolean
}

/**
 * Delete file response
 */
export interface DeleteFileResponse {
  success: boolean
  path: string
}

/**
 * Batch upload request
 */
export interface BatchUploadRequest {
  files: Array<{
    path: string
    content: string
    encoding?: FileEncoding
  }>
}

/**
 * File operation result (used in batch operations)
 */
export interface FileOperationResult {
  path: string
  success: boolean
  size?: number
  error?: string
}

/**
 * Batch upload response
 */
export interface BatchUploadResponse {
  success: boolean
  results: FileOperationResult[]
  totalFiles: number
  successCount: number
  failureCount: number
}

/**
 * File watch event types
 */
export type FileWatchEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

/**
 * File watch event
 */
export interface FileWatchEvent {
  type: FileWatchEventType
  path: string
  timestamp: number
  size?: number
}

/**
 * File transfer options
 */
export interface FileTransferOptions {
  concurrency?: number
  chunkSize?: number
  compression?: boolean
  timeout?: number
}
