/**
 * API response and request type definitions
 */

/**
 * Devbox runtime environment enum
 */
export enum DevboxRuntime {
  NUXT3 = 'nuxt3',
  ANGULAR = 'angular',
  QUARKUS = 'quarkus',
  UBUNTU = 'ubuntu',
  FLASK = 'flask',
  JAVA = 'java',
  CHI = 'chi',
  NET = 'net',
  IRIS = 'iris',
  HEXO = 'hexo',
  PYTHON = 'python',
  DOCUSAURUS = 'docusaurus',
  VITEPRESS = 'vitepress',
  CPP = 'cpp',
  VUE = 'vue',
  NGINX = 'nginx',
  ROCKET = 'rocket',
  DEBIAN_SSH = 'debian-ssh',
  VERT_X = 'vert.x',
  EXPRESS_JS = 'express.js',
  DJANGO = 'django',
  NEXT_JS = 'next.js',
  SEALAF = 'sealaf',
  GO = 'go',
  REACT = 'react',
  PHP = 'php',
  SVELTE = 'svelte',
  C = 'c',
  ASTRO = 'astro',
  UMI = 'umi',
  GIN = 'gin',
  NODE_JS = 'node.js',
  ECHO = 'echo',
  RUST = 'rust',
  TEST_AGENT = 'node-expt-agent'
}

/**
 * Port configuration interface
 */
export interface PortConfiguration {
  /** Port number */
  number: number
  /** Port protocol (tcp/udp) */
  protocol: 'tcp' | 'udp'
  /** Publicly accessible address */
  publicAddress?: string
  /** Private container address */
  privateAddress?: string
  /** Port name/identifier */
  name?: string
  /** Whether port is currently active */
  isActive?: boolean
  /** Port status */
  status?: 'open' | 'closed' | 'pending'
}

/**
 * Network configuration interface
 */
export interface NetworkConfiguration {
  /** Network name */
  name: string
  /** Network type */
  type: 'bridge' | 'host' | 'overlay'
  /** Network subnet */
  subnet?: string
  /** Gateway address */
  gateway?: string
  /** DNS servers */
  dns?: string[]
  /** Network status */
  status?: 'active' | 'inactive' | 'error'
  /** IP address assigned to container */
  ipAddress?: string
  /** MAC address */
  macAddress?: string
}

export interface KubeconfigAuth {
  kubeconfig: string
}

export interface APIClientConfig {
  kubeconfig: string
  baseUrl?: string
  timeout?: number
  retries?: number
  /** Allow self-signed certificates (ONLY for development/testing, NOT recommended for production) */
  rejectUnauthorized?: boolean
}

export interface DevboxCreateRequest {
  name: string
  runtime: DevboxRuntime
  resource: {
    cpu: number
    memory: number
  }
  ports?: Array<{
    number: number
    protocol: string
  }>
  env?: Record<string, string>
}

export interface DevboxSSHInfoResponse {
  name: string
  ssh: {
    host: string
    port: number
    user: string
    privateKey: string
  }
  podIP?: string
  status: string
  runtime: DevboxRuntime
  resources: {
    cpu: number
    memory: number
  }
}

export interface DevboxCreateResponse {
  name: string
  sshPort: number
  base64PrivateKey: string
  userName: string
  workingDir: string
  domain: string
  ports: PortConfiguration[]
  summary: {
    totalPorts: number
    successfulPorts: number
    failedPorts: number
  }
}

export interface DevboxGetResponse {
  name: string
  iconId?: string // May not exist
  runtime?: string // Actually included in API response
  status:
  | string
  | {
    // May be string or object
    value: string
    label: string
  }
  cpu?: number // in millicores (may not exist, use resources instead)
  memory?: number // in MB (may not exist, use resources instead)
  resources?: {
    // Actually used in API response
    cpu: number
    memory: number
  }
  sshPort?: number
  networks?: NetworkConfiguration[]
  [key: string]: unknown // other fields we don't care about
}

export interface DevboxListResponse {
  devboxes: DevboxSSHInfoResponse[]
}

export interface MonitorRequest {
  start: number
  end: number
  step?: string
}

export interface MonitorDataPoint {
  cpu: number
  memory: number
  network: {
    bytesIn: number
    bytesOut: number
  }
  disk: {
    used: number
    total: number
  }
  timestamp: number
}

export interface APIResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
}

/**
 * HTTP request options
 */
export interface RequestOptions {
  headers?: Record<string, string>
  params?: Record<string, unknown>
  data?: unknown
}

/**
 * Error detail information
 */
export interface ErrorDetail {
  field?: string
  reason?: string
  value?: unknown
  additionalInfo?: Record<string, unknown>
}

