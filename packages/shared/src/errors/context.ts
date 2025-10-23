/**
 * Error context interfaces providing detailed information about errors
 * Each context type corresponds to a specific category of operations
 */

/**
 * File operation error context
 */
export interface FileErrorContext {
  path: string
  operation: 'read' | 'write' | 'delete' | 'copy' | 'move' | 'list'
  reason?: string
  size?: number
  permissions?: string
}

/**
 * Process execution error context
 */
export interface ProcessErrorContext {
  command: string
  pid?: number
  exitCode?: number
  signal?: string
  stdout?: string
  stderr?: string
  timeout?: number
}

/**
 * Connection error context
 */
export interface ConnectionErrorContext {
  devboxName: string
  serverUrl: string
  attempt?: number
  maxAttempts?: number
  lastError?: string
  connectionId?: string
}

/**
 * Authentication error context
 */
export interface AuthErrorContext {
  reason: string
  kubeconfig?: string
  endpoint?: string
}

/**
 * Session error context
 */
export interface SessionErrorContext {
  sessionId: string
  state?: 'creating' | 'active' | 'terminating' | 'terminated'
  workingDir?: string
  reason?: string
}

/**
 * Devbox lifecycle error context
 */
export interface DevboxErrorContext {
  devboxName: string
  namespace?: string
  state?: string
  reason?: string
  resourceVersion?: string
}

/**
 * Validation error context
 */
export interface ValidationErrorContext {
  field: string
  value: unknown
  constraint: string
  expectedType?: string
}

/**
 * Union type of all error contexts
 */
export type ErrorContext =
  | FileErrorContext
  | ProcessErrorContext
  | ConnectionErrorContext
  | AuthErrorContext
  | SessionErrorContext
  | DevboxErrorContext
  | ValidationErrorContext
