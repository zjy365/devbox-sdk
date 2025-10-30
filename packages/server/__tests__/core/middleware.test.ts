/**
 * Unit tests for Middleware System
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import {
  executeMiddlewares,
  corsMiddleware,
  loggerMiddleware,
  errorHandlerMiddleware,
  timeoutMiddleware
} from '../../src/core/middleware'
import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import type { Middleware } from '../../src/core/middleware'

describe('Middleware System', () => {
  describe('executeMiddlewares', () => {
    it('should execute middlewares in order', async () => {
      const order: number[] = []

      const middleware1: Middleware = async (req, next) => {
        order.push(1)
        const response = await next()
        order.push(4)
        return response
      }

      const middleware2: Middleware = async (req, next) => {
        order.push(2)
        const response = await next()
        order.push(3)
        return response
      }

      const finalHandler = async () => {
        order.push(5)
        return new Response('OK')
      }

      const request = new Request('http://localhost:3000/test')
      await executeMiddlewares(request, [middleware1, middleware2], finalHandler)

      expect(order).toEqual([1, 2, 5, 3, 4])
    })

    it('should call final handler after all middlewares', async () => {
      let finalHandlerCalled = false

      const middleware: Middleware = async (req, next) => {
        return next()
      }

      const finalHandler = async () => {
        finalHandlerCalled = true
        return new Response('OK')
      }

      const request = new Request('http://localhost:3000/test')
      await executeMiddlewares(request, [middleware], finalHandler)

      expect(finalHandlerCalled).toBe(true)
    })

    it('should work with empty middleware array', async () => {
      const finalHandler = async () => new Response('OK')
      const request = new Request('http://localhost:3000/test')

      const response = await executeMiddlewares(request, [], finalHandler)
      expect(response.status).toBe(200)
    })

    it('should allow middleware to modify response', async () => {
      const middleware: Middleware = async (req, next) => {
        const response = await next()
        const newHeaders = new Headers(response.headers)
        newHeaders.set('X-Custom', 'value')

        return new Response(response.body, {
          status: response.status,
          headers: newHeaders
        })
      }

      const finalHandler = async () => new Response('OK')
      const request = new Request('http://localhost:3000/test')

      const response = await executeMiddlewares(request, [middleware], finalHandler)
      expect(response.headers.get('X-Custom')).toBe('value')
    })
  })

  describe('corsMiddleware', () => {
    it('should add CORS headers to response', async () => {
      const middleware = corsMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => new Response('OK')

      const response = await middleware(request, next)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })

    it('should handle preflight OPTIONS requests', async () => {
      const middleware = corsMiddleware()
      const request = new Request('http://localhost:3000/test', { method: 'OPTIONS' })
      const next = async () => new Response('Should not be called')

      const response = await middleware(request, next)

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
    })

    it('should respect custom origin', async () => {
      const middleware = corsMiddleware({ origin: 'https://example.com' })
      const request = new Request('http://localhost:3000/test')
      const next = async () => new Response('OK')

      const response = await middleware(request, next)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    })

    it('should respect custom methods', async () => {
      const middleware = corsMiddleware({ methods: ['GET', 'POST'] })
      const request = new Request('http://localhost:3000/test', { method: 'OPTIONS' })
      const next = async () => new Response('OK')

      const response = await middleware(request, next)

      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST')
    })

    it('should respect credentials option', async () => {
      const middleware = corsMiddleware({ credentials: false })
      const request = new Request('http://localhost:3000/test')
      const next = async () => new Response('OK')

      const response = await middleware(request, next)

      expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    })
  })

  describe('loggerMiddleware', () => {
    it('should add X-Trace-ID header to response', async () => {
      const middleware = loggerMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => new Response('OK')

      const response = await middleware(request, next)

      expect(response.headers.has('X-Trace-ID')).toBe(true)
    })

    it('should use existing X-Trace-ID from request', async () => {
      const middleware = loggerMiddleware()
      const request = new Request('http://localhost:3000/test', {
        headers: { 'X-Trace-ID': 'test-trace-id' }
      })
      const next = async () => new Response('OK')

      const response = await middleware(request, next)

      expect(response.headers.get('X-Trace-ID')).toBe('test-trace-id')
    })

    it('should work with logger instance', async () => {
      const logger = {
        setTraceContext: mock(() => {}),
        info: mock(() => {}),
        error: mock(() => {})
      }

      const middleware = loggerMiddleware(logger as any)
      const request = new Request('http://localhost:3000/test')
      const next = async () => new Response('OK')

      await middleware(request, next)

      expect(logger.setTraceContext).toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalled()
    })

    it('should log errors', async () => {
      const logger = {
        setTraceContext: mock(() => {}),
        info: mock(() => {}),
        error: mock(() => {})
      }

      const middleware = loggerMiddleware(logger as any)
      const request = new Request('http://localhost:3000/test')
      const next = async () => {
        throw new Error('Test error')
      }

      try {
        await middleware(request, next)
      } catch (error) {
        // Expected
      }

      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('errorHandlerMiddleware', () => {
    it('should catch and format DevboxError', async () => {
      const middleware = errorHandlerMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => {
        throw new DevboxError('File not found', ErrorCode.FILE_NOT_FOUND)
      }

      const response = await middleware(request, next)

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.FILE_NOT_FOUND)
      expect(body.error.message).toBe('File not found')
    })

    it('should catch and format generic errors', async () => {
      const middleware = errorHandlerMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => {
        throw new Error('Generic error')
      }

      const response = await middleware(request, next)

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR)
      expect(body.error.message).toBe('Generic error')
    })

    it('should handle unknown errors', async () => {
      const middleware = errorHandlerMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => {
        throw 'string error'
      }

      const response = await middleware(request, next)

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR)
    })

    it('should set correct Content-Type', async () => {
      const middleware = errorHandlerMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => {
        throw new Error('Test')
      }

      const response = await middleware(request, next)

      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it('should pass through successful responses', async () => {
      const middleware = errorHandlerMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => new Response('OK', { status: 200 })

      const response = await middleware(request, next)

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).toBe('OK')
    })
  })

  describe('timeoutMiddleware', () => {
    it('should allow requests that complete within timeout', async () => {
      const middleware = timeoutMiddleware(1000)
      const request = new Request('http://localhost:3000/test')
      const next = async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return new Response('OK')
      }

      const response = await middleware(request, next)
      expect(response.status).toBe(200)
    })

    it('should throw timeout error for slow requests', async () => {
      const middleware = timeoutMiddleware(100)
      const request = new Request('http://localhost:3000/test')
      const next = async () => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return new Response('OK')
      }

      try {
        await middleware(request, next)
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(DevboxError)
        expect((error as DevboxError).code).toBe(ErrorCode.PROCESS_TIMEOUT)
      }
    })

    it('should use default timeout of 30 seconds', async () => {
      const middleware = timeoutMiddleware()
      const request = new Request('http://localhost:3000/test')
      const next = async () => new Response('OK')

      const response = await middleware(request, next)
      expect(response.status).toBe(200)
    })
  })

  describe('integration', () => {
    it('should work with multiple middlewares together', async () => {
      const middlewares = [
        corsMiddleware(),
        loggerMiddleware(),
        errorHandlerMiddleware()
      ]

      const finalHandler = async () => new Response('OK')
      const request = new Request('http://localhost:3000/test')

      const response = await executeMiddlewares(request, middlewares, finalHandler)

      expect(response.status).toBe(200)
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(true)
      expect(response.headers.has('X-Trace-ID')).toBe(true)
    })

    it('should handle errors through middleware chain', async () => {
      const middlewares = [
        corsMiddleware(),
        loggerMiddleware(),
        errorHandlerMiddleware()
      ]

      const finalHandler = async () => {
        throw new DevboxError('Test error', ErrorCode.FILE_NOT_FOUND)
      }

      const request = new Request('http://localhost:3000/test')
      const response = await executeMiddlewares(request, middlewares, finalHandler)

      expect(response.status).toBe(404)
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(true)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.FILE_NOT_FOUND)
    })
  })
})
