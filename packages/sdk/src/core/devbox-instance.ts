/**
 * Devbox instance class for managing individual Devbox containers
 */

// FormData and File are globally available in Node.js 22+ (via undici)
import type { ListFilesResponse } from '@sealos/devbox-shared/types'
import type { DevboxSDK } from './devbox-sdk'
import type {
  BatchUploadOptions,
  CodeRunOptions,
  DevboxInfo,
  DownloadFileOptions,
  FileChangeEvent,
  FileMap,
  FileWatchWebSocket,
  GetProcessLogsResponse,
  GetProcessStatusResponse,
  KillProcessOptions,
  ListProcessesResponse,
  MonitorData,
  MoveFileResponse,
  PortsResponse,
  ProcessExecOptions,
  ProcessExecResponse,
  ReadOptions,
  RenameFileResponse,
  ResourceInfo,
  SyncExecutionResponse,
  TimeRange,
  TransferResult,
  WatchRequest,
  WriteOptions,
} from './types'
import { API_ENDPOINTS } from './constants'
import type { DevboxRuntime } from '../api/types'
import { Git } from './git/git'

export class DevboxInstance {
  private info: DevboxInfo
  private sdk: DevboxSDK
  public readonly git: Git

  constructor(info: DevboxInfo, sdk: DevboxSDK) {
    this.info = info
    this.sdk = sdk
    // Initialize Git with dependency injection
    this.git = new Git({
      execSync: (options) => this.execSync(options),
    })
  }

  // Properties
  get name(): string {
    return this.info.name
  }

  get status(): string {
    return this.info.status
  }

  get runtime(): DevboxRuntime {
    return this.info.runtime
  }

  get resources(): ResourceInfo {
    return this.info.resources
  }

  get serverUrl(): string {
    if (!this.info.podIP) {
      throw new Error(`Devbox '${this.name}' does not have a pod IP address`)
    }
    return `http://${this.info.podIP}:3000`
  }

  // Lifecycle operations
  async start(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.startDevbox(this.name)
    // Refresh the instance info after starting
    await this.refreshInfo()
  }

  async pause(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.pauseDevbox(this.name)
    await this.refreshInfo()
  }

  async restart(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.restartDevbox(this.name)
    await this.refreshInfo()
  }

  async shutdown(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.shutdownDevbox(this.name)
    await this.refreshInfo()
  }

  async delete(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    await apiClient.deleteDevbox(this.name)
  }

  /**
   * Refresh the instance information from the API
   */
  async refreshInfo(): Promise<void> {
    const apiClient = this.sdk.getAPIClient()
    this.info = await apiClient.getDevbox(this.name)
  }

  async writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void> {
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver();
    await urlResolver.executeWithConnection(this.name, async client => {
      // Go server supports three modes based on Content-Type:
      // 1. JSON mode (application/json): For text and base64-encoded small files
      // 2. Binary mode (other Content-Type): For binary files, path via query parameter
      // 3. Multipart mode (multipart/form-data): For browser FormData
      
      if (Buffer.isBuffer(content)) {
        // For Buffer, use Binary mode by default (more efficient, ~25% less bandwidth)
        // Unless user explicitly requests base64 encoding
        if (options?.encoding === 'base64') {
          // Use JSON mode with base64 encoding
          const base64Content = content.toString('base64')
          await client.post('/api/v1/files/write', {
            body: {
              path,
              content: base64Content,
              encoding: 'base64',
            },
          })
        } else {
          // Use Binary mode: path via query parameter, binary data as body
          // Content-Type will be set to application/octet-stream by default
          // Go server's writeFileBinary expects path in query parameter
          await client.post('/api/v1/files/write', {
            params: { path },
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: content, // Direct binary data
          })
        }
      } else {
        // For string content, use JSON mode
        if (options?.encoding === 'base64') {
          // User explicitly wants base64 encoding
          const base64Content = Buffer.from(content, 'utf-8').toString('base64')
          await client.post('/api/v1/files/write', {
            body: {
              path,
              content: base64Content,
              encoding: 'base64',
            },
          })
        } else {
          // Default: send as plain text (no encoding field)
          // Go server will treat it as plain text when encoding is not set
          await client.post('/api/v1/files/write', {
            body: {
              path,
              content,
            },
          })
        }
      }
    })
  }

