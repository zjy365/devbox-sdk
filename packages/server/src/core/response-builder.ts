/**
 * Response Builder Utilities
 *
 * Standardized response helpers for consistent API responses
 */

import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import type { ZodError } from 'zod'

/**
 * Create a success response
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * @returns Response object
 */
export function successResponse<T>(data: T, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

/**
 * Create an error response from DevboxError
 * @param error - DevboxError instance
 * @returns Response object with error details
 */
export function errorResponse(error: DevboxError): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        suggestion: error.suggestion,
        traceId: error.traceId
      }
    }),
    {
      status: error.httpStatus,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

/**
 * Create a 404 Not Found response
 * @param message - Error message
 * @param code - ErrorCode (default: FILE_NOT_FOUND)
 * @returns Response object
 */
export function notFoundResponse(
  message: string,
  code: ErrorCode = ErrorCode.FILE_NOT_FOUND
): Response {
  // Get the appropriate HTTP status from the error code
  const error = new DevboxError(message, code)

  return new Response(
    JSON.stringify({
      error: {
        code,
        message
      }
    }),
    {
      status: error.httpStatus,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

/**
 * Create a validation error response from Zod errors
 * @param errors - ZodError instance
 * @returns Response object with validation errors
 */
export function validationErrorResponse(errors: ZodError): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: {
          errors: errors.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        }
      }
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

/**
 * Create a 401 Unauthorized response
 * @param message - Error message
 * @returns Response object
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: ErrorCode.INVALID_TOKEN,
        message
      }
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

/**
 * Create a 403 Forbidden response
 * @param message - Error message
 * @returns Response object
 */
export function forbiddenResponse(message: string = 'Forbidden'): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: ErrorCode.PERMISSION_DENIED,
        message
      }
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

/**
 * Create a 500 Internal Server Error response
 * @param message - Error message
 * @param details - Optional error details
 * @returns Response object
 */
export function internalErrorResponse(
  message: string = 'Internal server error',
  details?: unknown
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message,
        ...(details ? { details } : {})
      }
    }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

/**
 * Create a streaming response (for large files)
 * @param stream - ReadableStream
 * @param options - Response options (contentType, contentLength, etc.)
 * @returns Response object
 */
export function streamResponse(
  stream: ReadableStream,
  options?: {
    contentType?: string
    contentLength?: number
    fileName?: string
  }
): Response {
  const headers: Record<string, string> = {
    'Content-Type': options?.contentType || 'application/octet-stream'
  }

  if (options?.contentLength) {
    headers['Content-Length'] = options.contentLength.toString()
  }

  if (options?.fileName) {
    headers['Content-Disposition'] = `attachment; filename="${options.fileName}"`
  }

  return new Response(stream, { headers })
}

/**
 * Create a no-content response (204)
 * @returns Response object
 */
export function noContentResponse(): Response {
  return new Response(null, { status: 204 })
}

/**
 * Create an accepted response (202) for async operations
 * @param data - Optional response data (e.g., job ID)
 * @returns Response object
 */
export function acceptedResponse<T>(data?: T): Response {
  if (data) {
    return successResponse(data, 202)
  }
  return new Response(null, { status: 202 })
}
