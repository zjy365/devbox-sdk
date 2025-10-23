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
