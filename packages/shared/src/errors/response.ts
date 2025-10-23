import { ErrorCode, ERROR_HTTP_STATUS } from './codes'
import type { ErrorContext } from './context'

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  error: {
    message: string
    code: ErrorCode
    httpStatus: number
    details?: ErrorContext
    suggestion?: string
    traceId?: string
    timestamp?: string
  }
}

/**
 * Error suggestions for common error codes
 */
const ERROR_SUGGESTIONS: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.FILE_NOT_FOUND]: 'Check that the file path is correct and the file exists',
  [ErrorCode.PERMISSION_DENIED]: 'Verify your authentication credentials and permissions',
  [ErrorCode.PATH_TRAVERSAL_DETECTED]:
    'Use absolute paths within /workspace or relative paths without ..',
  [ErrorCode.CONNECTION_TIMEOUT]: 'Check network connectivity and server availability',
  [ErrorCode.DEVBOX_NOT_FOUND]: 'Ensure the Devbox exists and is in the correct namespace',
  [ErrorCode.INVALID_TOKEN]: 'Refresh your authentication token',
  [ErrorCode.SESSION_NOT_FOUND]: 'Create a new session or use an existing session ID',
  [ErrorCode.PROCESS_TIMEOUT]: 'Increase the timeout value or optimize the command execution'
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  message: string,
  code: ErrorCode,
  options?: {
    details?: ErrorContext
    suggestion?: string
    traceId?: string
  }
): ErrorResponse {
  return {
    error: {
      message,
      code,
      httpStatus: ERROR_HTTP_STATUS[code],
      details: options?.details,
      suggestion: options?.suggestion ?? ERROR_SUGGESTIONS[code],
      traceId: options?.traceId,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Custom DevboxError class for SDK operations
 */
export class DevboxError extends Error {
  public readonly code: ErrorCode
  public readonly httpStatus: number
  public readonly details?: ErrorContext
  public readonly suggestion?: string
  public readonly traceId?: string

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      details?: ErrorContext
      suggestion?: string
      traceId?: string
      cause?: Error
    }
  ) {
    super(message)
    this.name = 'DevboxError'
    this.code = code
    this.httpStatus = ERROR_HTTP_STATUS[code]
    this.details = options?.details
    this.suggestion = options?.suggestion ?? ERROR_SUGGESTIONS[code]
    this.traceId = options?.traceId

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DevboxError)
    }

    // Set the cause if provided (for error chaining)
    if (options?.cause) {
      this.cause = options.cause
    }
  }

  /**
   * Convert error to ErrorResponse format
   */
  toResponse(): ErrorResponse {
    return createErrorResponse(this.message, this.code, {
      details: this.details,
      suggestion: this.suggestion,
      traceId: this.traceId
    })
  }

  /**
   * Convert error to JSON format
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      httpStatus: this.httpStatus,
      details: this.details,
      suggestion: this.suggestion,
      traceId: this.traceId,
      stack: this.stack
    }
  }
}

/**
 * Check if an error is a DevboxError
 */
export function isDevboxError(error: unknown): error is DevboxError {
  return error instanceof DevboxError
}

/**
 * Convert unknown error to DevboxError
 */
export function toDevboxError(error: unknown, traceId?: string): DevboxError {
  if (isDevboxError(error)) {
    return error
  }

  if (error instanceof Error) {
    return new DevboxError(error.message, ErrorCode.INTERNAL_ERROR, {
      traceId,
      cause: error
    })
  }

  return new DevboxError(String(error), ErrorCode.UNKNOWN_ERROR, {
    traceId
  })
}
