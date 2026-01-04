/**
 * Global constants for the Devbox SDK
 */

export const DEFAULT_CONFIG = {
  /** Default base URL for Devbox API */
  BASE_URL: 'https://devbox.usw.sealos.io/v1',

  /** Default HTTP server port for containers */
  CONTAINER_HTTP_PORT: 3000,

  /** Default mock server configuration */
  MOCK_SERVER: {
    DEFAULT_URL: 'http://localhost:9757',
    ENV_VAR: 'MOCK_SERVER_URL',
  },

  /** Default HTTP client settings */
  HTTP_CLIENT: {
    TIMEOUT: 30000, // 30 seconds
    RETRIES: 3,
  },

  /** File operation limits */
  FILE_LIMITS: {
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    MAX_BATCH_SIZE: 50, // maximum files per batch
    CHUNK_SIZE: 1024 * 1024, // 1MB chunks for streaming
  },

  /** Performance targets */
  PERFORMANCE: {
    SMALL_FILE_LATENCY_MS: 50, // <50ms for files <1MB
    LARGE_FILE_THROUGHPUT_MBPS: 15, // >15MB/s for large files
    CONNECTION_REUSE_RATE: 0.98, // >98% connection reuse
    STARTUP_TIME_MS: 100, // <100ms Bun server startup
  },
} as const

export const API_ENDPOINTS = {
  /** Devbox management endpoints */
  DEVBOX: {
    LIST: '/api/v1/devbox',
    CREATE: '/api/v1/devbox',
    GET: '/api/v1/devbox/{name}',
    UPDATE: '/api/v1/devbox/{name}',
    DELETE: '/api/v1/devbox/{name}/delete',
    START: '/api/v1/devbox/{name}/start',
    PAUSE: '/api/v1/devbox/{name}/pause',
    RESTART: '/api/v1/devbox/{name}/restart',
    SHUTDOWN: '/api/v1/devbox/{name}/shutdown',
    MONITOR: '/api/v1/devbox/{name}/monitor',
    TEMPLATES: '/api/v1/devbox/templates',
    PORTS: '/api/v1/devbox/{name}/ports',
    AUTOSTART: '/api/v1/devbox/{name}/autostart',
    RELEASE: {
      LIST: '/api/v1/devbox/{name}/release',
      CREATE: '/api/v1/devbox/{name}/release',
      DELETE: '/api/v1/devbox/{name}/release/{tag}',
      DEPLOY: '/api/v1/devbox/{name}/release/{tag}/deploy',
    },
  },

  /** Container server endpoints */
  CONTAINER: {
    HEALTH: '/health',
    FILES: {
      WRITE: '/api/v1/files/write',
      READ: '/api/v1/files/read',
      LIST: '/api/v1/files/list',
      DELETE: '/api/v1/files/delete',
      MOVE: '/api/v1/files/move',
      RENAME: '/api/v1/files/rename',
      DOWNLOAD: '/api/v1/files/download',
      BATCH_UPLOAD: '/api/v1/files/batch-upload',
      BATCH_DOWNLOAD: '/api/v1/files/batch-download',
      SEARCH: '/api/v1/files/search',
      FIND: '/api/v1/files/find',
      REPLACE: '/api/v1/files/replace',
    },
    PROCESS: {
      EXEC: '/api/v1/process/exec',
      EXEC_SYNC: '/api/v1/process/exec-sync',
      EXEC_SYNC_STREAM: '/api/v1/process/sync-stream',
      LIST: '/api/v1/process/list',
      STATUS: '/api/v1/process/{process_id}/status',
      KILL: '/api/v1/process/{process_id}/kill',
      LOGS: '/api/v1/process/{process_id}/logs',
    },
    PORTS: '/api/v1/ports',
    // Temporarily disabled - ws module removed
    // WEBSOCKET: '/ws',
  },
} as const

export const ERROR_CODES = {
  /** Authentication errors */
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_KUBECONFIG: 'INVALID_KUBECONFIG',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  /** Connection errors */
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',

  /** Devbox errors */
  DEVBOX_NOT_FOUND: 'DEVBOX_NOT_FOUND',
  DEVBOX_NOT_READY: 'DEVBOX_NOT_READY',
  DEVBOX_CREATION_FAILED: 'DEVBOX_CREATION_FAILED',
  DEVBOX_OPERATION_FAILED: 'DEVBOX_OPERATION_FAILED',

  /** Validation errors */
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  INVALID_JSON_FORMAT: 'INVALID_JSON_FORMAT',
  INVALID_PATH: 'INVALID_PATH',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  /** Resource errors */
  NOT_FOUND: 'NOT_FOUND',
  PROCESS_NOT_FOUND: 'PROCESS_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',

  /** State errors */
  CONFLICT: 'CONFLICT',
  PROCESS_ALREADY_RUNNING: 'PROCESS_ALREADY_RUNNING',
  PROCESS_NOT_RUNNING: 'PROCESS_NOT_RUNNING',
  SESSION_INACTIVE: 'SESSION_INACTIVE',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  PROCESS_ALREADY_TERMINATED: 'PROCESS_ALREADY_TERMINATED',

  /** Operation errors */
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  OPERATION_FAILED: 'OPERATION_FAILED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  SIGNAL_FAILED: 'SIGNAL_FAILED',

  /** File operation errors */
  FILE_OPERATION_ERROR: 'FILE_OPERATION_ERROR',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TRANSFER_FAILED: 'FILE_TRANSFER_FAILED',
  PATH_TRAVERSAL_DETECTED: 'PATH_TRAVERSAL_DETECTED',
  DIRECTORY_NOT_EMPTY: 'DIRECTORY_NOT_EMPTY',
  DISK_FULL: 'DISK_FULL',
  FILE_LOCKED: 'FILE_LOCKED',

  /** Process errors */
  PROCESS_START_FAILED: 'PROCESS_START_FAILED',
  INVALID_SIGNAL: 'INVALID_SIGNAL',
  PROCESS_LIMIT_EXCEEDED: 'PROCESS_LIMIT_EXCEEDED',

  /** Session errors */
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  SESSION_LIMIT_EXCEEDED: 'SESSION_LIMIT_EXCEEDED',
  SESSION_TIMEOUT: 'SESSION_TIMEOUT',
  SHELL_NOT_FOUND: 'SHELL_NOT_FOUND',

  /** WebSocket errors */
  // Temporarily disabled - ws module removed
  // WEBSOCKET_CONNECTION_FAILED: 'WEBSOCKET_CONNECTION_FAILED',
  // INVALID_SUBSCRIPTION: 'INVALID_SUBSCRIPTION',
  // TARGET_NOT_SUBSCRIBABLE: 'TARGET_NOT_SUBSCRIBABLE',

  /** Server errors */
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',
  HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
} as const

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const
