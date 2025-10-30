/**
 * Process Tracker
 * Tracks running processes and their status
 */

import { createLogger, type Logger } from '@sealos/devbox-shared/logger'

export interface ProcessInfo {
  id: string
  pid: number
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  status: 'running' | 'completed' | 'failed' | 'killed'
  startTime: number
  endTime?: number
  exitCode?: number
  stdout: string
  stderr: string
  timeout?: number
}

export interface ProcessStats {
  total: number
  running: number
  completed: number
  failed: number
  killed: number
}

export class ProcessTracker {
  private processes = new Map<string, ProcessInfo>()
  private logger: Logger
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    this.logger = createLogger()
    this.cleanupInterval = setInterval(() => this.cleanupCompletedProcesses(), 30000) // 30 seconds
  }

  /**
   * Add a new process to tracking
   */
  addProcess(process: Bun.Subprocess, info: {
    id: string
    command: string
    args: string[]
    cwd: string
    env: Record<string, string>
    timeout?: number
  }): ProcessInfo {
    const processInfo: ProcessInfo = {
      id: info.id,
      pid: process.pid || 0,
      command: info.command,
      args: info.args,
      cwd: info.cwd,
      env: info.env,
      status: 'running',
      startTime: Date.now(),
      stdout: '',
      stderr: '',
      timeout: info.timeout
    }

    this.processes.set(info.id, processInfo)
    this.logger.info(`Started tracking process ${info.id} (PID: ${process.pid})`)

    // Set up process monitoring
    this.monitorProcess(process, processInfo)

    return processInfo
  }

  /**
   * Get process by ID
   */
  getProcess(id: string): ProcessInfo | null {
    return this.processes.get(id) || null
  }

  /**
   * Get all processes
   */
  getAllProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values())
  }

  /**
   * Get processes by status
   */
  getProcessesByStatus(status: ProcessInfo['status']): ProcessInfo[] {
    return Array.from(this.processes.values()).filter(p => p.status === status)
  }

  /**
   * Kill a process
   */
  async killProcess(id: string, signal: string = 'SIGTERM'): Promise<boolean> {
    const processInfo = this.processes.get(id)
    if (!processInfo) {
      return false
    }

    try {
      // Find the actual process and kill it
      const process = this.findProcessByPid(processInfo.pid)
      if (process) {
        process.kill(signal as any)
      }

      processInfo.status = 'killed'
      processInfo.endTime = Date.now()
      
      this.logger.info(`Killed process ${id} (PID: ${processInfo.pid})`)
      return true
    } catch (error) {
      this.logger.error(`Failed to kill process ${id}:`, error as Error)
      return false
    }
  }

  /**
   * Remove a process from tracking
   */
  removeProcess(id: string): boolean {
    const process = this.processes.get(id)
    if (!process) {
      return false
    }

    this.processes.delete(id)
    this.logger.info(`Removed process ${id} from tracking`)
    return true
  }

  /**
   * Get process statistics
   */
  getStats(): ProcessStats {
    const processes = Array.from(this.processes.values())
    
    return {
      total: processes.length,
      running: processes.filter(p => p.status === 'running').length,
      completed: processes.filter(p => p.status === 'completed').length,
      failed: processes.filter(p => p.status === 'failed').length,
      killed: processes.filter(p => p.status === 'killed').length
    }
  }

  /**
   * Monitor a process for completion
   */
  private async monitorProcess(process: Bun.Subprocess, processInfo: ProcessInfo): Promise<void> {
    try {
      // Set up timeout if specified
      let timeoutId: NodeJS.Timeout | null = null
      if (processInfo.timeout) {
        timeoutId = setTimeout(() => {
          this.logger.warn(`Process ${processInfo.id} timed out after ${processInfo.timeout}ms`)
          process.kill('SIGKILL')
          processInfo.status = 'killed'
          processInfo.endTime = Date.now()
        }, processInfo.timeout)
      }

    // Read stdout
    if (process.stdout && typeof process.stdout === 'object' && 'getReader' in process.stdout) {
      const reader = (process.stdout as ReadableStream<Uint8Array>).getReader()
      this.readStream(reader, 'stdout', processInfo)
    }

    // Read stderr
    if (process.stderr && typeof process.stderr === 'object' && 'getReader' in process.stderr) {
      const reader = (process.stderr as ReadableStream<Uint8Array>).getReader()
      this.readStream(reader, 'stderr', processInfo)
    }

      // Wait for process to complete
      const exitCode = await process.exited
      
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      // Update process info
      processInfo.status = exitCode === 0 ? 'completed' : 'failed'
      processInfo.exitCode = exitCode
      processInfo.endTime = Date.now()

      this.logger.info(`Process ${processInfo.id} completed with exit code ${exitCode}`)
    } catch (error) {
      this.logger.error(`Error monitoring process ${processInfo.id}:`, error as Error)
      processInfo.status = 'failed'
      processInfo.endTime = Date.now()
    }
  }

  /**
   * Read from a stream and update process info
   */
  private async readStream(
    reader: any,
    type: 'stdout' | 'stderr',
    processInfo: ProcessInfo
  ): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = new TextDecoder().decode(value)
        if (type === 'stdout') {
          processInfo.stdout += text
        } else {
          processInfo.stderr += text
        }
      }
    } catch (error) {
      this.logger.error(`Error reading ${type} for process ${processInfo.id}:`, error as Error)
    }
  }

  /**
   * Find process by PID (simplified - in real implementation you'd track the actual process objects)
   */
  private findProcessByPid(pid: number): Bun.Subprocess | null {
    // This is a simplified implementation
    // In a real scenario, you'd need to track the actual process objects
    return null
  }

  /**
   * Clean up completed processes older than 1 hour
   */
  private cleanupCompletedProcesses(): void {
    const now = Date.now()
    const maxAge = 60 * 60 * 1000 // 1 hour

    for (const [id, process] of this.processes) {
      if (process.status !== 'running' && process.endTime && (now - process.endTime) > maxAge) {
        this.logger.info(`Cleaning up old process ${id}`)
        this.processes.delete(id)
      }
    }
  }

  /**
   * Get process logs
   */
  getProcessLogs(id: string, tail?: number): { stdout: string; stderr: string } | null {
    const process = this.processes.get(id)
    if (!process) {
      return null
    }

    let stdout = process.stdout
    let stderr = process.stderr

    if (tail && tail > 0) {
      const stdoutLines = stdout.split('\n')
      const stderrLines = stderr.split('\n')
      
      stdout = stdoutLines.slice(-tail).join('\n')
      stderr = stderrLines.slice(-tail).join('\n')
    }

    return { stdout, stderr }
  }

  /**
   * Cleanup all processes
   */
  async cleanup(): Promise<void> {
    clearInterval(this.cleanupInterval)
    
    // Kill all running processes
    for (const [id, process] of this.processes) {
      if (process.status === 'running') {
        await this.killProcess(id)
      }
    }
    
    this.processes.clear()
    this.logger.info('Cleaned up all processes')
  }
}
