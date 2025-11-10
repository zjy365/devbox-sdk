/**
 * 重试策略工具
 * 为网络请求和关键操作提供自动重试能力
 */

/**
 * 可重试的错误接口
 */
export interface RetryableError {
  code?: string
  status?: number
  statusCode?: number
  message?: string
  [key: string]: unknown
}

export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number
  /** 初始延迟时间（毫秒） */
  initialDelay: number
  /** 最大延迟时间（毫秒） */
  maxDelay: number
  /** 延迟增长因子（指数退避） */
  factor: number
  /** 总超时时间（毫秒），可选 */
  timeout?: number
  /** 自定义重试条件判断函数 */
  shouldRetry?: (error: unknown) => boolean
  /** 重试前的回调 */
  onRetry?: (error: unknown, attempt: number) => void
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
}

/**
 * 执行带重试的异步操作
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
 * 检查是否超时
 */
function checkTimeout(startTime: number, timeout?: number): void {
  if (timeout && Date.now() - startTime > timeout) {
    throw new Error(`Operation timed out after ${timeout}ms`)
  }
}

/**
 * 计算重试延迟时间
 */
function calculateDelay(attempt: number, opts: RetryOptions): number {
  return Math.min(opts.initialDelay * opts.factor ** attempt, opts.maxDelay)
}

/**
 * 处理重试日志和回调
 */
function handleRetryCallback(error: unknown, attempt: number, opts: RetryOptions): void {
  const errorObj = error as Error
  if (opts.onRetry) {
    opts.onRetry(error, attempt + 1)
  }

  console.debug(
    `[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed: ${errorObj.message}. ` +
      `Retrying after ${calculateDelay(attempt, opts)}ms...`
  )
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

      // 最后一次尝试，直接抛出错误
      if (attempt === opts.maxRetries) {
        throw lastError
      }

      // 判断是否可重试
      const shouldRetry = opts.shouldRetry ? opts.shouldRetry(error) : isRetryable(error)

      if (!shouldRetry) {
        throw lastError
      }

      // 计算延迟并等待
      const delay = calculateDelay(attempt, opts)
      handleRetryCallback(error, attempt, opts)
      await sleep(delay)
    }
  }

  // 这里不应该到达，但为了类型安全
  throw new Error('Unexpected error in retry logic')
}

/**
 * 检查是否为可重试的网络错误
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
 * 检查是否为可重试的HTTP状态码
 */
function isRetryableHTTPStatus(errorObj: RetryableError): boolean {
  const status = errorObj.status || errorObj.statusCode

  if (!status) {
    return false
  }

  // 5xx 服务器错误可重试
  if (status >= 500 && status < 600) {
    return true
  }

  // 429 Too Many Requests 可重试
  if (status === 429) {
    return true
  }

  // 408 Request Timeout 可重试
  if (status === 408) {
    return true
  }

  return false
}

/**
 * 检查是否为超时错误
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
 * 判断错误是否可重试
 */
function isRetryable(error: unknown): boolean {
  const errorObj = error as RetryableError

  return (
    isRetryableNetworkError(errorObj) ||
    isRetryableHTTPStatus(errorObj) ||
    isTimeoutError(errorObj)
  )
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带重试的批量操作
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
 * 带重试的批量操作（允许部分失败）
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
 * 创建重试包装器
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
 * 断路器状态
 */
enum CircuitState {
  CLOSED = 'CLOSED', // 正常状态
  OPEN = 'OPEN', // 断开状态（快速失败）
  HALF_OPEN = 'HALF_OPEN', // 半开状态（尝试恢复）
}

/**
 * 断路器配置
 */
export interface CircuitBreakerOptions {
  /** 失败阈值 */
  failureThreshold: number
  /** 成功阈值（用于从半开状态恢复） */
  successThreshold: number
  /** 超时时间（毫秒） */
  timeout: number
  /** 重置超时（毫秒） */
  resetTimeout: number
}

/**
 * 断路器实现
 * 防止对故障服务的重复调用
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
      // 尝试半开状态
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
 * 创建断路器
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
