/**
 * Custom error classes for the Devbox SDK
 */

export class DevboxSDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message)
    this.name = 'DevboxSDKError'
  }
}

export class AuthenticationError extends DevboxSDKError {
  constructor(message: string, context?: any) {
    super(message, 'AUTHENTICATION_FAILED', context)
    this.name = 'AuthenticationError'
  }
}

export class ConnectionError extends DevboxSDKError {
  constructor(message: string, context?: any) {
    super(message, 'CONNECTION_FAILED', context)
    this.name = 'ConnectionError'
  }
}

export class FileOperationError extends DevboxSDKError {
  constructor(message: string, context?: any) {
    super(message, 'FILE_TRANSFER_FAILED', context)
    this.name = 'FileOperationError'
  }
}

export class DevboxNotFoundError extends DevboxSDKError {
  constructor(devboxName: string, context?: any) {
    super(`Devbox '${devboxName}' not found`, 'DEVBOX_NOT_FOUND', context)
    this.name = 'DevboxNotFoundError'
  }
}

export class ValidationError extends DevboxSDKError {
  constructor(message: string, context?: any) {
    super(message, 'VALIDATION_ERROR', context)
    this.name = 'ValidationError'
  }
}

export { ERROR_CODES } from '../core/constants'
