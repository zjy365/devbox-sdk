/**
 * Retry strategy utilities
 * Provides automatic retry capability for network requests and critical operations
 */

/**
 * Retryable error interface
 */
export interface RetryableError {
  code?: string
  status?: number
  statusCode?: number
  message?: string
  [key: string]: unknown
}

export interface RetryOptions {
  /** Maximum number of retries */
  maxRetries: number
  /** Initial delay time in milliseconds */
  initialDelay: number
  /** Maximum delay time in milliseconds */
  maxDelay: number
  /** Delay growth factor (exponential backoff) */
  factor: number
  /** Total timeout in milliseconds, optional */
  timeout?: number
  /** Custom retry condition function */
  shouldRetry?: (error: unknown) => boolean
  /** Callback before retry */
  onRetry?: (error: unknown, attempt: number) => void
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
}

/**
 * Execute async operation with retry
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => apiClient.request('/data'),
 *   { maxRetries: 5, initialDelay: 500 }
 * )
 * ```
 */
/**
 * Check if operation has timed out
 */
function checkTimeout(startTime: number, timeout?: number): void {
  if (timeout && Date.now() - startTime > timeout) {
    throw new Error(`Operation timed out after ${timeout}ms`)
  }
}

/**
 * Calculate retry delay time
 */
function calculateDelay(attempt: number, opts: RetryOptions): number {
  return Math.min(opts.initialDelay * opts.factor ** attempt, opts.maxDelay)
}

/**
 * Handle retry logging and callbacks
 */
function handleRetryCallback(error: unknown, attempt: number, opts: RetryOptions): void {
  const errorObj = error as Error
  if (opts.onRetry) {
    opts.onRetry(error, attempt + 1)
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options }
  const startTime = Date.now()

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      checkTimeout(startTime, opts.timeout)
      return await operation()
    } catch (error) {
      const lastError = error as Error

      // Last attempt, throw error directly
      if (attempt === opts.maxRetries) {
        throw lastError
      }

      // Determine if error is retryable
      const shouldRetry = opts.shouldRetry ? opts.shouldRetry(error) : isRetryable(error)

      if (!shouldRetry) {
        throw lastError
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts)
      handleRetryCallback(error, attempt, opts)
      await sleep(delay)
    }
  }

  // This should not be reached, but for type safety
  throw new Error('Unexpected error in retry logic')
}

/**
 * Check if error is a retryable network error
 */
function isRetryableNetworkError(errorObj: RetryableError): boolean {
  const retryableNetworkErrors = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
  ]

  return !!(errorObj.code && retryableNetworkErrors.includes(errorObj.code))
}

/**
 * Check if error is a retryable HTTP status code
 */
function isRetryableHTTPStatus(errorObj: RetryableError): boolean {
  const status = errorObj.status || errorObj.statusCode

  if (!status) {
    return false
  }

  // 5xx server errors are retryable
  if (status >= 500 && status < 600) {
    return true
  }

  // 429 Too Many Requests is retryable
  if (status === 429) {
    return true
  }

  // 408 Request Timeout is retryable
  if (status === 408) {
    return true
  }

  return false
}

/**
 * Check if error is a timeout error
 */
function isTimeoutError(errorObj: RetryableError): boolean {
  if (!errorObj.message) {
    return false
  }

  return (
    errorObj.message.includes('timeout') ||
    errorObj.message.includes('timed out') ||
    errorObj.message.includes('ETIMEDOUT')
  )
}

/**
 * Determine if error is retryable
 */
