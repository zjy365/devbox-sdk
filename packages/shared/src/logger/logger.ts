/**
 * Structured logger with TraceID support
 */

import type { TraceContext } from './trace'

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  traceId?: string
  spanId?: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
  enableJson: boolean
}

/**
 * Logger class with TraceID support
 */
export class Logger {
  private config: LoggerConfig
  private traceContext?: TraceContext

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? LogLevel.INFO,
      enableConsole: config.enableConsole ?? true,
      enableJson: config.enableJson ?? false,
    }
  }

  /**
   * Set trace context for all subsequent logs
   */
  setTraceContext(context: TraceContext): void {
    this.traceContext = context
  }

  /**
   * Clear trace context
   */
  clearTraceContext(): void {
    this.traceContext = undefined
  }

  /**
   * Create a child logger with the same configuration
   */
  child(context: Partial<TraceContext>): Logger {
    const childLogger = new Logger(this.config)
    if (this.traceContext) {
      childLogger.setTraceContext({
        ...this.traceContext,
        ...context,
      })
    }
    return childLogger
  }

  /**
   * Debug level log
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * Info level log
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Warning level log
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * Error level log
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, {
      ...context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    })
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // Check if log level is enabled
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      traceId: this.traceContext?.traceId,
      spanId: this.traceContext?.spanId,
      context,
    }

    if (this.config.enableConsole) {
      this.writeToConsole(entry)
    }
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    if (this.config.enableJson) {
      console.log(JSON.stringify(entry))
      return
    }

    const { level, message, timestamp, traceId, context } = entry
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    const traceStr = traceId ? ` [trace:${traceId}]` : ''

    const coloredMessage = this.colorizeLog(
      level,
      `[${timestamp}] ${level.toUpperCase()}:${traceStr} ${message}${contextStr}`
    )

    console.log(coloredMessage)
  }

  /**
   * Add color to log messages (for terminal output)
   */
  private colorizeLog(level: LogLevel, message: string): string {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m', // Green
      [LogLevel.WARN]: '\x1b[33m', // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    }
    const reset = '\x1b[0m'
    return `${colors[level]}${message}${reset}`
  }
}

/**
 * Create a default logger instance
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config)
}
