/**
 * Validation Middleware
 * Middleware for request validation using Zod schemas
 */

import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import { z } from 'zod'
import { validationErrorResponse } from './response-builder'

export interface ValidationContext {
  body?: any
  query?: any
  params?: any
}

/**
 * Create validation middleware for request body
 */
export function validateBody<T extends z.ZodType>(
  schema: T
): (
  req: Request
) => Promise<{ valid: true; data: z.infer<T> } | { valid: false; response: Response }> {
  return async (req: Request) => {
    try {
      const body = await req.json()
      const result = schema.safeParse(body)

      if (!result.success) {
        return {
          valid: false,
          response: validationErrorResponse(result.error),
        }
      }

      return { valid: true, data: result.data }
    } catch (error) {
      return {
        valid: false,
        response: validationErrorResponse(
          new z.ZodError([
            {
              code: 'invalid_type',
              expected: 'object',
              received: 'string',
              path: [],
              message: 'Invalid JSON in request body',
            },
          ])
        ),
      }
    }
  }
}

/**
 * Create validation middleware for query parameters
 */
export function validateQuery<T extends z.ZodType>(
  schema: T
): (req: Request) => { valid: true; data: z.infer<T> } | { valid: false; response: Response } {
  return (req: Request) => {
    const url = new URL(req.url)
    const params: Record<string, string> = {}

    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value
    }

    const result = schema.safeParse(params)

    if (!result.success) {
      return {
        valid: false,
        response: validationErrorResponse(result.error),
      }
    }

    return { valid: true, data: result.data }
  }
}

/**
 * Create validation middleware for path parameters
 */
export function validateParams<T extends z.ZodType>(
  schema: T
): (
  params: Record<string, string>
) => { valid: true; data: z.infer<T> } | { valid: false; response: Response } {
  return (params: Record<string, string>) => {
    const result = schema.safeParse(params)

    if (!result.success) {
      return {
        valid: false,
        response: validationErrorResponse(result.error),
      }
    }

    return { valid: true, data: result.data }
  }
}

/**
 * Combined validation middleware for body, query, and params
 */
export function validateRequest<
  TBody extends z.ZodType,
  TQuery extends z.ZodType,
  TParams extends z.ZodType,
>(options: {
  body?: TBody
  query?: TQuery
  params?: TParams
}): (
  req: Request,
  routeParams?: Record<string, string>
) => Promise<
  | {
      valid: true
      data: {
        body?: z.infer<TBody>
        query?: z.infer<TQuery>
        params?: z.infer<TParams>
      }
    }
  | {
      valid: false
      response: Response
    }
> {
  return async (req: Request, routeParams?: Record<string, string>) => {
    const validationResults: any = {}
    const errors: z.ZodError[] = []

    // Validate body
    if (options.body) {
      try {
        const body = await req.json()
        const result = options.body.safeParse(body)
        if (result.success) {
          validationResults.body = result.data
        } else {
          errors.push(result.error)
        }
      } catch (error) {
        errors.push(
          new z.ZodError([
            {
              code: 'invalid_type',
              expected: 'object',
              received: 'string',
              path: [],
              message: 'Invalid JSON in request body',
            },
          ])
        )
      }
    }

    // Validate query parameters
    if (options.query) {
      const url = new URL(req.url)
      const queryParams: Record<string, string> = {}

      for (const [key, value] of url.searchParams.entries()) {
        queryParams[key] = value
      }

      const result = options.query.safeParse(queryParams)
      if (result.success) {
        validationResults.query = result.data
      } else {
        errors.push(result.error)
      }
    }

    // Validate path parameters
    if (options.params && routeParams) {
      const result = options.params.safeParse(routeParams)
      if (result.success) {
        validationResults.params = result.data
      } else {
        errors.push(result.error)
      }
    }

    if (errors.length > 0) {
      // Combine all errors
      const combinedError = new z.ZodError(errors.flatMap(error => error.errors))

      return {
        valid: false,
        response: validationErrorResponse(combinedError),
      }
    }

    return { valid: true, data: validationResults }
  }
}

/**
 * Simple validation helper for common cases
 */
export async function validateRequestBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<{ success: true; data: z.infer<T> } | { success: false; response: Response }> {
  try {
    const body = await req.json()
    const result = schema.safeParse(body)

    if (result.success) {
      return { success: true, data: result.data }
    } else {
      return {
        success: false,
        response: validationErrorResponse(result.error),
      }
    }
  } catch (error) {
    return {
      success: false,
      response: validationErrorResponse(
        new z.ZodError([
          {
            code: 'invalid_type',
            expected: 'object',
            received: 'string',
            path: [],
            message: 'Invalid JSON in request body',
          },
        ])
      ),
    }
  }
}

/**
 * Validation helper for query parameters
 */
export function validateQueryParams<T extends z.ZodType>(
  req: Request,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; response: Response } {
  const url = new URL(req.url)
  const params: Record<string, string> = {}

  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value
  }

  const result = schema.safeParse(params)

  if (result.success) {
    return { success: true, data: result.data }
  } else {
    return {
      success: false,
      response: validationErrorResponse(result.error),
    }
  }
}

/**
 * Validation helper for path parameters
 */
export function validatePathParams<T extends z.ZodType>(
  params: Record<string, string>,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; response: Response } {
  const result = schema.safeParse(params)

  if (result.success) {
    return { success: true, data: result.data }
  } else {
    return {
      success: false,
      response: validationErrorResponse(result.error),
    }
  }
}
