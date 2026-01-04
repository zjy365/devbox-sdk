/**
 * Devbox instance class for managing individual Devbox containers
 */

// FormData and File are globally available in Node.js 22+ (via undici)
import type { ListFilesResponse } from 'devbox-shared/types'
import type { DevboxRuntime } from '../api/types'
import { API_ENDPOINTS } from './constants'
import type { DevboxSDK } from './devbox-sdk'
import { Git } from './git/git'
import type {
  BatchUploadOptions,
  CodeRunOptions,
  DevboxInfo,
  DownloadFileOptions,
  // FileChangeEvent, // Temporarily disabled - ws module removed
  FileMap,
  FindInFilesOptions,
  FindInFilesResponse,
  // FileWatchWebSocket, // Temporarily disabled - ws module removed
  GetProcessLogsResponse,
  GetProcessStatusResponse,
  KillProcessOptions,
  ListProcessesResponse,
  MonitorData,
  MoveFileResponse,
  PortPreviewUrl,
  PortsResponse,
  ProcessExecOptions,
  ProcessExecResponse,
  ReadOptions,
  RenameFileResponse,
  ReplaceInFilesOptions,
  ReplaceInFilesResponse,
  ResourceInfo,
  SearchFilesOptions,
  SearchFilesResponse,
  SyncExecutionResponse,
  TimeRange,
  TransferResult,
  WaitForReadyOptions,
  // WatchRequest, // Temporarily disabled - ws module removed
  WriteOptions,
} from './types'

export class DevboxInstance {
  private info: DevboxInfo
  private sdk: DevboxSDK
  public readonly git: Git

  constructor(info: DevboxInfo, sdk: DevboxSDK) {
    this.info = info
    this.sdk = sdk
    // Initialize Git with dependency injection
    this.git = new Git({
      execSync: options => this.execSync(options),
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
    const urlResolver = this.sdk.getUrlResolver()
    await urlResolver.executeWithConnection(this.name, async client => {
      // Go server supports three modes based on Content-Type:
      // 1. JSON mode (application/json): For text and base64-encoded small files
      // 2. Binary mode (other Content-Type): For binary files, path via query parameter
      // 3. Multipart mode (multipart/form-data): For browser FormData

      // Determine content size
      const contentSize = Buffer.isBuffer(content)
        ? content.length
        : Buffer.byteLength(content, 'utf-8')

      // Use binary mode for large files (>1MB) to avoid JSON buffering issues
      // JSON mode requires Go server to buffer entire request body in memory
      const LARGE_FILE_THRESHOLD = 1 * 1024 * 1024 // 1MB
      const useBinaryMode = contentSize > LARGE_FILE_THRESHOLD

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
        // For string content
        if (useBinaryMode && !options?.encoding) {
          // Convert large string to Buffer and use binary mode
          // This avoids JSON parser buffering entire request body in Go server
          const buffer = Buffer.from(content, 'utf-8')
          await client.post('/api/v1/files/write', {
            params: { path },
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: buffer,
          })
        } else if (options?.encoding === 'base64') {
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
      // According to openapi.yaml, /api/v1/files/read is a GET request that returns binary content
      // Server may return different Content-Types:
      // - application/octet-stream, image/*, video/*, audio/* -> binary (Buffer)
      // - text/plain -> text (string)
      const response = await client.get('/api/v1/files/read', {
        params: { path, ...options },
      })

      // HTTP client handles response based on Content-Type:
      // - Binary content types -> Buffer
      // - Text content types -> string
      // Note: Go server's ReadFile endpoint does NOT support encoding parameter
      // It always returns raw file content. Base64 encoding is only used during
      // write operations for JSON mode transmission.

      if (Buffer.isBuffer(response.data)) {
        // Binary content already in Buffer format
        return response.data
      }

      // If it's a string, convert to Buffer
      if (typeof response.data === 'string') {
        // Go server returns raw file content as text/plain for text files
        // Convert UTF-8 string to Buffer (preserves Unicode characters correctly)
        // Note: encoding option is ignored for readFile - server doesn't support it
        return Buffer.from(response.data, 'utf-8')
      }

      // Handle ArrayBuffer if present (fallback for safety)
      if (response.data instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(response.data))
      }
      if (response.data instanceof Uint8Array) {
        return Buffer.from(response.data)
      }

      // Log the actual type for debugging
      const dataType = typeof response.data
      const dataConstructor = response.data?.constructor?.name || 'unknown'
      throw new Error(
        `Failed to read file: unexpected response format (type: ${dataType}, constructor: ${dataConstructor})`
      )
    })
  }

  /**
   * Validate file path to prevent directory traversal attacks
   */
  private validatePath(path: string): void {
    if (!path || path.length === 0) {
      throw new Error('Path cannot be empty')
    }

    // Reject paths ending with slash (directory paths)
    if (path.endsWith('/') || path.endsWith('\\')) {
      throw new Error('Path cannot end with a directory separator')
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

  async uploadFiles(
    files: FileMap,
    options?: BatchUploadOptions & { targetDir?: string }
  ): Promise<TransferResult> {
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
        // Server doesn't use targetDir parameter, so we need to combine targetDir and relativePath
        // to form the full path as the filename
        const fullPath = targetDir === '.' ? relativePath : `${targetDir}/${relativePath}`
        // Convert Buffer to Uint8Array for File constructor compatibility
        const uint8Array = new Uint8Array(buffer)
        const file = new File([uint8Array], fullPath)
        formData.append('files', file)
      }

      const response = await client.post<TransferResult>('/api/v1/files/batch-upload', {
        body: formData,
      })
      return response.data
    })
  }

  async moveFile(
    source: string,
    destination: string,
    overwrite = false
  ): Promise<MoveFileResponse> {
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
   * Search for files by filename pattern (case-insensitive substring match)
   * @param options Search options including directory and pattern
   * @returns List of matching file paths
   */
  async searchFiles(options: SearchFilesOptions): Promise<SearchFilesResponse> {
    if (!options.pattern || options.pattern.trim().length === 0) {
      throw new Error('Pattern cannot be empty')
    }

    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<SearchFilesResponse>(
        API_ENDPOINTS.CONTAINER.FILES.SEARCH,
        {
          body: {
            dir: options.dir || '.',
            pattern: options.pattern,
          },
        }
      )
      return response.data
    })
  }

