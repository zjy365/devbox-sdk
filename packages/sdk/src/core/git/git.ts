/**
 * Git operations module for DevboxInstance
 * Provides Git repository operations through a clean API
 */

import type {
  GitAuth,
  GitBranchInfo,
  GitCloneOptions,
  GitPullOptions,
  GitPushOptions,
  GitStatus,
  ProcessExecOptions,
  SyncExecutionResponse,
} from '../types'

/**
 * Dependencies interface for Git
 * Allows dependency injection to avoid circular dependencies
 */
export interface GitDependencies {
  execSync: (options: ProcessExecOptions) => Promise<SyncExecutionResponse>
}

/**
 * Git operations class
 * Provides methods for Git repository operations
 */
export class Git {
  constructor(private deps: GitDependencies) {}

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

    const isClean =
      staged.length === 0 && modified.length === 0 && untracked.length === 0 && deleted.length === 0

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
    const result = await this.deps.execSync({
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
      await this.deps.execSync({
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
    const remote = options?.remote || 'origin'

    // If auth is provided, update remote URL to include credentials
    if (options?.auth) {
      const urlResult = await this.deps.execSync({
        command: 'git',
        args: ['remote', 'get-url', remote],
        cwd: repoPath,
      })

      if (urlResult.exitCode === 0) {
        const currentUrl = urlResult.stdout.trim()
        const authUrl = this.buildAuthUrl(currentUrl, options.auth)

        // Update remote URL with authentication
        await this.deps.execSync({
          command: 'git',
          args: ['remote', 'set-url', remote, authUrl],
          cwd: repoPath,
        })
      }
    }

    const args: string[] = ['pull']
    if (options?.branch) {
      args.push(remote, options.branch)
    }

    const result = await this.deps.execSync({
      command: 'git',
      args,
      cwd: repoPath,
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
    const remote = options?.remote || 'origin'

    // If auth is provided, update remote URL to include credentials
    if (options?.auth) {
      const urlResult = await this.deps.execSync({
        command: 'git',
        args: ['remote', 'get-url', remote],
        cwd: repoPath,
      })

      if (urlResult.exitCode === 0) {
        const currentUrl = urlResult.stdout.trim()
        const authUrl = this.buildAuthUrl(currentUrl, options.auth)

        // Update remote URL with authentication
        await this.deps.execSync({
          command: 'git',
          args: ['remote', 'set-url', remote, authUrl],
          cwd: repoPath,
        })
      }
    }

    const args: string[] = ['push']
    if (options?.force) {
      args.push('--force')
    }
    if (options?.branch) {
      args.push(remote, options.branch)
    } else {
      args.push(remote)
    }

    const result = await this.deps.execSync({
      command: 'git',
      args,
      cwd: repoPath,
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
    const currentBranchResult = await this.deps.execSync({
      command: 'git',
      args: ['rev-parse', '--abbrev-ref', 'HEAD'],
      cwd: repoPath,
    })

    const currentBranch = currentBranchResult.stdout.trim()

    // Get all branches
    const branchesResult = await this.deps.execSync({
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
        const commitResult = await this.deps.execSync({
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

    const result = await this.deps.execSync({
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
  async deleteBranch(
    repoPath: string,
    branchName: string,
    force = false,
    remote = false
  ): Promise<void> {
    if (remote) {
      const result = await this.deps.execSync({
        command: 'git',
        args: ['push', 'origin', '--delete', branchName],
        cwd: repoPath,
      })

      if (result.exitCode !== 0) {
        throw new Error(`Git delete remote branch failed: ${result.stderr || result.stdout}`)
      }
    } else {
      const args = force ? ['branch', '-D', branchName] : ['branch', '-d', branchName]

      const result = await this.deps.execSync({
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

    const result = await this.deps.execSync({
      command: 'git',
      args,
      cwd: repoPath,
    })

    if (result.exitCode !== 0) {
      throw new Error(`Git checkout failed: ${result.stderr || result.stdout}`)
    }
  }

  private normalizePath(repoPath: string, filePath: string): string {
    const normalize = (p: string): string => {
      let normalized = p.trim()
      if (normalized.startsWith('./')) {
        normalized = normalized.substring(2)
      }
      normalized = normalized.replace(/\/$/, '')
      return normalized
    }

    const normRepo = normalize(repoPath)
    const normFile = normalize(filePath)

    if (normFile.startsWith(`${normRepo}/`)) {
      return normFile.substring(normRepo.length + 1)
    }

    if (normFile === normRepo) {
      return '.'
    }

    if (filePath.startsWith('/')) {
      const repoIndex = filePath.indexOf(normRepo)
      if (repoIndex !== -1) {
        const afterRepo = filePath.substring(repoIndex + normRepo.length)
        if (afterRepo.startsWith('/')) {
          return afterRepo.substring(1) || '.'
        }
      }
    }

    return normFile
  }

  /**
   * Stage files for commit
   */
  async add(repoPath: string, files?: string | string[]): Promise<void> {
    const args: string[] = ['add']
    if (!files || (Array.isArray(files) && files.length === 0)) {
      args.push('.')
    } else if (typeof files === 'string') {
      args.push(this.normalizePath(repoPath, files))
    } else {
      args.push(...files.map(file => this.normalizePath(repoPath, file)))
    }

    const result = await this.deps.execSync({
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
  async commit(
    repoPath: string,
    message: string,
    author: string,
    email: string,
    allowEmpty?: boolean
  ): Promise<void> {
    const args: string[] = ['commit']
    if (allowEmpty) {
      args.push('--allow-empty')
    }
    args.push('--author', `${author} <${email}>`)
    args.push('-m', message)

    const result = await this.deps.execSync({
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
  async status(repoPath: string): Promise<GitStatus> {
    // Get porcelain status
    const porcelainResult = await this.deps.execSync({
      command: 'git',
      args: ['status', '--porcelain'],
      cwd: repoPath,
    })

    // Get branch status
    const branchResult = await this.deps.execSync({
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
