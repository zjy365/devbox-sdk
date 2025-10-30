/**
 * Core Architecture Components
 *
 * Exports the foundational building blocks for the Bun HTTP Server
 */

export { ServiceContainer } from './container'
export type { ServiceFactory } from './container'

export { Router } from './router'
export type { RouteHandler, RouteParams, RouteMatch } from './router'

export {
  executeMiddlewares,
  corsMiddleware,
  loggerMiddleware,
  errorHandlerMiddleware,
  timeoutMiddleware
} from './middleware'
export type { Middleware, NextFunction } from './middleware'

export {
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
} from './response-builder'
