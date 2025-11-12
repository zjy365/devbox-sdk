/**
 * Devbox instance class for managing individual Devbox containers
 */

import type { ListFilesResponse } from '@sealos/devbox-shared/types'
import FormData from 'form-data'
import type { DevboxSDK } from '../core/DevboxSDK'
import type {
  BatchUploadOptions,
  CodeRunOptions,
  DevboxInfo,
  FileChangeEvent,
  FileMap,
  FileWatchWebSocket,
  GetProcessLogsResponse,
  GetProcessStatusResponse,
  GitAuth,
  GitBranchInfo,
  GitCloneOptions,
  GitCommitOptions,
  GitPullOptions,
  GitPushOptions,
  GitStatus,
  KillProcessOptions,
  ListProcessesResponse,
  MonitorData,
  ProcessExecOptions,
  ProcessExecResponse,
  ReadOptions,
  ResourceInfo,
  SyncExecutionResponse,
  TimeRange,
  TransferResult,
  WatchRequest,
  WriteOptions,
} from '../core/types'
import { API_ENDPOINTS } from './constants'
import type { DevboxRuntime } from '../api/types'

export class DevboxInstance {
  private info: DevboxInfo
  private sdk: DevboxSDK

  constructor(info: DevboxInfo, sdk: DevboxSDK) {
    this.info = info
    this.sdk = sdk
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
    console.log(await urlResolver.getServerUrl(this.name));
    await urlResolver.executeWithConnection(this.name, async client => {
      let contentString: string
      let encoding: string
      
      if (Buffer.isBuffer(content)) {
        encoding = options?.encoding || 'base64'
        contentString = encoding === 'base64' ? content.toString('base64') : content.toString('utf-8')
      } else {
        encoding = options?.encoding || 'utf-8'
        contentString = encoding === 'base64' ? Buffer.from(content, 'utf-8').toString('base64') : content
      }
      
      await client.post('/api/v1/files/write', {
        body: {
          path,
          content: contentString,
          encoding,
          ...options,
        },
      })
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
      // Create FormData for multipart/form-data upload
      const formData = new FormData()

      // Add targetDir (required by OpenAPI spec)
      const targetDir = options?.targetDir || '/'
      formData.append('targetDir', targetDir)

      // Add files as binary data
      // Note: OpenAPI spec expects files array, but form-data typically uses
      // the same field name for multiple files
      for (const [filePath, content] of Object.entries(files)) {
        const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content)
        // Use the file path as the filename, and append to 'files' field
        formData.append('files', buffer, {
          filename: filePath.split('/').pop() || 'file',
          // Store the full path in a custom header or use a different approach
          // For now, we'll use the filename and let the server handle path reconstruction
        })
      }

      const response = await client.post<TransferResult>('/api/v1/files/batch-upload', {
        body: formData as unknown as FormData,
      })
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

  // Git helper functions
  /**
   * Build Git URL with authentication
   */
  private buildAuthUrl(url: string, auth?: GitAuth): string {
    if (!auth) return url

    // Handle token authentication
    if (auth.token) {
      // Extract host from URL
      const urlMatch = url.match(/^(https?:\/\/)([^@]+@)?([^\/]+)(\/.+)?$/)
      if (urlMatch) {
        const [, protocol, , host, path] = urlMatch
        return `${protocol}${auth.token}@${host}${path || ''}`
      }
    }

    // Handle username/password authentication
    if (auth.username && (auth.password || auth.token)) {
      const urlMatch = url.match(/^(https?:\/\/)([^\/]+)(\/.+)?$/)
      if (urlMatch) {
        const [, protocol, host, path] = urlMatch
        const password = auth.password || auth.token || ''
        return `${protocol}${auth.username}:${password}@${host}${path || ''}`
      }
    }

    return url
  }

  /**
   * Setup Git authentication environment variables
   */
  private setupGitAuth(env: Record<string, string> = {}, auth?: GitAuth): Record<string, string> {
    const gitEnv = { ...env }

    if (auth?.username) {
      gitEnv.GIT_USERNAME = auth.username
    }

    if (auth?.password) {
      gitEnv.GIT_PASSWORD = auth.password
    } else if (auth?.token) {
      gitEnv.GIT_PASSWORD = auth.token
    }

    return gitEnv
  }

  /**
   * Parse Git branch list output
   */
  private parseGitBranches(stdout: string, currentBranch: string): GitBranchInfo[] {
    const lines = stdout.split('\n').filter(Boolean)
    const branches: GitBranchInfo[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const isCurrent = trimmed.startsWith('*')
      const isRemote = trimmed.includes('remotes/')
      let name = trimmed.replace(/^\*\s*/, '').trim()

      if (isRemote) {
        // Extract branch name from remotes/origin/branch-name
        const match = name.match(/^remotes\/[^/]+\/(.+)$/)
        if (match?.[1]) {
          name = match[1]
        } else {
          continue
        }
      }

      // Get commit hash
      // This would require additional git command, simplified here
      branches.push({
        name,
        isCurrent: name === currentBranch || isCurrent,
        isRemote,
        commit: '', // Will be filled by additional git command if needed
      })
    }

    return branches
  }

  /**
   * Parse Git status output
   */
  private parseGitStatus(stdout: string, branchLine: string): GitStatus {
    const lines = stdout.split('\n').filter(Boolean)
    const staged: string[] = []
    const modified: string[] = []
    const untracked: string[] = []
    const deleted: string[] = []

    // Parse porcelain status
    for (const line of lines) {
      if (line.length < 3) continue

      const status = line.substring(0, 2)
      const file = line.substring(3).trim()

      if (status[0] === 'A' || status[0] === 'M' || status[0] === 'R' || status[0] === 'C') {
        staged.push(file)
      }
      if (status[1] === 'M' || status[1] === 'D') {
        modified.push(file)
      }
      if (status === '??') {
        untracked.push(file)
      }
      if (status[0] === 'D' || status[1] === 'D') {
        deleted.push(file)
      }
    }

    // Parse branch line: ## branch-name...origin/branch-name [ahead 1, behind 2]
    let currentBranch = 'main'
    let ahead = 0
    let behind = 0

    if (branchLine) {
      const branchMatch = branchLine.match(/^##\s+([^.]+)/)
      if (branchMatch?.[1]) {
        currentBranch = branchMatch[1]
      }

      const aheadMatch = branchLine.match(/ahead\s+(\d+)/)
      if (aheadMatch?.[1]) {
        ahead = Number.parseInt(aheadMatch[1], 10)
      }

      const behindMatch = branchLine.match(/behind\s+(\d+)/)
      if (behindMatch?.[1]) {
        behind = Number.parseInt(behindMatch[1], 10)
      }
    }

    const isClean = staged.length === 0 && modified.length === 0 && untracked.length === 0 && deleted.length === 0

    return {
      currentBranch,
      isClean,
      ahead,
      behind,
      staged,
      modified,
      untracked,
      deleted,
    }
  }

  // Git operations
  /**
   * Clone a Git repository
   */
  async clone(options: GitCloneOptions): Promise<void> {
    const args: string[] = ['clone']
    if (options.branch) {
      args.push('-b', options.branch)
    }
    if (options.depth) {
      args.push('--depth', String(options.depth))
    }
    if (options.commit) {
      args.push('--single-branch')
    }
    const authUrl = this.buildAuthUrl(options.url, options.auth)
    args.push(authUrl)
    if (options.targetDir) {
      args.push(options.targetDir)
    }

    const env = this.setupGitAuth({}, options.auth)
    const result = await this.execSync({
      command: 'git',
      args,
      env,
      timeout: 300, // 5 minutes timeout for clone
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git clone failed: ${result.stderr || result.stdout}`)
    }

    // If specific commit is requested, checkout that commit
    if (options.commit && options.targetDir) {
      await this.execSync({
        command: 'git',
        args: ['checkout', options.commit],
        cwd: options.targetDir,
      })
    }
  }

  /**
   * Pull changes from remote repository
   */
  async pull(repoPath: string, options?: GitPullOptions): Promise<void> {
    const args: string[] = ['pull']
    const remote = options?.remote || 'origin'
    if (options?.branch) {
      args.push(remote, options.branch)
    }

    const env = this.setupGitAuth({}, options?.auth)
    const result = await this.execSync({
      command: 'git',
      args,
      cwd: repoPath,
      env,
      timeout: 120, // 2 minutes timeout
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git pull failed: ${result.stderr || result.stdout}`)
    }
  }

  /**
   * Push changes to remote repository
   */
  async push(repoPath: string, options?: GitPushOptions): Promise<void> {
    const args: string[] = ['push']
    const remote = options?.remote || 'origin'
    if (options?.force) {
      args.push('--force')
    }
    if (options?.branch) {
      args.push(remote, options.branch)
    } else {
      args.push(remote)
    }

    const env = this.setupGitAuth({}, options?.auth)
    const result = await this.execSync({
      command: 'git',
      args,
      cwd: repoPath,
      env,
      timeout: 120, // 2 minutes timeout
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git push failed: ${result.stderr || result.stdout}`)
    }
  }

  /**
   * List all branches
   */
  async branches(repoPath: string): Promise<GitBranchInfo[]> {
    // Get current branch
    const currentBranchResult = await this.execSync({
      command: 'git',
      args: ['rev-parse', '--abbrev-ref', 'HEAD'],
      cwd: repoPath,
    })

    const currentBranch = currentBranchResult.stdout.trim()

    // Get all branches
    const branchesResult = await this.execSync({
      command: 'git',
      args: ['branch', '-a'],
      cwd: repoPath,
    })

    if (branchesResult.exitCode !== 0) {
      throw new Error(`Git branches failed: ${branchesResult.stderr || branchesResult.stdout}`)
    }

    const branches = this.parseGitBranches(branchesResult.stdout, currentBranch)

    // Get commit hashes for each branch
    for (const branch of branches) {
      try {
        const commitResult = await this.execSync({
          command: 'git',
          args: ['rev-parse', branch.isRemote ? `origin/${branch.name}` : branch.name],
          cwd: repoPath,
        })
        if (commitResult.exitCode === 0) {
          branch.commit = commitResult.stdout.trim()
        }
      } catch {
        // Ignore errors for branches that don't exist
      }
    }

    return branches
  }

  /**
   * Create a new branch
   */
  async createBranch(repoPath: string, branchName: string, checkout = false): Promise<void> {
    const args = checkout ? ['checkout', '-b', branchName] : ['branch', branchName]

    const result = await this.execSync({
      command: 'git',
      args,
      cwd: repoPath,
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git create branch failed: ${result.stderr || result.stdout}`)
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(repoPath: string, branchName: string, force = false, remote = false): Promise<void> {
    if (remote) {
      const result = await this.execSync({
        command: 'git',
        args: ['push', 'origin', '--delete', branchName],
        cwd: repoPath,
      })

      if (result.exitCode !== 0) {
        throw new Error(`Git delete remote branch failed: ${result.stderr || result.stdout}`)
      }
    } else {
      const args = force ? ['branch', '-D', branchName] : ['branch', '-d', branchName]

      const result = await this.execSync({
        command: 'git',
        args,
        cwd: repoPath,
      })

      if (result.exitCode !== 0) {
        throw new Error(`Git delete branch failed: ${result.stderr || result.stdout}`)
      }
    }
  }

  /**
   * Checkout a branch
   */
  async checkoutBranch(repoPath: string, branchName: string, create = false): Promise<void> {
    const args = create ? ['checkout', '-b', branchName] : ['checkout', branchName]

    const result = await this.execSync({
      command: 'git',
      args,
      cwd: repoPath,
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git checkout failed: ${result.stderr || result.stdout}`)
    }
  }

  /**
   * Stage files for commit
   */
  async add(repoPath: string, files?: string | string[]): Promise<void> {
    const args: string[] = ['add']
    if (!files || (Array.isArray(files) && files.length === 0)) {
      args.push('.')
    } else if (typeof files === 'string') {
      args.push(files)
    } else {
      args.push(...files)
    }

    const result = await this.execSync({
      command: 'git',
      args,
      cwd: repoPath,
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git add failed: ${result.stderr || result.stdout}`)
    }
  }

  /**
   * Commit changes
   */
  async commit(repoPath: string, options: GitCommitOptions): Promise<void> {
    const args: string[] = ['commit']
    if (options.all) {
      args.push('-a')
    }
    if (options.allowEmpty) {
      args.push('--allow-empty')
    }
    if (options.author) {
      args.push('--author', `${options.author.name} <${options.author.email}>`)
    }
    args.push('-m', options.message)

    const result = await this.execSync({
      command: 'git',
      args,
      cwd: repoPath,
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git commit failed: ${result.stderr || result.stdout}`)
    }
  }

  /**
   * Get repository status
   */
  async gitStatus(repoPath: string): Promise<GitStatus> {
    // Get porcelain status
    const porcelainResult = await this.execSync({
      command: 'git',
      args: ['status', '--porcelain'],
      cwd: repoPath,
    })

    // Get branch status
    const branchResult = await this.execSync({
      command: 'git',
      args: ['status', '-sb'],
      cwd: repoPath,
    })

    if (porcelainResult.exitCode !== 0 || branchResult.exitCode !== 0) {
      throw new Error(`Git status failed: ${branchResult.stderr || branchResult.stdout}`)
    }

    const branchLine = branchResult.stdout.split('\n')[0] || ''
    return this.parseGitStatus(porcelainResult.stdout, branchLine)
  }
}
