import { DevboxSDKError, ERROR_CODES } from '../utils/error'
import type { HTTPResponse, RequestOptions } from './types'

export class DevboxContainerClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl: string, timeout = 30000) {
    this.baseUrl = baseUrl
    this.timeout = timeout
  }

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>> {
    return this.request<T>('GET', path, options)
  }

  async post<T = unknown>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>> {
    return this.request<T>('POST', path, options)
  }

  async put<T = unknown>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>> {
    return this.request<T>('PUT', path, options)
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>> {
    return this.request<T>('DELETE', path, options)
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    options?: RequestOptions
  ): Promise<HTTPResponse<T>> {
    const url = new URL(path, this.baseUrl)

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      }
    }

    // Check for FormData (undici FormData or browser FormData)
    const isFormData =
      options?.body !== undefined &&
      options.body instanceof FormData

    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options?.headers,
        "Authorization": "Bearer 1234",//TODO: remove this
      },
      signal: options?.signal,
    }

    if (options?.body !== undefined) {
      if (isFormData) {
        // undici FormData automatically handles Content-Type with boundary
        fetchOptions.body = options.body as FormData
      } else if (typeof options.body === 'string') {
        fetchOptions.body = options.body
      } else if (Buffer.isBuffer(options.body) || options.body instanceof ArrayBuffer || options.body instanceof Uint8Array) {
        // Support binary data (Buffer, ArrayBuffer, Uint8Array)
        // fetch API natively supports these types
        fetchOptions.body = options.body as unknown as RequestInit['body']
      } else {
        fetchOptions.body = JSON.stringify(options.body)
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
    console.log('url', url.toString())
    // console.log('fetchOptions', fetchOptions)
     const response = await fetch(url.toString(), {
        ...fetchOptions,
        signal: options?.signal || controller.signal,
      })
    // console.log('response', response);
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new DevboxSDKError(
          `HTTP ${response.status}: ${response.statusText}`,
          ERROR_CODES.CONNECTION_FAILED,
          { status: response.status, statusText: response.statusText }
        )
      }

      const contentType = response.headers.get('content-type') || ''
      let data: T

      if (contentType.includes('application/json')) {
        data = (await response.json()) as T
      } else {
        data = (await response.text()) as T
      }
      console.log('data', data)
      return {
        data,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url,
      }
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof DevboxSDKError) {
        throw error
      }
      
      throw new DevboxSDKError(
        `Request failed: ${(error as Error).message}`,
        ERROR_CODES.CONNECTION_FAILED,
        { originalError: (error as Error).message }
      )
    }
  }
}

