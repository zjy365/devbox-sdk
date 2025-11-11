/**
 * HTTP client type definitions
 */

/**
 * HTTP request options
 */
export interface RequestOptions {
  headers?: Record<string, string>
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
  timeout?: number
  signal?: AbortSignal
}

/**
 * HTTP response wrapper
 */
export interface HTTPResponse<T = unknown> {
  data: T
  status: number
  headers: Record<string, string>
  url: string
}
