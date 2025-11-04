/**
 * API response and request type definitions
 */

export interface KubeconfigAuth {
  kubeconfig: string
}

export interface APIClientConfig {
  kubeconfig: string
  baseUrl?: string
  timeout?: number
  retries?: number
}

export interface DevboxCreateRequest {
  name: string
  runtime: string
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
  runtime: string
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
  ports: any[]
  summary: {
    totalPorts: number
    successfulPorts: number
    failedPorts: number
  }
}

export interface DevboxGetResponse {
  name: string
  iconId: string
  status: {
    value: string
    label: string
  }
  cpu: number // in millicores
  memory: number // in MB
  sshPort: number
  networks: any[]
  [key: string]: any // other fields we don't care about
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

export interface APIResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
}

export interface APIError {
  code: string
  message: string
  details?: any
  timestamp: number
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
  runtime: string
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
  runtime: string
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
 * Detailed devbox information
 */
export interface DevboxDetail {
  name: string
  uid: string
  resourceType: 'devbox'
  runtime: string
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
  runtime: string | null
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
