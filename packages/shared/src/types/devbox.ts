/**
 * Devbox lifecycle types shared between SDK and Server
 */

/**
 * Devbox runtime types
 */
export type DevboxRuntime = 'node.js' | 'python' | 'go' | 'rust' | 'java' | 'custom'

/**
 * Devbox state
 */
export type DevboxState =
  | 'pending'
  | 'creating'
  | 'running'
  | 'stopped'
  | 'paused'
  | 'restarting'
  | 'error'
  | 'terminating'
  | 'terminated'

/**
 * Resource configuration
 */
export interface ResourceConfig {
  cpu: number
  memory: number
  disk?: number
}

/**
 * Port configuration
 */
export interface PortConfig {
  number: number
  protocol: 'HTTP' | 'TCP' | 'UDP'
  name?: string
}

/**
 * Devbox information
 */
export interface DevboxInfo {
  name: string
  namespace: string
  state: DevboxState
  runtime: DevboxRuntime
  resources: ResourceConfig
  ports: PortConfig[]
  podIP?: string
  ssh?: {
    host: string
    port: number
    user: string
    privateKey?: string
  }
  createdAt: Date
  updatedAt: Date
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

/**
 * Create devbox request
 */
export interface CreateDevboxRequest {
  name: string
  namespace?: string
  runtime: DevboxRuntime
  resources: ResourceConfig
  ports?: PortConfig[]
  env?: Record<string, string>
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

/**
 * Create devbox response
 */
export interface CreateDevboxResponse {
  name: string
  namespace: string
  state: DevboxState
  podIP?: string
  ssh?: {
    host: string
    port: number
    user: string
  }
  createdAt: string
}

/**
 * Get devbox request
 */
export interface GetDevboxRequest {
  name: string
  namespace?: string
}

/**
 * Get devbox response
 */
export interface GetDevboxResponse extends Omit<DevboxInfo, 'createdAt' | 'updatedAt'> {
  createdAt: string
  updatedAt: string
}

/**
 * List devboxes request
 */
export interface ListDevboxesRequest {
  namespace?: string
  labels?: Record<string, string>
}

/**
 * List devboxes response
 */
export interface ListDevboxesResponse {
  devboxes: DevboxInfo[]
  totalCount: number
}

/**
 * Delete devbox request
 */
export interface DeleteDevboxRequest {
  name: string
  namespace?: string
}

/**
 * Delete devbox response
 */
export interface DeleteDevboxResponse {
  success: boolean
  name: string
  state: DevboxState
}

/**
 * Start devbox request
 */
export interface StartDevboxRequest {
  name: string
  namespace?: string
}

/**
 * Start devbox response
 */
export interface StartDevboxResponse {
  success: boolean
  name: string
  state: DevboxState
}

/**
 * Stop devbox request
 */
export interface StopDevboxRequest {
  name: string
  namespace?: string
}

/**
 * Stop devbox response
 */
export interface StopDevboxResponse {
  success: boolean
  name: string
  state: DevboxState
}

/**
 * Restart devbox request
 */
export interface RestartDevboxRequest {
  name: string
  namespace?: string
}

/**
 * Restart devbox response
 */
export interface RestartDevboxResponse {
  success: boolean
  name: string
  state: DevboxState
}