export interface APIError {
  error: string // Field name returned by server
  code: string
  timestamp: number
  details?: ErrorDetail | ErrorDetail[] | Record<string, unknown>
  // Backward compatibility: keep message field as alias for error
  message?: string
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: number
  uptime: number
  version: string
}

// ============ Extended Types for Complete API Coverage ============

/**
 * Port configuration
 */
export interface PortConfig {
  number: number // 1-65535
  protocol?: 'HTTP' | 'GRPC' | 'WS'
  exposesPublicDomain?: boolean
  customDomain?: string
  portName?: string // Used for updating existing ports
}

/**
 * Environment variable configuration
 */
export interface EnvVar {
  name: string
  value?: string
  valueFrom?: {
    secretKeyRef: {
      name: string
      key: string
    }
  }
}

/**
 * Request to create a new Devbox
 */
export interface CreateDevboxRequest {
  name: string
  runtime: DevboxRuntime
  resource: {
    cpu: number // 0.1, 0.2, 0.5, 1, 2, 4, 8, 16
    memory: number // 0.1, 0.5, 1, 2, 4, 8, 16, 32
  }
  ports?: PortConfig[]
  env?: EnvVar[]
  autostart?: boolean
}

/**
 * Request to update Devbox configuration
 */
export interface UpdateDevboxRequest {
  resource?: {
    cpu: number
    memory: number
  }
  ports?: PortConfig[]
}

/**
 * Devbox list item (simplified info)
 */
export interface DevboxListItem {
  name: string
  uid: string
  resourceType: 'devbox'
  runtime: DevboxRuntime
  status: string
  resources: {
    cpu: number
    memory: number
  }
}

/**
 * Response from list devboxes API
 */
export interface DevboxListApiResponse {
  data: DevboxListItem[]
}

/**
 * Agent server configuration
 */
export interface AgentServer {
  /** Service URL or hostname for the agent server */
  url: string
  /** Authentication token for agent server */
  token: string
}

/**
 * Detailed devbox information
 */
export interface DevboxDetail {
  name: string
  uid: string
  resourceType: 'devbox'
  runtime: string | DevboxRuntime // API returns string, but type definition supports enum
  image: string
  status: string
  resources: {
    cpu: number
    memory: number
  }
  ssh: {
    host: string
    port: number
    user: string
    workingDir: string
    privateKey?: string
  }
  env?: EnvVar[]
  ports: Array<{
    number: number
    portName: string
    protocol: string
    serviceName: string
    privateAddress: string
    privateHost: string
    networkName: string
    publicHost?: string
    publicAddress?: string
    customDomain?: string
  }>
  pods?: Array<{
    name: string
    status: string
  }>
  agentServer?: AgentServer
}

/**
 * Response from get devbox API
 */
export interface DevboxDetailApiResponse {
  data: DevboxDetail
}

/**
 * Runtime template information
 */
export interface RuntimeTemplate {
  uid: string
  iconId: string | null
  name: string
  kind: 'FRAMEWORK' | 'OS' | 'LANGUAGE' | 'SERVICE' | 'CUSTOM'
  description: string | null
  isPublic: boolean
}

/**
 * Template configuration
 */
export interface TemplateConfig {
  templateUid: string
  templateName: string
  runtimeUid: string
  runtime: DevboxRuntime | null
  config: {
    appPorts?: Array<{
      name: string
      port: number
      protocol: string
    }>
    ports?: Array<{
      containerPort: number
      name: string
      protocol: string
    }>
    releaseCommand?: string[]
    releaseArgs?: string[]
    user?: string
    workingDir?: string
  }
}

/**
 * Response from get templates API
 */
export interface TemplatesApiResponse {
  data: {
    runtime: RuntimeTemplate[]
    config: TemplateConfig[]
  }
}

/**
 * Release status
 */
export interface ReleaseStatus {
  value: string
  label: string
}

/**
 * Release information
 */
export interface Release {
  id: string
  name: string
  devboxName: string
  createTime: string
  tag: string
  status: ReleaseStatus
  description: string
  image: string
}

/**
 * Response from list releases API
 */
export interface ReleaseListApiResponse {
  data: Release[]
}

/**
 * Monitor data point with readable time
 */
export interface MonitorDataApiPoint {
  timestamp: number
  readableTime: string
  cpu: number
  memory: number
}

/**
 * Response from monitor data API
 */
export interface MonitorDataApiResponse {
  code: 200
  data: MonitorDataApiPoint[]
}

/**
 * Request to create a release
 */
export interface CreateReleaseRequest {
  tag: string
  releaseDes?: string
}

/**
 * Request to configure autostart
 */
export interface ConfigureAutostartRequest {
  execCommand?: string
}
