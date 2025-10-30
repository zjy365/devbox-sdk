/**
 * Unit tests for Response Builder
 */

import { describe, it, expect } from 'bun:test'
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
  streamResponse,
  noContentResponse,
  acceptedResponse
} from '../../src/core/response-builder'
import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import { ZodError } from 'zod'

describe('Response Builder', () => {
  describe('successResponse', () => {
    it('should create success response with default 200 status', async () => {
      const data = { message: 'Success', value: 42 }
      const response = successResponse(data)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await response.json()
      expect(body).toEqual(data)
    })

    it('should support custom status code', async () => {
      const data = { created: true }
      const response = successResponse(data, 201)

      expect(response.status).toBe(201)
    })

    it('should handle various data types', async () => {
      const stringResponse = successResponse('Hello')
      expect(await stringResponse.json()).toBe('Hello')

      const numberResponse = successResponse(123)
      expect(await numberResponse.json()).toBe(123)

      const boolResponse = successResponse(true)
      expect(await boolResponse.json()).toBe(true)

      const arrayResponse = successResponse([1, 2, 3])
      expect(await arrayResponse.json()).toEqual([1, 2, 3])
    })
  })

  describe('errorResponse', () => {
    it('should create error response from DevboxError', async () => {
      const error = new DevboxError('File not found', ErrorCode.FILE_NOT_FOUND)
      const response = errorResponse(error)

      expect(response.status).toBe(404)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.FILE_NOT_FOUND)
      expect(body.error.message).toBe('File not found')
    })

    it('should include error details if present', async () => {
      const error = new DevboxError('Validation error', ErrorCode.VALIDATION_ERROR, {
        details: {
          field: 'email',
          reason: 'invalid format'
        }
      })
      const response = errorResponse(error)

      const body = await response.json()
      expect(body.error.details).toEqual({
        field: 'email',
        reason: 'invalid format'
      })
    })

    it('should include suggestion if present', async () => {
      const error = new DevboxError('Timeout', ErrorCode.PROCESS_TIMEOUT, {
        suggestion: 'Try again with a smaller payload'
      })

      const response = errorResponse(error)

      const body = await response.json()
      expect(body.error.suggestion).toBe('Try again with a smaller payload')
    })

    it('should include traceId if present', async () => {
      const error = new DevboxError('Error', ErrorCode.INTERNAL_ERROR, {
        traceId: 'trace-123'
      })

      const response = errorResponse(error)

      const body = await response.json()
      expect(body.error.traceId).toBe('trace-123')
    })
  })

  describe('notFoundResponse', () => {
    it('should create 404 response', async () => {
      const response = notFoundResponse('Resource not found')

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.FILE_NOT_FOUND)
      expect(body.error.message).toBe('Resource not found')
    })

    it('should accept custom error code', async () => {
      const response = notFoundResponse('User not found', ErrorCode.INVALID_TOKEN)

      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.INVALID_TOKEN)
    })
  })

  describe('validationErrorResponse', () => {
    it('should format Zod validation errors', async () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number'
        },
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['email'],
          message: 'String must contain at least 1 character(s)'
        }
      ])

      const response = validationErrorResponse(zodError)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(body.error.message).toBe('Validation failed')
      expect(body.error.details.errors).toHaveLength(2)
      expect(body.error.details.errors[0].path).toBe('name')
      expect(body.error.details.errors[1].path).toBe('email')
    })

    it('should handle nested paths', async () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['user', 'profile', 'name'],
          message: 'Expected string'
        }
      ])

      const response = validationErrorResponse(zodError)

      const body = await response.json()
      expect(body.error.details.errors[0].path).toBe('user.profile.name')
    })
  })

  describe('unauthorizedResponse', () => {
    it('should create 401 response with default message', async () => {
      const response = unauthorizedResponse()

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.INVALID_TOKEN)
      expect(body.error.message).toBe('Unauthorized')
    })

    it('should accept custom message', async () => {
      const response = unauthorizedResponse('Invalid token')

      const body = await response.json()
      expect(body.error.message).toBe('Invalid token')
    })
  })

  describe('forbiddenResponse', () => {
    it('should create 403 response with default message', async () => {
      const response = forbiddenResponse()

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.PERMISSION_DENIED)
      expect(body.error.message).toBe('Forbidden')
    })

    it('should accept custom message', async () => {
      const response = forbiddenResponse('Insufficient permissions')

      const body = await response.json()
      expect(body.error.message).toBe('Insufficient permissions')
    })
  })

  describe('internalErrorResponse', () => {
    it('should create 500 response with default message', async () => {
      const response = internalErrorResponse()

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR)
      expect(body.error.message).toBe('Internal server error')
    })

    it('should accept custom message and details', async () => {
      const response = internalErrorResponse('Database connection failed', {
        dbHost: 'localhost',
        errorCode: 'ECONNREFUSED'
      })

      const body = await response.json()
      expect(body.error.message).toBe('Database connection failed')
      expect(body.error.details).toEqual({
        dbHost: 'localhost',
        errorCode: 'ECONNREFUSED'
      })
    })
  })

  describe('streamResponse', () => {
    it('should create streaming response', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Hello'))
          controller.close()
        }
      })

      const response = streamResponse(stream)

      expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
      expect(response.body).toBeDefined()
    })

    it('should set custom content type', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream, { contentType: 'text/plain' })

      expect(response.headers.get('Content-Type')).toBe('text/plain')
    })

    it('should set content length if provided', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream, { contentLength: 1024 })

      expect(response.headers.get('Content-Length')).toBe('1024')
    })

    it('should set content disposition for file downloads', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream, { fileName: 'download.txt' })

      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="download.txt"')
    })

    it('should set multiple options together', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream, {
        contentType: 'application/pdf',
        contentLength: 2048,
        fileName: 'document.pdf'
      })

      expect(response.headers.get('Content-Type')).toBe('application/pdf')
      expect(response.headers.get('Content-Length')).toBe('2048')
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="document.pdf"')
    })
  })

  describe('noContentResponse', () => {
    it('should create 204 response', () => {
      const response = noContentResponse()

      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
    })
  })

  describe('acceptedResponse', () => {
    it('should create 202 response without data', () => {
      const response = acceptedResponse()

      expect(response.status).toBe(202)
      expect(response.body).toBeNull()
    })

    it('should create 202 response with data', async () => {
      const response = acceptedResponse({ jobId: '123', status: 'pending' })

      expect(response.status).toBe(202)
      const body = await response.json()
      expect(body.jobId).toBe('123')
      expect(body.status).toBe('pending')
    })
  })

  describe('integration', () => {
    it('should work together in a typical API flow', async () => {
      // Success case
      const success = successResponse({ id: 1, name: 'Test' })
      expect(success.status).toBe(200)

      // Not found case
      const notFound = notFoundResponse('Item not found')
      expect(notFound.status).toBe(404)

      // Error case
      const error = errorResponse(
        new DevboxError('Operation failed', ErrorCode.INTERNAL_ERROR)
      )
      expect(error.status).toBe(500)

      // No content case
      const noContent = noContentResponse()
      expect(noContent.status).toBe(204)
    })
  })
})
