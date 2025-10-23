/**
 * Process Execution Handler
 * Handles command execution and process management
 */

import type { ProcessExecRequest, ProcessStatusResponse } from '../types/server'

interface RunningProcess {
  pid: number
  process: Bun.Subprocess
  startTime: number
  stdout: string
  stderr: string
}

export class ProcessHandler {
  private runningProcesses = new Map<number, RunningProcess>()
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    // Clean up finished processes periodically
    setInterval(() => this.cleanupFinishedProcesses(), 30000)
  }

  async handleExec(request: ProcessExecRequest): Promise<Response> {
    try {
      const command = request.command
      const args = request.args || []
      const cwd = request.cwd || this.workspacePath
      const env = { ...process.env, ...request.env }
      const timeout = request.timeout || 30000

      // Execute command using Bun
      const subprocess = Bun.spawn([command, ...args], {
        cwd,
        env,
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe'
      })

      const runningProcess: RunningProcess = {
        pid: subprocess.pid || 0,
        process: subprocess,
        startTime: Date.now(),
        stdout: '',
        stderr: ''
      }

      this.runningProcesses.set(subprocess.pid || 0, runningProcess)

      // Read output with timeout handling
      try {
        // Wait for process to complete with timeout
        const result = await Promise.race([
          subprocess.exited,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Process timeout')), timeout)
          )
        ])

        // Get all output when done
        runningProcess.stdout = await new Response(subprocess.stdout).text()
        runningProcess.stderr = await new Response(subprocess.stderr).text()
      } catch (error) {
        subprocess.kill()
        throw error
      }

      const exitCode = await subprocess.exited

      const exitCodeValue = await exitCode
      const response: ProcessStatusResponse = {
        pid: subprocess.pid || 0,
        status: exitCodeValue === 0 ? 'completed' : 'failed',
        exitCode: exitCodeValue,
        stdout: runningProcess.stdout,
        stderr: runningProcess.stderr
      }

      return Response.json(response)
    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
  }

  async handleStatus(pid: number): Promise<Response> {
    const runningProcess = this.runningProcesses.get(pid)

    if (!runningProcess) {
      return Response.json({
        success: false,
        error: 'Process not found',
        timestamp: new Date().toISOString()
      }, { status: 404 })
    }

    try {
      const exitCode = await runningProcess.process.exited

      const response: ProcessStatusResponse = {
        pid,
        status: exitCode === undefined ? 'running' : (exitCode === 0 ? 'completed' : 'failed'),
        exitCode,
        stdout: runningProcess.stdout,
        stderr: runningProcess.stderr
      }

      return Response.json(response)
    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
  }

  private cleanupFinishedProcesses(): void {
    for (const [pid, runningProcess] of this.runningProcesses.entries()) {
      if (runningProcess.process.exited !== undefined) {
        this.runningProcesses.delete(pid)
      }
    }
  }
}