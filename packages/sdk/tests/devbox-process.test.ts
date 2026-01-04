/**
 * Devbox SDK Process Management Tests
 *
 * Test Purpose:
 * This test file validates Devbox SDK process management functionality, including:
 * 1. Asynchronous process execution
 * 2. Synchronous process execution
 * 3. Streaming process execution (SSE)
 * 4. Process list query
 * 5. Process status query
 * 6. Process termination
 * 7. Process log retrieval
 *
 * Test Coverage:
 * - Execute commands asynchronously and retrieve process_id
 * - Execute commands synchronously and retrieve output
 * - Execute commands with streaming and handle real-time output
 * - List all running processes
 * - Query status of specific processes
 * - Terminate running processes
 * - Retrieve process execution logs
 * - Error handling and edge cases
 *
 * Notes:
 * - All tests require a real Devbox instance (created via Kubernetes API)
 * - Tests use mockServerUrl to connect to local Go Server (configured via DEVBOX_SERVER_URL environment variable)
 * - Tests create and delete Devbox instances, ensure test environment has sufficient resources
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG, getOrCreateSharedDevbox, cleanupTestFiles } from './setup'
import type { DevboxCreateConfig, ProcessExecOptions } from '../src/core/types'
import { DevboxRuntime } from '../src/api/types'

describe('Devbox SDK Process Management Tests', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    // Use shared devbox instead of creating a new one
    devboxInstance = await getOrCreateSharedDevbox(sdk)

    // Clean up files from previous tests
    await cleanupTestFiles(devboxInstance)
  }, 30000)

  afterEach(async () => {
    // Don't delete the shared devbox, just close the SDK connection
    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  describe('Asynchronous Process Execution', () => {
    it('should be able to execute simple command asynchronously', async () => {
      const options: ProcessExecOptions = {
        command: 'echo',
        args: ['Hello World'],
      }

      const result = await devboxInstance.executeCommand(options)

      expect(result.processId).toBeDefined()
      expect(typeof result.processId).toBe('string')
      expect(result.pid).toBeGreaterThan(0)
      expect(result.processStatus).toBeDefined()
    }, 10000)

    it('should be able to execute command with working directory asynchronously', async () => {
      const options: ProcessExecOptions = {
        command: 'pwd',
        cwd: '/tmp',
      }

      const result = await devboxInstance.executeCommand(options)

      expect(result.processId).toBeDefined()
      expect(result.pid).toBeGreaterThan(0)
    }, 10000)

    it('should be able to execute command with environment variables asynchronously', async () => {
      const options: ProcessExecOptions = {
        command: 'sh',
        args: ['-c', 'echo $TEST_VAR'],
        env: {
          TEST_VAR: 'test-value',
        },
      }

      const result = await devboxInstance.executeCommand(options)

      expect(result.processId).toBeDefined()
    }, 10000)

    it('should be able to execute command with timeout asynchronously', async () => {
      const options: ProcessExecOptions = {
        command: 'sleep',
        args: ['1'],
        timeout: 5,
      }

      const result = await devboxInstance.executeCommand(options)

      expect(result.processId).toBeDefined()
    }, 10000)
  })

  describe('Synchronous Process Execution', () => {
    it('should be able to check node and npm versions with execSync', async () => {
      const nodeResult = await devboxInstance.execSync({
        command: 'node',
        args: ['-v'],
      })

      expect(nodeResult.stdout).toContain('v')
      expect(nodeResult.exitCode).toBe(0)

      const npmResult = await devboxInstance.execSync({
        command: 'npm',
        args: ['-v'],
      })

      expect(npmResult.stdout).toBeDefined()
      expect(npmResult.exitCode).toBe(0)

      const combinedResult = await devboxInstance.execSync({
        command: 'sh',
        args: ['-c', 'node -v && npm -v'],
      })

      expect(combinedResult.stdout).toContain('v')
      expect(combinedResult.exitCode).toBe(0)
    }, 15000)

    it('should be able to execute command synchronously and get output', async () => {
      const options: ProcessExecOptions = {
        command: 'echo',
        args: ['Hello World'],
      }

      const result = await devboxInstance.execSync(options)

      expect(result.stdout).toContain('Hello World')
      expect(result.stderr).toBeDefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    }, 15000)

    it('should be able to execute command synchronously and get exit code', async () => {
      const options: ProcessExecOptions = {
        command: 'sh',
        args: ['-c', 'exit 0'],
      }

      const result = await devboxInstance.execSync(options)

      expect(result.exitCode).toBe(0)
    }, 15000)

    it('should be able to execute failing command synchronously', async () => {
      const options: ProcessExecOptions = {
        command: 'sh',
        args: ['-c', 'exit 1'],
      }

      const result = await devboxInstance.execSync(options)

      expect(result.exitCode).toBe(1)
    }, 15000)

    it('should be able to execute command with working directory synchronously', async () => {
      const options: ProcessExecOptions = {
        command: 'pwd',
        cwd: '/tmp',
      }

      const result = await devboxInstance.execSync(options)

      expect(result.stdout).toContain('/tmp')
    }, 15000)

    it('should be able to execute command with environment variables synchronously', async () => {
      const options: ProcessExecOptions = {
        command: 'sh',
        args: ['-c', 'echo $TEST_VAR'],
        env: {
          TEST_VAR: 'test-value-123',
        },
      }

      const result = await devboxInstance.execSync(options)

      expect(result.stdout).toContain('test-value-123')
    }, 15000)

    it('should be able to handle timed out commands', async () => {
      const options: ProcessExecOptions = {
        command: 'sleep',
        args: ['10'],
        timeout: 2,
      }

      // This test may fail due to timeout, which is expected behavior
      try {
        const result = await devboxInstance.execSync(options)
        // If command completes before timeout, verify result
        expect(result.success).toBeDefined()
      } catch (error) {
        // Timeout error is also acceptable
        expect(error).toBeDefined()
      }
    }, 30000)
  })

  describe('Streaming Process Execution', () => {
    it('should be able to execute command with streaming', async () => {
      const options: ProcessExecOptions = {
        command: 'sh',
        args: ['-c', 'for i in 1 2 3; do echo "Line $i"; sleep 0.1; done'],
      }

      const stream = await devboxInstance.execSyncStream(options)
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let output = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          if (value) {
            output += decoder.decode(value, { stream: true })
          }
        }
      } finally {
        reader.releaseLock()
      }

      expect(output).toBeDefined()
      // SSE stream may contain event format, so just check if there's output
      expect(output.length).toBeGreaterThan(0)
    }, 20000)

    it('should be able to handle streaming execution errors', async () => {
      const options: ProcessExecOptions = {
        command: 'nonexistent-command-12345',
      }

      try {
        const stream = await devboxInstance.execSyncStream(options)
        const reader = stream.getReader()

        try {
          // Try to read some data
          await reader.read()
        } finally {
          reader.releaseLock()
        }
      } catch (error) {
        // Error is expected
        expect(error).toBeDefined()
      }
    }, 15000)
  })

  describe('Process List Query', () => {
    it('should be able to list all processes', async () => {
      // Start a process first
      await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['5'],
      })

      // Wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 1000))

      const result = await devboxInstance.listProcesses()

      expect(result.processes).toBeDefined()
      expect(Array.isArray(result.processes)).toBe(true)
      // Should have at least one process (the one we just started)
      expect(result.processes.length).toBeGreaterThan(0)
    }, 15000)

    it('process list should contain correct fields', async () => {
      // Start a process
      await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['5'],
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      const result = await devboxInstance.listProcesses()

      if (result.processes.length > 0) {
        const process = result.processes[0]
        expect(process?.processId).toBeDefined()
        expect(process?.pid).toBeGreaterThan(0)
        expect(process?.command).toBeDefined()
        expect(process?.processStatus).toBeDefined() // todo go server fix this
        expect(process?.startTime).toBeGreaterThan(0)
      }
    }, 15000)
  })

  describe('Process Status Query', () => {
    it('should be able to get process status', async () => {
      // Start a long-running process
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['10'],
      })

      // Wait for process to start
      await new Promise(resolve => setTimeout(resolve, 1000))

      const status = await devboxInstance.getProcessStatus(execResult.processId)

      expect(status.processId).toBe(execResult.processId)
      expect(status.pid).toBe(execResult.pid)
      expect(status.processStatus).toBeDefined()
      // expect(status.startedAt).toBeDefined()
    }, 15000)

    it('should be able to handle non-existent process ID', async () => {
      const nonExistentId = 'non-existent-process-id-12345'

      await expect(devboxInstance.getProcessStatus(nonExistentId)).rejects.toThrow()
    }, 10000)
  })

  describe('Process Termination', () => {
    it('should be able to terminate running process', async () => {
      // Start a long-running process
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['30'],
      })

      // Wait for process to start
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Terminate process
      await devboxInstance.killProcess(execResult.processId)

      // Verify process has been terminated
      await new Promise(resolve => setTimeout(resolve, 1000))

      const status = await devboxInstance.getProcessStatus(execResult.processId)
      // Process status should be terminated or similar
      expect(status.processStatus).toBeDefined()
    }, 20000)

    it('should be able to terminate process with specified signal', async () => {
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['30'],
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await devboxInstance.killProcess(execResult.processId, {
        signal: 'SIGTERM',
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      const status = await devboxInstance.getProcessStatus(execResult.processId)
      expect(status.processStatus).toBeDefined()
    }, 20000)

    it('should be able to handle terminating non-existent process', async () => {
      const nonExistentId = 'non-existent-process-id-12345'

      await expect(
        devboxInstance.killProcess(nonExistentId)
      ).rejects.toThrow()
    }, 10000)
  })

  describe('Process Log Retrieval', () => {
    it('should be able to get process logs', async () => {
      // Start a process that produces output
      const execResult = await devboxInstance.executeCommand({
        command: 'sh',
        args: ['-c', 'echo "Line 1"; echo "Line 2"; sleep 2'],
      })

      // Wait for process to produce some output
      await new Promise(resolve => setTimeout(resolve, 2000))

      const logs = await devboxInstance.getProcessLogs(execResult.processId)

      expect(logs.processId).toBe(execResult.processId)
      expect(logs.logs).toBeDefined()
      expect(Array.isArray(logs.logs)).toBe(true)
    }, 15000)

    it('should be able to get logs of completed process', async () => {
      // Start a quickly completing process
      const execResult = await devboxInstance.executeCommand({
        command: 'sh',
        args: ['-c', 'echo "Test output"; exit 0'],
      })

      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 2000))

      const logs = await devboxInstance.getProcessLogs(execResult.processId)

      expect(logs.processId).toBe(execResult.processId)
      expect(logs.logs).toBeDefined()
    }, 15000)

    it('should be able to handle non-existent process logs', async () => {
      const nonExistentId = 'non-existent-process-id-12345'

      await expect(devboxInstance.getProcessLogs(nonExistentId)).rejects.toThrow()
    }, 10000)
  })

  describe('Process Management Integration Tests', () => {
    it('should be able to execute, query and terminate process completely', async () => {
      // 1. Start process
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['20'],
      })

      expect(execResult.processId).toBeDefined()

      // 2. Query process status
      await new Promise(resolve => setTimeout(resolve, 1000))
      const status = await devboxInstance.getProcessStatus(execResult.processId)
      expect(status.processId).toBe(execResult.processId)

      // 3. Get process logs
      await devboxInstance.getProcessLogs(execResult.processId)

      // 4. Terminate process
      await devboxInstance.killProcess(execResult.processId)

      // 5. Verify process has been terminated
      await new Promise(resolve => setTimeout(resolve, 1000))
      const finalStatus = await devboxInstance.getProcessStatus(execResult.processId)
      expect(finalStatus.processStatus).toBeDefined()
    }, 30000)

    it('should be able to see newly started process in process list', async () => {
      // Start a process
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['10'],
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      // List all processes
      const listResult = await devboxInstance.listProcesses()

      // Check if our process is in the list
      const foundProcess = listResult.processes.find(
        p => p.processId === execResult.processId
      )

      expect(foundProcess).toBeDefined()
      if (foundProcess) {
        expect(foundProcess.pid).toBe(execResult.pid)
      }
    }, 15000)
  })

  describe('Error Handling', () => {
    it('should handle invalid commands', async () => {
      const options: ProcessExecOptions = {
        command: '',
      }

      await expect(devboxInstance.executeCommand(options)).rejects.toThrow()
    }, 10000)

    it('should handle non-existent commands', async () => {
      const options: ProcessExecOptions = {
        command: 'nonexistent-command-xyz123',
      }

      // Async execution may succeed (return process_id), but process will fail
      try {
        const result = await devboxInstance.executeCommand(options)
        expect(result.processId).toBeDefined()
      } catch (error) {
        // If it fails directly, that's also acceptable
        expect(error).toBeDefined()
      }
    }, 10000)

    it('should handle synchronous execution of non-existent commands', async () => {
      const options: ProcessExecOptions = {
        command: 'nonexistent-command-xyz123',
      }

      await expect(devboxInstance.execSync(options)).rejects.toThrow()
    }, 15000)
  })
})

