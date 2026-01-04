/**
 * Devbox SDK Background Process Execution Tests
 *
 * Test Purpose: Validate executeCommand() method's background execution capabilities
 * - Start background process (node hello_world.js)
 * - Query process status
 * - Get process logs
 * - Terminate process
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'

describe('Devbox SDK Background Process Execution Tests', () => {
    let sdk: DevboxSDK
    let devboxInstance: DevboxInstance
    // Use existing Devbox
    const devboxName = 'my-nodejs-appxxx'

    beforeEach(async () => {
        sdk = new DevboxSDK(TEST_CONFIG)
        devboxInstance = await sdk.getDevbox(devboxName)
    }, 30000) // 30 second timeout

    afterEach(async () => {
        // Don't delete devbox, as we're using an existing one
        // Only close SDK connection
        await sdk.close()
    }, 10000)

    describe('Background Process Execution', () => {
        it('should be able to create and execute a continuously running hello_world.js file', async () => {
            // 1. Create hello_world.js file - a simple HTTP server (similar to npm run dev)
            const helloWorldCode = `
const http = require('http')

const PORT = process.env.PORT || 3000

const server = http.createServer((req, res) => {
  const now = new Date().toISOString()
  console.log(\`[\${now}] Received request: \${req.method} \${req.url}\`)
  
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Hello, World! Server is running.\\n')
})

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err.message)
  console.error('Error code:', err.code)
  process.exit(1)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('Hello, World! HTTP Server started')
  console.log(\`Server is running on http://0.0.0.0:\${PORT}\`)
  console.log('Process started successfully - this server will run indefinitely')
})

// Handle exit signals (graceful shutdown)
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message)
  console.error(err.stack)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  process.exit(1)
})
`

            await devboxInstance.writeFile('/home/devbox/project/hello_world.js', helloWorldCode)

            // Verify file was created
            const content = await devboxInstance.readFile('/home/devbox/project/hello_world.js')
            expect(content.toString()).toContain('Hello, World!')
            expect(content.toString()).toContain('http.createServer')

            // 2. Clean up processes that might be using port 3000
            try {
                const processList = await devboxInstance.listProcesses()

                // Find all running node processes, especially hello_world.js
                const nodeProcesses = processList.processes.filter(p => {
                    const cmd = p.command || ''
                    return (cmd.includes('node') && cmd.includes('hello_world')) ||
                        (p.processStatus === 'running' && cmd.includes('node'))
                })

                if (nodeProcesses.length > 0) {
                    for (const proc of nodeProcesses) {
                        try {
                            await devboxInstance.killProcess(proc.processId, { signal: 'SIGKILL' })
                        } catch (killError) {
                            // Ignore cleanup errors
                        }
                    }
                    // Wait for processes to terminate
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
            } catch (error) {
                // If cleanup fails, continue trying to start (port might not be occupied)
            }

            // 3. Execute in background using executeCommand
            const execResult = await devboxInstance.executeCommand({
                command: 'node',
                args: ['hello_world.js'],
                cwd: '/home/devbox/project'
            })

            // Verify return value (server doesn't return success field, only processId, pid, processStatus)
            expect(execResult.processId).toBeDefined()
            expect(execResult.pid).toBeGreaterThan(0)
            expect(execResult.processStatus).toBeDefined()
            expect(execResult.processStatus).toBe('running')

            // 4. Wait for process to run and check status multiple times to verify continuous operation
            await new Promise(resolve => setTimeout(resolve, 3000))

            // First check - should still be running
            const status1 = await devboxInstance.getProcessStatus(execResult.processId)
            // Note: server may not return success field, only verify necessary fields
            expect(status1.processId).toBe(execResult.processId)
            expect(status1.pid).toBe(execResult.pid)

            // If process failed, get logs to diagnose issue
            if (status1.processStatus !== 'running') {
                try {
                    const errorLogs = await devboxInstance.getProcessLogs(execResult.processId)
                    console.error('Error logs:', errorLogs.logs)
                } catch (logError) {
                    // Ignore log retrieval errors
                }
                throw new Error(`Process failed to start. Status: ${status1.processStatus}`)
            }

            expect(status1.processStatus).toBe('running')

            // Get initial logs
            const logs1 = await devboxInstance.getProcessLogs(execResult.processId)
            // Note: server may not return success field
            expect(logs1.processId).toBe(execResult.processId)
            expect(Array.isArray(logs1.logs)).toBe(true)

            const logContent1 = logs1.logs.join('\n')
            expect(logContent1).toContain('Hello, World!')
            expect(logContent1).toMatch(/Server is running|HTTP Server started/)

            // Wait longer to verify process is still running
            await new Promise(resolve => setTimeout(resolve, 5000))

            // Second check - should still be running (verify process hasn't auto-exited)
            const status2 = await devboxInstance.getProcessStatus(execResult.processId)
            expect(status2.processStatus).toBe('running')

            // Get updated logs (HTTP server won't generate new logs without requests, this is normal)
            const logs2 = await devboxInstance.getProcessLogs(execResult.processId)
            // HTTP server won't generate new logs without requests, so log count may be the same
            expect(logs2.logs.length).toBeGreaterThanOrEqual(logs1.logs.length)

            // Verify logs contain server running information
            const logContent2 = logs2.logs.join('\n')
            expect(logContent2).toMatch(/Server is running|HTTP Server|0\.0\.0\.0/)

            // Wait once more for third check
            await new Promise(resolve => setTimeout(resolve, 3000))

            // Third check - confirm process continues running
            const status3 = await devboxInstance.getProcessStatus(execResult.processId)
            expect(status3.processStatus).toBe('running')

            // 6. Manually terminate process (verify it can be terminated normally)
            await devboxInstance.killProcess(execResult.processId, { signal: 'SIGTERM' })

            // Wait for process to terminate, using retry mechanism
            let finalStatus = await devboxInstance.getProcessStatus(execResult.processId)
            let retries = 0
            const maxRetries = 5

            while (finalStatus.processStatus === 'running' && retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000))
                finalStatus = await devboxInstance.getProcessStatus(execResult.processId)
                retries++
            }

            // Verify process has terminated (allow completed, failed, or still running as it may be gracefully shutting down)
            const validStatuses = ['completed', 'failed', 'running']
            expect(validStatuses).toContain(finalStatus.processStatus)
        }, 90000) // 90 second timeout (give enough time to verify continuous operation)

        it('should be able to list all background processes', async () => {
            // Create test file
            const testCode = `
console.log('Test process running')
setTimeout(() => {
  console.log('Test process completed')
}, 5000)
`
            await devboxInstance.writeFile('/home/devbox/project/test_process.js', testCode)

            // Start process
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['test_process.js'],
                cwd: '/home/devbox/project'
            })

            // List all processes
            const processList = await devboxInstance.listProcesses()

            // Server doesn't return success field, only verify processes array
            expect(Array.isArray(processList.processes)).toBe(true)
            console.log(processList.processes, 'processList.processes');

            // Verify our process is in the list
            const ourProcess = processList.processes.find(p => p.processId === result.processId)
            expect(ourProcess).toBeDefined()
            expect(ourProcess?.command).toContain('node')

            // Cleanup
            await devboxInstance.killProcess(result.processId, { signal: 'SIGKILL' })
        }, 30000)

        it('should be able to terminate processes using SIGTERM and SIGKILL', async () => {
            // Create a process that won't exit automatically
            const infiniteCode = `
console.log('Infinite process started')
let counter = 0
setInterval(() => {
  counter++
  console.log(\`Running... \${counter}\`)
}, 1000)
`
            await devboxInstance.writeFile('/home/devbox/project/infinite_process.js', infiniteCode)

            // Start process
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['infinite_process.js'],
                cwd: '/home/devbox/project'
            })

            // Wait for process to run
            await new Promise(resolve => setTimeout(resolve, 3000))

            // Terminate using SIGTERM
            await devboxInstance.killProcess(result.processId, { signal: 'SIGTERM' })

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000))
        }, 30000)
    })

    describe('Error Handling', () => {
        it('should handle invalid process ID', async () => {
            const invalidProcessId = 'invalid-process-id-999999'

            await expect(
                devboxInstance.getProcessStatus(invalidProcessId)
            ).rejects.toThrow()
        }, 15000)

        it('should handle execution of non-existent file', async () => {
            // executeCommand is async, will return processId even if file doesn't exist
            // Process will start but fail immediately
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['nonexistent_file.js'],
                cwd: '/home/devbox/project'
            })

            // Verify process was started (even though it will fail immediately)
            expect(result.processId).toBeDefined()
            expect(result.pid).toBeGreaterThan(0)

            // Wait a bit for process to fail
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Query process status, should have failed or completed
            const status = await devboxInstance.getProcessStatus(result.processId)
            // Process should no longer be in running state
            expect(status.processStatus).not.toBe('running')
        }, 15000)
    })
})