  /**
   * Find files by content keyword (searches inside text files)
   * @param options Find options including directory and keyword
   * @returns List of file paths containing the keyword
   */
  async findInFiles(options: FindInFilesOptions): Promise<FindInFilesResponse> {
    if (!options.keyword || options.keyword.trim().length === 0) {
      throw new Error('Keyword cannot be empty')
    }

    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<FindInFilesResponse>(
        API_ENDPOINTS.CONTAINER.FILES.FIND,
        {
          body: {
            dir: options.dir || '.',
            keyword: options.keyword,
          },
        }
      )
      return response.data
    })
  }

  /**
   * Replace text in multiple files
   * @param options Replace options including file paths, from text, and to text
   * @returns Replacement results for each file
   */
  async replaceInFiles(
    options: ReplaceInFilesOptions
  ): Promise<ReplaceInFilesResponse> {
    if (!options.from || options.from.trim().length === 0) {
      throw new Error("'from' string cannot be empty")
    }

    if (!options.files || options.files.length === 0) {
      throw new Error('At least one file path is required')
    }

    // Validate all file paths
    for (const filePath of options.files) {
      this.validatePath(filePath)
    }

    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<ReplaceInFilesResponse>(
        API_ENDPOINTS.CONTAINER.FILES.REPLACE,
        {
          body: {
            files: options.files,
            from: options.from,
            to: options.to,
          },
        }
      )
      return response.data
    })
  }

  /**
   * Download a single file
   * @param path File path to download
   * @returns Buffer containing file content
   */
  async downloadFile(path: string): Promise<Buffer> {
    this.validatePath(path)

    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.get<Buffer>(
        `${API_ENDPOINTS.CONTAINER.FILES.DOWNLOAD}?path=${encodeURIComponent(path)}`
      )
      return response.data
    })
  }

  /**
   * Download multiple files with format options
   * @param paths Array of file paths to download
   * @param options Download options including format
   * @returns Buffer containing downloaded files (tar.gz, tar, or multipart format)
   */
  async downloadFiles(
    paths: string[],
    options?: { format?: 'tar.gz' | 'tar' | 'multipart' | 'direct' }
  ): Promise<Buffer> {
    if (!paths || paths.length === 0) {
      throw new Error('At least one file path is required')
    }

    // Validate all paths
    for (const path of paths) {
      this.validatePath(path)
    }

    const urlResolver = this.sdk.getUrlResolver()
    return await urlResolver.executeWithConnection(this.name, async client => {
      // Determine Accept header based on format
      const headers: Record<string, string> = {}
      if (options?.format) {
        switch (options.format) {
          case 'tar.gz':
            headers.Accept = 'application/gzip'
            break
          case 'tar':
            headers.Accept = 'application/x-tar'
            break
          case 'multipart':
            headers.Accept = 'multipart/mixed'
            break
          case 'direct':
            // No Accept header for direct download
            break
        }
      }

      const response = await client.post<Buffer>(API_ENDPOINTS.CONTAINER.FILES.BATCH_DOWNLOAD, {
        body: { paths, format: options?.format },
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      })

      return response.data
    })
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

  /**
   * Get preview link for a specific port
   * @param port Port number to get preview link for
   * @returns Preview URL information
   */
  async getPreviewLink(port: number): Promise<PortPreviewUrl> {
    // Refresh instance info to get latest port configurations
    await this.refreshInfo()

    // Check if agentServer exists
    if (!this.info.agentServer?.url) {
      throw new Error(
        `No agentServer URL available for Devbox '${this.name}'. Cannot generate preview link.`
      )
    }

    const serviceName = this.info.agentServer.url

    // Get SDK's base URL to extract domain
    const urlResolver = this.sdk.getUrlResolver()
    const baseUrl = urlResolver.baseUrl

    // Extract domain part from baseUrl
    // Example: https://devbox.staging-usw-1.sealos.io -> staging-usw-1.sealos.io
    const urlObj = new URL(baseUrl)
    const domain = urlObj.hostname.replace(/^devbox\./, '') // Remove devbox. prefix

    // Build preview URL: https://devbox-{serviceName}-{port}.{domain}
    const url = `${urlObj.protocol}//devbox-${serviceName}-${port}.${domain}`
    const protocol = urlObj.protocol.replace(':', '') as 'http' | 'https'

    return {
      url,
      port,
      protocol,
    }
  }

  // Temporarily disabled - ws module removed
  // File watching (instance method)
  // async watchFiles(
  //   path: string,
  //   callback: (event: FileChangeEvent) => void
  // ): Promise<FileWatchWebSocket> {
  //   const urlResolver = this.sdk.getUrlResolver()
  //   const serverUrl = await urlResolver.getServerUrl(this.name)
  //   const { default: WebSocket } = await import('ws')
  //   const ws = new WebSocket(`ws://${serverUrl.replace('http://', '')}/ws`) as unknown as FileWatchWebSocket

  //   ws.onopen = () => {
  //     const watchRequest: WatchRequest = { type: 'watch', path }
  //     ws.send(JSON.stringify(watchRequest))
  //   }

  //   ws.onmessage = (event: any) => {
  //     try {
  //       const data = typeof event.data === 'string' ? event.data : event.data?.toString() || ''
  //       const fileEvent = JSON.parse(data) as FileChangeEvent
  //       callback(fileEvent)
  //     } catch (error) {
  //       console.error('Failed to parse file watch event:', error)
  //     }
  //   }

  //   return ws
  // }

  // Process execution
  /**
   * Execute a process asynchronously
   * All commands are automatically executed through shell (sh -c) for consistent behavior
   * This ensures environment variables, pipes, redirections, etc. work as expected
   * @param options Process execution options
   * @returns Process execution response with process_id and pid
   */
  async executeCommand(options: ProcessExecOptions): Promise<ProcessExecResponse> {
    const urlResolver = this.sdk.getUrlResolver()

    // Build full command string
    let fullCommand = options.command
    if (options.args && options.args.length > 0) {
      fullCommand = `${options.command} ${options.args.join(' ')}`
    }

    // Wrap with sh -c for shell feature support (env vars, pipes, etc.)
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<ProcessExecResponse>(
        API_ENDPOINTS.CONTAINER.PROCESS.EXEC,
        {
          body: {
            command: 'sh',
            args: ['-c', fullCommand],
            cwd: options.cwd,
            env: options.env,
            timeout: options.timeout,
          },
        }
      )
      return response.data
    })
  }

  /**
   * Execute a process synchronously and wait for completion
   * All commands are automatically executed through shell (sh -c) for consistent behavior
   * This ensures environment variables, pipes, redirections, etc. work as expected
   * @param options Process execution options
   * @returns Synchronous execution response with stdout, stderr, and exit code
   */
  async execSync(options: ProcessExecOptions): Promise<SyncExecutionResponse> {
    const urlResolver = this.sdk.getUrlResolver()

    // Build full command string
    let fullCommand = options.command
    if (options.args && options.args.length > 0) {
      fullCommand = `${options.command} ${options.args.join(' ')}`
    }

    // Wrap with sh -c for shell feature support (env vars, pipes, etc.)
    return await urlResolver.executeWithConnection(this.name, async client => {
      const response = await client.post<SyncExecutionResponse>(
        API_ENDPOINTS.CONTAINER.PROCESS.EXEC_SYNC,
        {
          body: {
            command: 'sh',
            args: ['-c', fullCommand],
            cwd: options.cwd,
            env: options.env,
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
    // Python characteristics
    if (/\bdef\s+\w+\(|^\s*import\s+\w+|print\s*\(|:\s*$/.test(code)) {
      return 'python'
    }
    // Node.js characteristics
    if (/\brequire\s*\(|module\.exports|console\.log/.test(code)) {
      return 'node'
    }
    return 'node' // Default
  }

  /**
   * Build shell command to execute code
   * Note: sh -c wrapper is now handled by wrapCommandWithShell
   * @param code Code string to execute
   * @param language Programming language ('node' or 'python')
   * @param argv Command line arguments
   * @returns Shell command string (without sh -c wrapper)
   */
  private buildCodeCommand(code: string, language: 'node' | 'python', argv?: string[]): string {
    const base64Code = Buffer.from(code).toString('base64')
    const argvStr = argv && argv.length > 0 ? ` ${argv.join(' ')}` : ''

    if (language === 'python') {
      // Python: python3 -u -c "exec(__import__('base64').b64decode('<base64>').decode())"
      return `python3 -u -c "exec(__import__(\\"base64\\").b64decode(\\"${base64Code}\\").decode())"${argvStr}`
    }
    // Node.js: echo <base64> | base64 --decode | node -e "$(cat)"
    return `echo ${base64Code} | base64 --decode | node -e "$(cat)"${argvStr}`
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
    } catch {
      return false
    }
  }

  /**
   * Wait for the Devbox to be ready and healthy
   * @param timeoutOrOptions Timeout in milliseconds (for backward compatibility) or options object
   * @param checkInterval Check interval in milliseconds (for backward compatibility, ignored if first param is options)
   */
  async waitForReady(
    timeoutOrOptions?: number | WaitForReadyOptions,
    checkInterval = 2000
  ): Promise<void> {
    // Handle backward compatibility: if first param is a number, treat as old API
    // If no params provided, use exponential backoff (new default behavior)
    const options: WaitForReadyOptions =
      typeof timeoutOrOptions === 'number'
        ? {
            timeout: timeoutOrOptions,
            checkInterval,
            // For backward compatibility: if explicitly called with numbers, use fixed interval
            useExponentialBackoff: false,
          }
        : timeoutOrOptions ?? {
            // Default: use exponential backoff when called without params
            useExponentialBackoff: true,
          }

    const {
      timeout = 300000, // 5 minutes
      checkInterval: fixedInterval,
      useExponentialBackoff = fixedInterval === undefined,
      initialCheckInterval = 200, // 0.2 seconds - faster initial checks
      maxCheckInterval = 5000, // 5 seconds
      backoffMultiplier = 1.5,
    } = options

    const startTime = Date.now()
    let currentInterval = useExponentialBackoff ? initialCheckInterval : (fixedInterval ?? 2000)
    let checkCount = 0
    let lastStatus = this.status

    while (Date.now() - startTime < timeout) {
      try {
        // 1. Check Devbox status via API
        await this.refreshInfo()

        // If status changed to Running, immediately check health (don't wait for next interval)
        if (this.status === 'Running') {
          // 2. Check health status via Bun server
          const healthy = await this.isHealthy()

          if (healthy) {
            return
          }

          // If status is Running but not healthy yet, use shorter interval for health checks
          // This helps detect when health becomes available faster
          if (lastStatus !== 'Running') {
            // Status just changed to Running, reset interval to check health more frequently
            currentInterval = Math.min(initialCheckInterval * 2, 1000) // Max 1s for health checks
            checkCount = 1
          }
        } else if (lastStatus !== this.status) {
          // Status changed but not Running yet, reset interval to check more frequently
          currentInterval = initialCheckInterval
          checkCount = 0
        }

        lastStatus = this.status
      } catch {
        // Continue waiting on error
      }

      // Calculate next interval for exponential backoff
      if (useExponentialBackoff) {
        currentInterval = Math.min(
          initialCheckInterval * (backoffMultiplier ** checkCount),
          maxCheckInterval
        )
        checkCount++
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, currentInterval))
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