  async readFile(path: string, options?: ReadOptions): Promise<Buffer> {
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<{
        success: boolean
        path: string
        content: string
        size: number
        encoding?: string
      }>('/api/v1/files/read', {
        body: { path, ...options },
      })

      const responseData = response.data
      if (!responseData.success || !responseData.content) {
        throw new Error('Failed to read file: invalid response')
      }

      const encoding = options?.encoding || responseData.encoding || 'utf-8'
      if (encoding === 'base64') {
        return Buffer.from(responseData.content, 'base64')
      }
      return Buffer.from(responseData.content, 'utf-8')
    })
  }

  /**
   * Validate file path to prevent directory traversal attacks
   */
  private validatePath(path: string): void {
    if (!path || path.length === 0) {
      throw new Error('Path cannot be empty')
    }

    // Check for directory traversal attempts
    const normalized = path.replace(/\\/g, '/')
    if (normalized.includes('../') || normalized.includes('..\\')) {
      throw new Error(`Path traversal detected: ${path}`)
    }

    // Ensure absolute paths start from workspace
    if (normalized.startsWith('/') && (normalized.startsWith('/../') || normalized === '/..')) {
      throw new Error(`Invalid absolute path: ${path}`)
    }
  }

  async deleteFile(path: string): Promise<void> {
    // Validate path to prevent directory traversal
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver()
    await urlResolver.executeWithConnection(this.name, async client => {
      await client.post('/api/v1/files/delete', {
        body: { path },
      })
    })
  }

  async listFiles(path: string): Promise<ListFilesResponse> {
    // Validate path to prevent directory traversal
    this.validatePath(path)
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.get<ListFilesResponse>('/api/v1/files/list', {
        params: { path },
      })
      return response.data
    })
  }

  async uploadFiles(files: FileMap, options?: BatchUploadOptions & { targetDir?: string }): Promise<TransferResult> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const formData = new FormData()

      let targetDir: string
      const relativePaths: string[] = []
      const filePaths = Object.keys(files)

      if (options?.targetDir) {
        targetDir = options.targetDir.replace(/\/+$/, '') || '.'
        for (const filePath of filePaths) {
          if (filePath.startsWith(`${targetDir}/`)) {
            relativePaths.push(filePath.slice(targetDir.length + 1))
          } else if (filePath === targetDir) {
            relativePaths.push('')
          } else {
            relativePaths.push(filePath)
          }
        }
      } else {
        if (filePaths.length === 0) {
          targetDir = '.'
        } else {
          const dirParts = filePaths.map(path => {
            const parts = path.split('/')
            return parts.slice(0, -1)
          })

          if (dirParts.length > 0 && dirParts[0] && dirParts[0].length > 0) {
            const commonPrefix: string[] = []
            const minLength = Math.min(...dirParts.map(p => p.length))
            const firstDirParts = dirParts[0]

            for (let i = 0; i < minLength; i++) {
              const segment = firstDirParts[i]
              if (segment && dirParts.every(p => p[i] === segment)) {
                commonPrefix.push(segment)
              } else {
                break
              }
            }

            targetDir = commonPrefix.length > 0 ? commonPrefix.join('/') : '.'
          } else {
            targetDir = '.'
          }

          const normalizedTargetDir = targetDir === '.' ? '' : targetDir
          for (const filePath of filePaths) {
            if (normalizedTargetDir && filePath.startsWith(`${normalizedTargetDir}/`)) {
              relativePaths.push(filePath.slice(normalizedTargetDir.length + 1))
            } else {
              relativePaths.push(filePath)
            }
          }
        }
      }

      formData.append('targetDir', targetDir)

      let index = 0
      for (const [filePath, content] of Object.entries(files)) {
        const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content)
        const relativePath = relativePaths[index++] || filePath.split('/').pop() || 'file'
        const file = new File([buffer], relativePath)
        formData.append('files', file)
      }

      const response = await client.post<TransferResult>('/api/v1/files/batch-upload', {
        body: formData,
      })
      return response.data
    })
  }

  async moveFile(source: string, destination: string, overwrite = false): Promise<MoveFileResponse> {
    this.validatePath(source)
    this.validatePath(destination)
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<MoveFileResponse>(API_ENDPOINTS.CONTAINER.FILES.MOVE, {
        body: {
          source,
          destination,
          overwrite,
        },
      })
      return response.data
    })
  }

  /**
   * Rename a file or directory
   * @param oldPath Current file or directory path
   * @param newPath New file or directory path
   * @returns Rename operation response
   */
  async renameFile(oldPath: string, newPath: string): Promise<RenameFileResponse> {
    this.validatePath(oldPath)
    this.validatePath(newPath)
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<RenameFileResponse>(API_ENDPOINTS.CONTAINER.FILES.RENAME, {
        body: {
          oldPath,
          newPath,
        },
      })
      return response.data
    })
  }

  /**
   * Download one or multiple files with smart format detection
   * @param paths Single file path or array of file paths
   * @param options Download options including format
   * @returns Buffer containing downloaded file(s)
   */
  async downloadFile(
    paths: string | string[],
    options?: { format?: 'tar.gz' | 'tar' | 'multipart' | 'direct' }
  ): Promise<Buffer> {
    const pathsArray = Array.isArray(paths) ? paths : [paths]
    
    // Validate all paths
    for (const path of pathsArray) {
      this.validatePath(path)
    }

    const urlResolver = this.sdk.getUrlResolver()
    const serverUrl = await urlResolver.getServerUrl(this.name)
    const url = `${serverUrl}${API_ENDPOINTS.CONTAINER.FILES.DOWNLOAD}`

    // Determine Accept header based on format
    let acceptHeader: string | undefined
    if (options?.format) {
      switch (options.format) {
        case 'tar.gz':
          acceptHeader = 'application/gzip'
          break
        case 'tar':
          acceptHeader = 'application/x-tar'
          break
        case 'multipart':
          acceptHeader = 'multipart/mixed'
          break
        case 'direct':
          // No Accept header for direct download
          break
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer 1234', // TODO: remove this
    }
    if (acceptHeader) {
      headers.Accept = acceptHeader
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ paths: pathsArray }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  /**
   * Get listening ports on the system
   * @returns Ports response with list of listening ports (3000-9999 range)
   */
  async getPorts(): Promise<PortsResponse> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.get<PortsResponse>(API_ENDPOINTS.CONTAINER.PORTS)
      return response.data
    })
  }

  // File watching (instance method)
  async watchFiles(
    path: string,
    callback: (event: FileChangeEvent) => void
  ): Promise<FileWatchWebSocket> {
    const urlResolver = this.sdk.getUrlResolver()
      const serverUrl = await urlResolver.getServerUrl(this.name)
    const { default: WebSocket } = await import('ws')
    const ws = new WebSocket(`ws://${serverUrl.replace('http://', '')}/ws`) as unknown as FileWatchWebSocket

    ws.onopen = () => {
      const watchRequest: WatchRequest = { type: 'watch', path }
      ws.send(JSON.stringify(watchRequest))
    }

    ws.onmessage = (event: any) => {
      try {
        const data = typeof event.data === 'string' ? event.data : event.data?.toString() || ''
        const fileEvent = JSON.parse(data) as FileChangeEvent
        callback(fileEvent)
      } catch (error) {
        console.error('Failed to parse file watch event:', error)
      }
    }

    return ws
  }

  // Process execution
  /**
   * Execute a process asynchronously
   * @param options Process execution options
   * @returns Process execution response with process_id and pid
   */
  async executeCommand(options: ProcessExecOptions): Promise<ProcessExecResponse> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<ProcessExecResponse>(API_ENDPOINTS.CONTAINER.PROCESS.EXEC, {
        body: {
          command: options.command,
          args: options.args,
          cwd: options.cwd,
          env: options.env,
          shell: options.shell,
          timeout: options.timeout,
        },
      })
      return response.data
    })
  }

  /**
   * Execute a process synchronously and wait for completion
   * @param options Process execution options
   * @returns Synchronous execution response with stdout, stderr, and exit code
   */
  async execSync(options: ProcessExecOptions): Promise<SyncExecutionResponse> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<SyncExecutionResponse>(
        API_ENDPOINTS.CONTAINER.PROCESS.EXEC_SYNC,
        {
          body: {
            command: options.command,
            args: options.args,
            cwd: options.cwd,
            env: options.env,
            shell: options.shell,
            timeout: options.timeout,
          },
        }
      )
      return response.data
    })
  }

  /**
   * Execute code directly (Node.js or Python)
   * @param code Code string to execute
   * @param options Code execution options
   * @returns Synchronous execution response with stdout, stderr, and exit code
   */
  async codeRun(code: string, options?: CodeRunOptions): Promise<SyncExecutionResponse> {
    const language = options?.language || this.detectLanguage(code)
    const command = this.buildCodeCommand(code, language, options?.argv)
    
    return this.execSync({
      command,
      cwd: options?.cwd,
      env: options?.env,
      timeout: options?.timeout,
    })
  }

  /**
   * Detect programming language from code string
   * @param code Code string to analyze
   * @returns Detected language ('node' or 'python')
   */
  private detectLanguage(code: string): 'node' | 'python' {
    // Python 特征
    if (/\bdef\s+\w+\(|^\s*import\s+\w+|print\s*\(|:\s*$/.test(code)) {
      return 'python'
    }
    // Node.js 特征
    if (/\brequire\s*\(|module\.exports|console\.log/.test(code)) {
      return 'node'
    }
    return 'node' // 默认
  }

  /**
   * Build shell command to execute code
   * @param code Code string to execute
   * @param language Programming language ('node' or 'python')
   * @param argv Command line arguments
   * @returns Shell command string
   */
  private buildCodeCommand(code: string, language: 'node' | 'python', argv?: string[]): string {
    const base64Code = Buffer.from(code).toString('base64')
    const argvStr = argv && argv.length > 0 ? ` ${argv.join(' ')}` : ''

    if (language === 'python') {
      // Python: python3 -u -c "exec(__import__('base64').b64decode('<base64>').decode())"
      return `sh -c 'python3 -u -c "exec(__import__(\\"base64\\").b64decode(\\"${base64Code}\\").decode())"${argvStr}'`
    }
    // Node.js: echo <base64> | base64 --decode | node -e "$(cat)"
    return `sh -c 'echo ${base64Code} | base64 --decode | node -e "$(cat)"${argvStr}'`
  }

  /**
   * Execute a process synchronously with streaming output (SSE)
   * @param options Process execution options
   * @returns ReadableStream for Server-Sent Events
   */
  async execSyncStream(options: ProcessExecOptions): Promise<ReadableStream> {
    const urlResolver = this.sdk.getUrlResolver()
    const serverUrl = await urlResolver.getServerUrl(this.name)
    const endpoint = API_ENDPOINTS.CONTAINER.PROCESS.EXEC_SYNC_STREAM
    const url = `${serverUrl}${endpoint}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: 'Bearer 1234', // TODO: remove this
      },
      body: JSON.stringify({
        command: options.command,
        args: options.args,
        cwd: options.cwd,
        env: options.env,
        shell: options.shell,
        timeout: options.timeout,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    return response.body
  }

  /**
   * List all processes
   * @returns List of all processes with their metadata
   */
  async listProcesses(): Promise<ListProcessesResponse> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.get<ListProcessesResponse>(API_ENDPOINTS.CONTAINER.PROCESS.LIST)
      return response.data
    })
  }

  /**
   * Get process status by process_id
   * @param processId Process ID (string)
   * @returns Process status response
   */
  async getProcessStatus(processId: string): Promise<GetProcessStatusResponse> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const endpoint = API_ENDPOINTS.CONTAINER.PROCESS.STATUS.replace('{process_id}', processId)
      const response = await client.get<GetProcessStatusResponse>(endpoint)
      return response.data
    })
  }

  /**
   * Kill a process by process_id
   * @param processId Process ID (string)
   * @param options Optional kill options (signal)
   */
  async killProcess(processId: string, options?: KillProcessOptions): Promise<void> {
    const urlResolver = this.sdk.getUrlResolver()
    await urlResolver.executeWithConnection(this.name, async client => {
      const endpoint = API_ENDPOINTS.CONTAINER.PROCESS.KILL.replace('{process_id}', processId)
      await client.post(endpoint, {
        params: options?.signal ? { signal: options.signal } : undefined,
      })
    })
  }

  /**
   * Get process logs by process_id
   * @param processId Process ID (string)
   * @param stream Enable log streaming (default: false)
   * @returns Process logs response
   */
  async getProcessLogs(processId: string, stream = false): Promise<GetProcessLogsResponse> {
    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const endpoint = API_ENDPOINTS.CONTAINER.PROCESS.LOGS.replace('{process_id}', processId)
      const response = await client.get<GetProcessLogsResponse>(endpoint, {
        params: { stream },
      })
      return response.data
    })
  }

  // Monitoring
  async getMonitorData(timeRange?: TimeRange): Promise<MonitorData[]> {
    return await this.sdk.getMonitorData(this.name, timeRange)
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      const urlResolver = this.sdk.getUrlResolver()
      return await urlResolver.checkDevboxHealth(this.name)
    } catch (error) {
      return false
    }
  }

  /**
   * Wait for the Devbox to be ready and healthy
   * @param timeout Timeout in milliseconds (default: 300000 = 5 minutes)
   * @param checkInterval Check interval in milliseconds (default: 2000)
   */
  async waitForReady(timeout = 300000, checkInterval = 2000): Promise<void> {
    const startTime = Date.now()

    console.log(`[DevboxInstance] Waiting for devbox '${this.name}' to be ready...`)

    while (Date.now() - startTime < timeout) {
      try {
        // 1. Check Devbox status via API
        await this.refreshInfo()

        if (this.status === 'Running') {
          // 2. Check health status via Bun server
          const healthy = await this.isHealthy()

          if (healthy) {
            console.log(`[DevboxInstance] Devbox '${this.name}' is ready and healthy`)
            return
          }
        }

        // Log current status for debugging
        console.log(`[DevboxInstance] Current status: ${this.status}, waiting...`)
      } catch (error) {
        // Log error but continue waiting
        console.warn(
          `[DevboxInstance] Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    throw new Error(`Devbox '${this.name}' did not become ready within ${timeout}ms`)
  }

  /**
   * Get detailed information about the instance
   */
  async getDetailedInfo(): Promise<DevboxInfo> {
    await this.refreshInfo()
    return { ...this.info }
  }

}

