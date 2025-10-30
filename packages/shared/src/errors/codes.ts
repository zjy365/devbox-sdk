/**
 * Error codes for Devbox SDK operations
 * Organized by category for better maintainability
 */
export enum ErrorCode {
  // ============================================
  // Authentication & Authorization (401, 403)
  // ============================================
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_KUBECONFIG = 'INVALID_KUBECONFIG',

  // ============================================
  // File Operations (404, 409, 413)
  // ============================================
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_ALREADY_EXISTS = 'FILE_ALREADY_EXISTS',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  DIRECTORY_NOT_EMPTY = 'DIRECTORY_NOT_EMPTY',
  INVALID_PATH = 'INVALID_PATH',
  PATH_TRAVERSAL_DETECTED = 'PATH_TRAVERSAL_DETECTED',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',

  // ============================================
  // Process Operations (400, 408, 500)
  // ============================================
  PROCESS_NOT_FOUND = 'PROCESS_NOT_FOUND',
  PROCESS_ALREADY_RUNNING = 'PROCESS_ALREADY_RUNNING',
  PROCESS_EXECUTION_FAILED = 'PROCESS_EXECUTION_FAILED',
  PROCESS_TIMEOUT = 'PROCESS_TIMEOUT',
  INVALID_COMMAND = 'INVALID_COMMAND',

  // ============================================
  // Session Operations (404, 409, 500)
  // ============================================
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_CREATION_FAILED = 'SESSION_CREATION_FAILED',
  SESSION_TERMINATED = 'SESSION_TERMINATED',

  // ============================================
  // Connection & Network (500, 502, 503, 504)
  // ============================================
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',

  // ============================================
  // Devbox Lifecycle (404, 409, 500)
  // ============================================
  DEVBOX_NOT_FOUND = 'DEVBOX_NOT_FOUND',
  DEVBOX_ALREADY_EXISTS = 'DEVBOX_ALREADY_EXISTS',
  DEVBOX_CREATION_FAILED = 'DEVBOX_CREATION_FAILED',
  DEVBOX_NOT_RUNNING = 'DEVBOX_NOT_RUNNING',
  DEVBOX_START_FAILED = 'DEVBOX_START_FAILED',

  // ============================================
  // Validation & Input (400)
  // ============================================
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // ============================================
  // General Errors (500)
  // ============================================
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

/**
 * Map error codes to HTTP status codes
 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  // Authentication & Authorization
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.PERMISSION_DENIED]: 403,
  [ErrorCode.INVALID_KUBECONFIG]: 401,

  // File Operations
  [ErrorCode.FILE_NOT_FOUND]: 404,
  [ErrorCode.FILE_ALREADY_EXISTS]: 409,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.DIRECTORY_NOT_FOUND]: 404,
  [ErrorCode.DIRECTORY_NOT_EMPTY]: 409,
  [ErrorCode.INVALID_PATH]: 400,
  [ErrorCode.PATH_TRAVERSAL_DETECTED]: 403,
  [ErrorCode.FILE_READ_ERROR]: 500,
  [ErrorCode.FILE_WRITE_ERROR]: 500,

  // Process Operations
  [ErrorCode.PROCESS_NOT_FOUND]: 404,
  [ErrorCode.PROCESS_ALREADY_RUNNING]: 409,
  [ErrorCode.PROCESS_EXECUTION_FAILED]: 500,
  [ErrorCode.PROCESS_TIMEOUT]: 408,
  [ErrorCode.INVALID_COMMAND]: 400,

  // Session Operations
  [ErrorCode.SESSION_NOT_FOUND]: 404,
  [ErrorCode.SESSION_ALREADY_EXISTS]: 409,
  [ErrorCode.SESSION_CREATION_FAILED]: 500,
  [ErrorCode.SESSION_TERMINATED]: 500,

  // Connection & Network
  [ErrorCode.CONNECTION_FAILED]: 500,
  [ErrorCode.CONNECTION_TIMEOUT]: 504,
  [ErrorCode.CONNECTION_REFUSED]: 502,
  [ErrorCode.CONNECTION_LOST]: 500,
  [ErrorCode.SERVER_UNAVAILABLE]: 503,
  [ErrorCode.NETWORK_ERROR]: 500,

  // Devbox Lifecycle
  [ErrorCode.DEVBOX_NOT_FOUND]: 404,
  [ErrorCode.DEVBOX_ALREADY_EXISTS]: 409,
  [ErrorCode.DEVBOX_CREATION_FAILED]: 500,
  [ErrorCode.DEVBOX_NOT_RUNNING]: 409,
  [ErrorCode.DEVBOX_START_FAILED]: 500,

  // Validation & Input
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCode.INVALID_PARAMETER]: 400,
  [ErrorCode.VALIDATION_ERROR]: 400,

  // General Errors
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.UNKNOWN_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
}
