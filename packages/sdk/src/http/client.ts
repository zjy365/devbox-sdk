import { DevboxSDKError, ERROR_CODES, parseServerResponse, type ServerResponse } from '../utils/error'
import type { HTTPResponse, RequestOptions } from './types'

export class DevboxContainerClient {
  private baseUrl: string
  private timeout: number
  private token: string

  constructor(baseUrl: string, timeout: number, token: string) {
    this.baseUrl = baseUrl
    this.timeout = timeout
    this.token = token
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
        // Base64 解码 token 后作为 Bearer token
        "Authorization": `Bearer ${Buffer.from(this.token, 'base64').toString('utf-8')}`,
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
      const response = await fetch(url.toString(), {
        ...fetchOptions,
        signal: options?.signal || controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorData: { error?: string; code?: string; timestamp?: number } = {}
        try {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            errorData = (await response.json()) as { error?: string; code?: string; timestamp?: number }
          }
        } catch (e) {
          // error
        }

        const errorMessage = errorData.error || response.statusText
        const errorCode = errorData.code || ERROR_CODES.CONNECTION_FAILED

        throw new DevboxSDKError(
          errorMessage,
          errorCode,
          {
            status: response.status,
            statusText: response.statusText,
            timestamp: errorData.timestamp,
            serverErrorCode: errorData.code,
          }
        )
      }

      const contentType = response.headers.get('content-type') || ''
      let data: T

      if (contentType.includes('application/json')) {
        const jsonData = (await response.json()) as ServerResponse<T>
        data = parseServerResponse(jsonData)
      } else if (contentType.includes('application/octet-stream') ||
        contentType.includes('application/gzip') ||
        contentType.includes('application/x-tar') ||
        contentType.includes('multipart/') ||
        contentType.includes('image/') ||
        contentType.includes('video/') ||
        contentType.includes('audio/')) {
        const arrayBuffer = await response.arrayBuffer()
        data = (Buffer.from(arrayBuffer) as unknown) as T
      } else {
        const arrayBuffer = await response.arrayBuffer()
        data = (Buffer.from(arrayBuffer) as unknown) as T
      }

      console.log('url', url.toString())
      console.log('response', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      })
      return {
        data,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url,
      }
    } catch (error) {
      console.log('error', error)
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