function isRetryable(error: unknown): boolean {
  const errorObj = error as RetryableError

  // Check if it's a DevboxSDKError with a server error code
  if (errorObj.code) {
    // Import ERROR_CODES dynamically to avoid circular dependency
    const ERROR_CODES = {
      // 4xx errors that should NOT be retried (except specific cases)
      UNAUTHORIZED: 'UNAUTHORIZED',
      INVALID_TOKEN: 'INVALID_TOKEN',
      TOKEN_EXPIRED: 'TOKEN_EXPIRED',
      INVALID_REQUEST: 'INVALID_REQUEST',
      MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
      INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
      NOT_FOUND: 'NOT_FOUND',
      FILE_NOT_FOUND: 'FILE_NOT_FOUND',
      PROCESS_NOT_FOUND: 'PROCESS_NOT_FOUND',
      SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
      CONFLICT: 'CONFLICT',
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      // 4xx errors that CAN be retried
      OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
      SESSION_TIMEOUT: 'SESSION_TIMEOUT',
      // 5xx errors that CAN be retried
      INTERNAL_ERROR: 'INTERNAL_ERROR',
      SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
      SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',
      CONNECTION_FAILED: 'CONNECTION_FAILED',
      CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
    } as const

    // Don't retry on client errors (4xx) except for timeout errors
    const nonRetryable4xxCodes = [
      ERROR_CODES.UNAUTHORIZED,
      ERROR_CODES.INVALID_TOKEN,
      ERROR_CODES.TOKEN_EXPIRED,
      ERROR_CODES.INVALID_REQUEST,
      ERROR_CODES.MISSING_REQUIRED_FIELD,
      ERROR_CODES.INVALID_FIELD_VALUE,
      ERROR_CODES.NOT_FOUND,
      ERROR_CODES.FILE_NOT_FOUND,
      ERROR_CODES.PROCESS_NOT_FOUND,
      ERROR_CODES.SESSION_NOT_FOUND,
      ERROR_CODES.CONFLICT,
      ERROR_CODES.VALIDATION_ERROR,
    ]

    if (nonRetryable4xxCodes.includes(errorObj.code as any)) {
      return false
    }

    // Retry on timeout and server errors
    const retryableCodes = [
      ERROR_CODES.OPERATION_TIMEOUT,
      ERROR_CODES.SESSION_TIMEOUT,
      ERROR_CODES.INTERNAL_ERROR,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      ERROR_CODES.SERVER_UNAVAILABLE,
      ERROR_CODES.CONNECTION_FAILED,
      ERROR_CODES.CONNECTION_TIMEOUT,
    ]

    if (retryableCodes.includes(errorObj.code as any)) {
      return true
    }
  }

  return (
    isRetryableNetworkError(errorObj) || isRetryableHTTPStatus(errorObj) || isTimeoutError(errorObj)
  )
}

/**
 * Sleep/delay function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Batch operations with retry
 *
 * @example
 * ```ts
 * const results = await retryBatch(
 *   [task1, task2, task3],
 *   { maxRetries: 2 }
 * )
 * ```
 */
export async function retryBatch<T>(
  operations: Array<() => Promise<T>>,
  options: Partial<RetryOptions> = {}
): Promise<T[]> {
  return Promise.all(operations.map(op => withRetry(op, options)))
}

/**
 * Batch operations with retry (allows partial failures)
 *
 * @example
 * ```ts
 * const results = await retryBatchSettled(
 *   [task1, task2, task3],
 *   { maxRetries: 2 }
 * )
 * ```
 */
export async function retryBatchSettled<T>(
  operations: Array<() => Promise<T>>,
  options: Partial<RetryOptions> = {}
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }>> {
  const promises = operations.map(op => withRetry(op, options))
  return Promise.allSettled(promises)
}

/**
 * Create retry wrapper
 *
 * @example
 * ```ts
 * const retryableRequest = createRetryWrapper(
 *   (url: string) => fetch(url),
 *   { maxRetries: 5 }
 * )
 *
 * const response = await retryableRequest('https://api.example.com/data')
 * ```
 */
export function createRetryWrapper<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: Partial<RetryOptions> = {}
): T {
  return ((...args: unknown[]) => {
    return withRetry(() => fn(...args), options)
  }) as T
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'CLOSED', // Normal state
  OPEN = 'OPEN', // Open state (fast fail)
  HALF_OPEN = 'HALF_OPEN', // Half-open state (attempting recovery)
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  /** Failure threshold */
  failureThreshold: number
  /** Success threshold (for recovery from half-open state) */
  successThreshold: number
  /** Timeout in milliseconds */
  timeout: number
  /** Reset timeout in milliseconds */
  resetTimeout: number
}

/**
 * Circuit breaker implementation
 * Prevents repeated calls to failing services
 */
export class CircuitBreaker<T extends (...args: unknown[]) => Promise<unknown>> {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private nextAttempt = Date.now()

  constructor(
    private fn: T,
    private options: CircuitBreakerOptions
  ) {}

  async execute(...args: Parameters<T>): Promise<ReturnType<T>> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN')
      }
      // Attempt half-open state
      this.state = CircuitState.HALF_OPEN
      this.successCount = 0
    }

    try {
      const result = await this.fn(...args)
      this.onSuccess()
      return result as ReturnType<T>
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED
        this.successCount = 0
      }
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.successCount = 0

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN
      this.nextAttempt = Date.now() + this.options.resetTimeout
    }
  }

  getState(): CircuitState {
    return this.state
  }

  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.nextAttempt = Date.now()
  }
}

/**
 * Create circuit breaker
 */
export function createCircuitBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: Partial<CircuitBreakerOptions> = {}
): CircuitBreaker<T> {
  const defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    resetTimeout: 60000,
  }

  return new CircuitBreaker(fn, { ...defaultOptions, ...options })
}
