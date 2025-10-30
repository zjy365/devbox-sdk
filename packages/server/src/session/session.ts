/**
 * Individual Session
 * Represents a persistent shell session
 */

import { createLogger, type Logger } from '@sealos/devbox-shared/logger'

export interface SessionConfig {
  workingDir: string
  env: Record<string, string>
  shell: string
}

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

export class Session {
  public readonly id: string
  public readonly createdAt: number
  public workingDir: string
  public env: Record<string, string>
  public lastActivity: number
  public isActive: boolean

  private shell: Bun.Subprocess | null = null
  private logger: Logger
  private outputBuffer: string = ''
  private stderrBuffer: string = ''

  constructor(id: string, config: SessionConfig) {
    this.id = id
    this.createdAt = Date.now()
    this.workingDir = config.workingDir
    this.env = { ...config.env }
    this.lastActivity = Date.now()
    this.isActive = false
    this.logger = createLogger()
    
    this.initializeShell(config.shell)
  }

  /**
   * Initialize the shell process
   */
  private async initializeShell(shell: string): Promise<void> {
    try {
      this.shell = Bun.spawn([shell, '-i'], {
        cwd: this.workingDir,
        env: { ...process.env, ...this.env },
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe'
      })

      this.isActive = true
      this.logger.info(`Initialized shell for session ${this.id}`)

      // Set up output reading
      this.setupOutputReading()
    } catch (error) {
      this.logger.error(`Failed to initialize shell for session ${this.id}:`, error)
      throw error
    }
  }

  /**
   * Set up output reading from shell
   */
  private setupOutputReading(): void {
    if (!this.shell) return

    // Read stdout
    const reader = this.shell.stdout?.getReader()
    if (reader) {
      this.readOutput(reader, 'stdout')
    }

    // Read stderr
    const stderrReader = this.shell.stderr?.getReader()
    if (stderrReader) {
      this.readOutput(stderrReader, 'stderr')
    }
  }

  /**
   * Read output from shell streams
   */
  private async readOutput(reader: ReadableStreamDefaultReader<Uint8Array>, type: 'stdout' | 'stderr'): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = new TextDecoder().decode(value)
        if (type === 'stdout') {
          this.outputBuffer += text
        } else {
          this.stderrBuffer += text
        }
      }
    } catch (error) {
      this.logger.error(`Error reading ${type} for session ${this.id}:`, error)
    }
  }

  /**
   * Execute a command in the session
   */
  async execute(command: string): Promise<ExecResult> {
    if (!this.shell || !this.isActive) {
      throw new Error(`Session ${this.id} is not active`)
    }

    const startTime = Date.now()
    this.lastActivity = startTime

    try {
      // Clear buffers
      this.outputBuffer = ''
      this.stderrBuffer = ''

      // Send command to shell
      const commandWithMarker = `${command}\necho "___COMMAND_COMPLETE___"\n`
      this.shell.stdin?.write(commandWithMarker)

      // Wait for command completion marker
      await this.waitForCommandCompletion()

      const duration = Date.now() - startTime

      // Parse output (remove the marker and command echo)
      const lines = this.outputBuffer.split('\n')
      const commandEchoIndex = lines.findIndex(line => line.trim() === command)
      const markerIndex = lines.findIndex(line => line.includes('___COMMAND_COMPLETE___'))
      
      let stdout = ''
      if (commandEchoIndex >= 0 && markerIndex > commandEchoIndex) {
        stdout = lines.slice(commandEchoIndex + 1, markerIndex).join('\n').trim()
      }

      return {
        exitCode: 0, // We can't easily get exit code from interactive shell
        stdout,
        stderr: this.stderrBuffer.trim(),
        duration
      }
    } catch (error) {
      this.logger.error(`Error executing command in session ${this.id}:`, error)
      throw error
    }
  }

  /**
   * Wait for command completion marker
   */
  private async waitForCommandCompletion(timeout: number = 30000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      if (this.outputBuffer.includes('___COMMAND_COMPLETE___')) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    throw new Error(`Command timeout in session ${this.id}`)
  }

  /**
   * Update environment variables
   */
  async updateEnv(newEnv: Record<string, string>): Promise<void> {
    this.env = { ...this.env, ...newEnv }
    
    if (this.shell && this.isActive) {
      // Send export commands to shell
      for (const [key, value] of Object.entries(newEnv)) {
        const exportCommand = `export ${key}="${value}"\n`
        this.shell.stdin?.write(exportCommand)
      }
    }
    
    this.lastActivity = Date.now()
  }

  /**
   * Change working directory
   */
  async changeDirectory(path: string): Promise<void> {
    this.workingDir = path
    
    if (this.shell && this.isActive) {
      const cdCommand = `cd "${path}"\n`
      this.shell.stdin?.write(cdCommand)
    }
    
    this.lastActivity = Date.now()
  }

  /**
   * Terminate the session
   */
  async terminate(): Promise<void> {
    if (this.shell && this.isActive) {
      try {
        // Send exit command
        this.shell.stdin?.write('exit\n')
        
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Force kill if still running
        if (this.shell.killed === false) {
          this.shell.kill()
        }
      } catch (error) {
        this.logger.error(`Error terminating session ${this.id}:`, error)
      }
    }
    
    this.isActive = false
    this.shell = null
    this.logger.info(`Terminated session ${this.id}`)
  }

  /**
   * Get session status
   */
  getStatus(): {
    id: string
    isActive: boolean
    workingDir: string
    env: Record<string, string>
    createdAt: number
    lastActivity: number
  } {
    return {
      id: this.id,
      isActive: this.isActive,
      workingDir: this.workingDir,
      env: this.env,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity
    }
  }
}

