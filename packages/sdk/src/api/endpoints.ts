/**
 * API endpoint definitions for the Devbox REST API
 */

import { API_ENDPOINTS } from '../core/constants'

/**
 * Construct API URLs with proper parameter substitution
 */
export class APIEndpoints {
  private baseUrl: string

  constructor(baseUrl = 'https://devbox.usw.sealos.io/v1') {
    this.baseUrl = baseUrl
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this.baseUrl
  }

  /**
   * Construct URL with parameters
   */
  private constructUrl(template: string, params: Record<string, string> = {}): string {
    let url = template
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value))
    }
    return `${this.baseUrl}${url}`
  }

  // Devbox management endpoints
  devboxList(): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.LIST)
  }

  devboxCreate(): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.CREATE)
  }

  devboxGet(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.GET, { name })
  }

  devboxUpdate(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.UPDATE, { name })
  }

  devboxDelete(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.DELETE, { name })
  }

  devboxStart(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.START, { name })
  }

  devboxPause(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.PAUSE, { name })
  }

  devboxRestart(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.RESTART, { name })
  }

  devboxShutdown(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.SHUTDOWN, { name })
  }

  devboxMonitor(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.MONITOR, { name })
  }

  devboxTemplates(): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.TEMPLATES)
  }

  devboxPorts(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.PORTS, { name })
  }

  devboxAutostart(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.AUTOSTART, { name })
  }

  // Release endpoints
  releaseList(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.RELEASE.LIST, { name })
  }

  releaseCreate(name: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.RELEASE.CREATE, { name })
  }

  releaseDelete(name: string, tag: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.RELEASE.DELETE, { name, tag })
  }

  releaseDeploy(name: string, tag: string): string {
    return this.constructUrl(API_ENDPOINTS.DEVBOX.RELEASE.DEPLOY, { name, tag })
  }

  containerHealth(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.HEALTH}`
  }

  filesWrite(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.FILES.WRITE}`
  }

  filesRead(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.FILES.READ}`
  }

  filesList(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.FILES.LIST}`
  }

  filesDelete(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.FILES.DELETE}`
  }

  filesBatchUpload(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.FILES.BATCH_UPLOAD}`
  }

  filesBatchDownload(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.FILES.BATCH_DOWNLOAD}`
  }

  processExec(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.PROCESS.EXEC}`
  }

  processStatus(baseUrl: string, pid: number): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.PROCESS.STATUS.replace('{pid}', pid.toString())}`
  }

  websocket(baseUrl: string): string {
    return `${baseUrl}${API_ENDPOINTS.CONTAINER.WEBSOCKET}`
  }
}
