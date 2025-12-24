/**
 * Logger utility for Devbox SDK
 * Controls log output level via LOG_LEVEL environment variable
 * Supports: INFO, WARN, ERROR (DEBUG is not supported)
 * Default: SILENT (no logs output)
 */

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SILENT = 'SILENT',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.SILENT]: Number.POSITIVE_INFINITY, // Highest priority, suppresses all logs
}

/**
 * Parse log level from environment variable
 * Defaults to SILENT if not set (no logs output)
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase()
  
  if (envLevel === 'INFO') {
    return LogLevel.INFO
  }
  if (envLevel === 'WARN' || envLevel === 'WARNING') {
    return LogLevel.WARN
  }
  if (envLevel === 'ERROR') {
    return LogLevel.ERROR
  }
  
  // Default to SILENT for any other value (including undefined)
  // This means no logs will be output unless explicitly enabled
  return LogLevel.SILENT
}

class Logger {
  private currentLevel: LogLevel

  constructor() {
    this.currentLevel = getLogLevelFromEnv()
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.currentLevel]
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`[INFO] ${message}`, ...args)
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`[WARN] ${message}`, ...args)
    }
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`[ERROR] ${message}`, ...args)
    }
  }
}

// Export singleton instance
export const logger = new Logger()

