/**
 * Custom error classes for the Devbox SDK
 */

import { ERROR_CODES } from '../core/constants'

/**
 * Error context type for additional error information
 */
export interface ErrorContext {
  status?: number
  statusText?: string
  timestamp?: number
  serverErrorCode?: string
  originalError?: unknown
  [key: string]: unknown
}

export class DevboxSDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: ErrorContext
  ) {
    super(message)
    this.name = 'DevboxSDKError'
  }
}

export class AuthenticationError extends DevboxSDKError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'AUTHENTICATION_FAILED', context)
    this.name = 'AuthenticationError'
  }
}

export class ConnectionError extends DevboxSDKError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONNECTION_FAILED', context)
    this.name = 'ConnectionError'
  }
}

export class FileOperationError extends DevboxSDKError {
  constructor(
    message: string,
    context?: ErrorContext,
    code: string = ERROR_CODES.FILE_TRANSFER_FAILED
  ) {
    super(message, code, context)
    this.name = 'FileOperationError'
  }
}

export class DevboxNotFoundError extends DevboxSDKError {
  constructor(devboxName: string, context?: ErrorContext) {
    super(`Devbox '${devboxName}' not found`, 'DEVBOX_NOT_FOUND', context)
    this.name = 'DevboxNotFoundError'
  }
}

export class DevboxNotReadyError extends DevboxSDKError {
  constructor(devboxName: string, currentStatus?: string, context?: ErrorContext) {
    const statusInfo = currentStatus ? ` (current status: ${currentStatus})` : ''
    super(
      `Devbox '${devboxName}' is not ready yet${statusInfo}. The devbox may still be starting. Please wait a moment and try again, or use 'await devbox.waitForReady()' to wait until it's fully initialized.`,
      'DEVBOX_NOT_READY',
      context
    )
    this.name = 'DevboxNotReadyError'
  }
}

export class ValidationError extends DevboxSDKError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'VALIDATION_ERROR', context)
    this.name = 'ValidationError'
  }
}

/**
 * Server response format: { status: number, message: string, Data: T }
 * status: 0 = success, other values = error codes
 */
export interface ServerResponse<T = unknown> {
  status?: number
  message?: string
  Data?: T
  [key: string]: unknown
}

/**
 * Map server status codes to SDK error codes
 * Server uses custom status codes in response body (e.g., 1404 for not found)
 */
function mapServerStatusToErrorCode(status: number): string {
  switch (status) {
    case 1404:
      return ERROR_CODES.FILE_NOT_FOUND
    case 1400:
      return ERROR_CODES.VALIDATION_ERROR
    case 1401:
      return ERROR_CODES.UNAUTHORIZED
    case 1403:
      return ERROR_CODES.INSUFFICIENT_PERMISSIONS
    case 1422:
      return ERROR_CODES.INVALID_REQUEST
    case 1500:
      return ERROR_CODES.INTERNAL_ERROR
    case 1409:
      return ERROR_CODES.CONFLICT
    case 1600:
      return ERROR_CODES.OPERATION_FAILED
    case 500:
      return ERROR_CODES.INTERNAL_ERROR
    default:
      return ERROR_CODES.OPERATION_FAILED
  }
}

/**
 * Parse server JSON response and check for errors in response body
 * Server may return HTTP 200 with error status in response body
 * @param jsonData Parsed JSON response from server
 * @returns Extracted data from response, or throws error if status indicates failure
 * @throws {DevboxSDKError} If response contains error status
 */
export function parseServerResponse<T>(jsonData: ServerResponse<T>): T {
  // Check if server returned an error in the response body
  // Server uses status: 0 for success, other values for errors
  if (jsonData.status !== undefined && jsonData.status !== 0) {
    const errorCode = mapServerStatusToErrorCode(jsonData.status)
    const errorMessage = jsonData.message || 'Unknown server error'

    throw createErrorFromServerResponse(errorMessage, errorCode, undefined)
  }

  // Extract Data field if present (server wraps response in { status, message, Data })
  // Otherwise use the entire response as data
  return (jsonData.Data !== undefined ? jsonData.Data : jsonData) as T
}

/**
 * Create an appropriate error instance based on server error code
 * @param error Server error message
 * @param code Server error code
 * @param timestamp Optional timestamp from server
 * @returns Appropriate error instance
 */
export function createErrorFromServerResponse(
  error: string,
  code: string,
  timestamp?: number
): DevboxSDKError {
  const errorContext = { timestamp, serverErrorCode: code }

  switch (code) {
    case ERROR_CODES.UNAUTHORIZED:
    case ERROR_CODES.INVALID_TOKEN:
    case ERROR_CODES.TOKEN_EXPIRED:
    case ERROR_CODES.INSUFFICIENT_PERMISSIONS:
      return new AuthenticationError(error, errorContext)

    case ERROR_CODES.FILE_NOT_FOUND:
    case ERROR_CODES.DIRECTORY_NOT_FOUND:
    case ERROR_CODES.FILE_OPERATION_ERROR:
    case ERROR_CODES.FILE_TOO_LARGE:
    case ERROR_CODES.FILE_LOCKED:
    case ERROR_CODES.DIRECTORY_NOT_EMPTY:
    case ERROR_CODES.DISK_FULL:
      return new FileOperationError(error, errorContext, code)

    case ERROR_CODES.INVALID_REQUEST:
    case ERROR_CODES.MISSING_REQUIRED_FIELD:
    case ERROR_CODES.INVALID_FIELD_VALUE:
    case ERROR_CODES.INVALID_JSON_FORMAT:
    case ERROR_CODES.INVALID_PATH:
    case ERROR_CODES.INVALID_SIGNAL:
      return new ValidationError(error, errorContext)

    case ERROR_CODES.DEVBOX_NOT_FOUND:
    case ERROR_CODES.PROCESS_NOT_FOUND:
    case ERROR_CODES.SESSION_NOT_FOUND:
    case ERROR_CODES.NOT_FOUND:
      if (code === ERROR_CODES.DEVBOX_NOT_FOUND) {
        // Extract devbox name from error message if possible
        const devboxNameMatch =
          error.match(/Devbox '([^']+)'/i) || error.match(/devbox[:\s]+([^\s]+)/i)
        const devboxName = devboxNameMatch?.[1] ?? 'unknown'
        return new DevboxNotFoundError(devboxName, errorContext)
      }
      return new DevboxSDKError(error, code || ERROR_CODES.INTERNAL_ERROR, errorContext)

    default:
      return new DevboxSDKError(error, code, errorContext)
  }
}

// Re-export ERROR_CODES for convenience
export { ERROR_CODES }
