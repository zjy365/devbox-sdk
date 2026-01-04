/**
 * Shared error system for Devbox SDK
 *
 * This module provides a centralized error handling system with:
 * - Standardized error codes
 * - HTTP status mapping
 * - Error context for detailed information
 * - Suggestions for error resolution
 * - TraceID support for distributed tracing
 */

export { ErrorCode, ERROR_HTTP_STATUS } from './codes'
export type {
  FileErrorContext,
  ProcessErrorContext,
  ConnectionErrorContext,
  AuthErrorContext,
  SessionErrorContext,
  DevboxErrorContext,
  ValidationErrorContext,
  ErrorContext,
} from './context'
export {
  type ErrorResponse,
  DevboxError,
  createErrorResponse,
  isDevboxError,
  toDevboxError,
} from './response'
