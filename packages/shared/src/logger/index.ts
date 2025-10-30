/**
 * Shared logger system for Devbox SDK
 *
 * This module provides a structured logging system with:
 * - Multiple log levels (debug, info, warn, error)
 * - TraceID support for distributed tracing
 * - JSON and human-readable output formats
 * - Child loggers for context propagation
 */

export { LogLevel, Logger, createLogger, type LogEntry, type LoggerConfig } from './logger'
export {
  generateTraceId,
  createTraceContext,
  createChildSpan,
  type TraceContext,
} from './trace'
