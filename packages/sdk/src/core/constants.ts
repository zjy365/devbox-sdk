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

  /** Default connection pool settings */
  CONNECTION_POOL: {
    MAX_SIZE: 15,
    CONNECTION_TIMEOUT: 30000, // 30 seconds
    KEEP_ALIVE_INTERVAL: 60000, // 1 minute
    HEALTH_CHECK_INTERVAL: 60000, // 1 minute
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

  /** Container HTTP server endpoints */
  CONTAINER: {
    HEALTH: '/health',
    FILES: {
      WRITE: '/files/write',
      READ: '/files/read',
      LIST: '/files/list',
      DELETE: '/files/delete',
      BATCH_UPLOAD: '/files/batch-upload',
      BATCH_DOWNLOAD: '/files/batch-download',
    },
    PROCESS: {
      EXEC: '/process/exec',
      STATUS: '/process/status/{pid}',
    },
    WEBSOCKET: '/ws',
  },
} as const

export const ERROR_CODES = {
  /** Authentication errors */
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_KUBECONFIG: 'INVALID_KUBECONFIG',

  /** Connection errors */
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_POOL_EXHAUSTED: 'CONNECTION_POOL_EXHAUSTED',

  /** Devbox errors */
  DEVBOX_NOT_FOUND: 'DEVBOX_NOT_FOUND',
  DEVBOX_CREATION_FAILED: 'DEVBOX_CREATION_FAILED',
  DEVBOX_OPERATION_FAILED: 'DEVBOX_OPERATION_FAILED',

  /** File operation errors */
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TRANSFER_FAILED: 'FILE_TRANSFER_FAILED',
  PATH_TRAVERSAL_DETECTED: 'PATH_TRAVERSAL_DETECTED',

  /** Server errors */
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',
  HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED',

  /** General errors */
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
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
