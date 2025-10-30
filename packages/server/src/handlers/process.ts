/**
 * Process Execution Handler
 * Handles command execution and process management
 */

import type { ProcessExecRequest, ProcessStatusResponse } from '../types/server'
import { ProcessTracker } from '../utils/process-tracker'
import { successResponse, errorResponse, notFoundResponse } from '../core/response-builder'
import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import { createLogger, type Logger } from '@sealos/devbox-shared/logger'

export class ProcessHandler {
  private processTracker: ProcessTracker
  private workspacePath: string
  private logger: Logger

  constructor(workspacePath: string, processTracker?: ProcessTracker) {
    this.workspacePath = workspacePath
    this.processTracker = processTracker || new ProcessTracker()
    this.logger = createLogger()
  }

  async handleExec(request: ProcessExecRequest): Promise<Response> {
    try {
      const command = request.command
      const args = request.args || []
      const cwd = request.cwd || this.workspacePath
      const env = { ...process.env, ...request.env } as Record<string, string>
      const timeout = request.timeout || 30000

      // Generate unique process ID
      const processId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Execute command using Bun
      const subprocess = Bun.spawn([command, ...args], {
        cwd,
        env,
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe'
      })

      // Add to process tracker
      const processInfo = this.processTracker.addProcess(subprocess, {
        id: processId,
        command,
        args,
        cwd,
        env,
        timeout
      })

      // Wait for process to complete
      try {
        const exitCode = await subprocess.exited
        const response: ProcessStatusResponse = {
          pid: subprocess.pid || 0,
          status: exitCode === 0 ? 'completed' : 'failed',
          exitCode,
          stdout: processInfo.stdout,
          stderr: processInfo.stderr
        }

        return successResponse(response)
      } catch (error) {
        subprocess.kill()
        throw error
      }
    } catch (error) {
      this.logger.error('Process execution failed:', error as Error)
      return errorResponse(
        new DevboxError(
          'Process execution failed',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }

  async handleStatus(processId: string): Promise<Response> {
    try {
      const processInfo = this.processTracker.getProcess(processId)
      if (!processInfo) {
        return notFoundResponse(`Process ${processId} not found`)
      }

      const response: ProcessStatusResponse = {
        pid: processInfo.pid,
        status: processInfo.status === 'running' ? 'running' : 
                processInfo.status === 'completed' ? 'completed' : 'failed',
        exitCode: processInfo.exitCode,
        stdout: processInfo.stdout,
        stderr: processInfo.stderr
      }

      return successResponse(response)
    } catch (error) {
      this.logger.error('Failed to get process status:', error as Error)
      return errorResponse(
        new DevboxError(
          'Failed to get process status',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }

  async handleKillProcess(processId: string, signal: string = 'SIGTERM'): Promise<Response> {
    try {
      const success = await this.processTracker.killProcess(processId, signal)
      if (!success) {
        return notFoundResponse(`Process ${processId} not found`)
      }

      return successResponse({ success: true })
    } catch (error) {
      this.logger.error('Failed to kill process:', error as Error)
      return errorResponse(
        new DevboxError(
          'Failed to kill process',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }

  async handleListProcesses(): Promise<Response> {
    try {
      const processes = this.processTracker.getAllProcesses()
      const stats = this.processTracker.getStats()
      
      return successResponse({
        processes: processes.map(p => ({
          id: p.id,
          pid: p.pid,
          command: p.command,
          status: p.status,
          startTime: p.startTime,
          endTime: p.endTime,
          exitCode: p.exitCode
        })),
        stats
      })
    } catch (error) {
      this.logger.error('Failed to list processes:', error as Error)
      return errorResponse(
        new DevboxError(
          'Failed to list processes',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }

  async handleGetProcessLogs(processId: string, tail?: number): Promise<Response> {
    try {
      const logs = this.processTracker.getProcessLogs(processId, tail)
      if (!logs) {
        return notFoundResponse(`Process ${processId} not found`)
      }

      return successResponse(logs)
    } catch (error) {
      this.logger.error('Failed to get process logs:', error as Error)
      return errorResponse(
        new DevboxError(
          'Failed to get process logs',
          ErrorCode.INTERNAL_ERROR,
          { cause: error as Error }
        )
      )
    }
  }
}