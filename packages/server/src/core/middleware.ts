/**
 * Middleware Pipeline System
 *
 * Provides request/response middleware with support for:
 * - CORS headers
 * - Request logging with TraceID
 * - Error handling and formatting
 */

import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import type { Logger } from '@sealos/devbox-shared/logger'

export type NextFunction = () => Promise<Response>
export type Middleware = (req: Request, next: NextFunction) => Promise<Response>

/**
 * Execute a chain of middlewares
 */
export async function executeMiddlewares(
  req: Request,
  middlewares: Middleware[],
  finalHandler: () => Promise<Response>
): Promise<Response> {
  let index = 0

  const next = async (): Promise<Response> => {
    if (index >= middlewares.length) {
      return finalHandler()
    }

    const middleware = middlewares[index++]!
    return middleware(req, next)
  }

  return next()
}

/**
 * CORS Middleware
 * Adds CORS headers to responses
 */
export function corsMiddleware(options?: {
  origin?: string
  methods?: string[]
  headers?: string[]
  credentials?: boolean
}): Middleware {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'Authorization', 'X-Trace-ID'],
    credentials = true,
  } = options || {}

  return async (_req: Request, next: NextFunction): Promise<Response> => {
    // Handle preflight requests
    if (_req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': methods.join(', '),
          'Access-Control-Allow-Headers': headers.join(', '),
          'Access-Control-Allow-Credentials': credentials.toString(),
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    // Process request
    const response = await next()

    // Add CORS headers to response
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Access-Control-Allow-Origin', origin)
    if (credentials) {
      newHeaders.set('Access-Control-Allow-Credentials', 'true')
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }
}

/**
 * Logger Middleware
 * Logs requests with TraceID support
 */
export function loggerMiddleware(logger?: Logger): Middleware {
  return async (req: Request, next: NextFunction): Promise<Response> => {
    const startTime = Date.now()
    const method = req.method
    const url = new URL(req.url)
    const path = url.pathname

    // Extract or generate TraceID
    const traceId = req.headers.get('X-Trace-ID') || crypto.randomUUID()

    // Set trace context in logger if available
    if (logger) {
      logger.setTraceContext({ traceId, timestamp: Date.now() })
      logger.info(`${method} ${path}`, {
        method,
        path,
        query: Object.fromEntries(url.searchParams),
      })
    }

    try {
      const response = await next()
      const duration = Date.now() - startTime

      if (logger) {
        logger.info(`${method} ${path} ${response.status}`, {
          method,
          path,
          status: response.status,
          duration,
        })
      }

      // Add TraceID to response headers
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Trace-ID', traceId)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    } catch (error) {
      const duration = Date.now() - startTime

      if (logger) {
        logger.error(`${method} ${path} ERROR`, error as Error, {
          method,
          path,
          duration,
        })
      }

      throw error
    }
  }
}

/**
 * Error Handler Middleware
 * Catches errors and formats them as standardized responses
 */
export function errorHandlerMiddleware(): Middleware {
  return async (req: Request, next: NextFunction): Promise<Response> => {
    try {
      return await next()
    } catch (error) {
      // Handle DevboxError
      if (error instanceof DevboxError) {
        return new Response(
          JSON.stringify({
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
              suggestion: error.suggestion,
              traceId: error.traceId,
            },
          }),
          {
            status: error.httpStatus,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      }

      // Handle generic errors
      const message = error instanceof Error ? error.message : 'Unknown error'
      return new Response(
        JSON.stringify({
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message,
            details: {
              errorType: error?.constructor?.name || 'Error',
            },
          },
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }
  }
}

/**
 * Request Timeout Middleware
 * Ensures requests complete within a specified time
 */
export function timeoutMiddleware(timeoutMs = 30000): Middleware {
  return async (_req: Request, next: NextFunction): Promise<Response> => {
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => {
        reject(new DevboxError(`Request timeout after ${timeoutMs}ms`, ErrorCode.PROCESS_TIMEOUT))
      }, timeoutMs)
    })

    return Promise.race([next(), timeoutPromise])
  }
}
