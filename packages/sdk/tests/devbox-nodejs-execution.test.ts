/**
 * Devbox SDK Node.js Code Execution Tests
 *
 * Test Purpose:
 * Validate the ability to execute actual Node.js code files in Devbox, including:
 * 1. Create and execute Node.js files
 * 2. Run long-running processes in background
 * 3. Execute multiple processes concurrently
 * 4. Force termination with SIGKILL
 * 5. Real-time log monitoring
 *
 * Difference from devbox-process.test.ts:
 * - devbox-process.test.ts: Tests basic process management API functionality
 * - This file: Tests actual Node.js application scenarios and complex workflows
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'

describe('Devbox SDK Node.js Code Execution Tests', () => {
    let sdk: DevboxSDK
    let devboxInstance: DevboxInstance
    const devboxName = 'my-nodejs-appxxx'

    beforeEach(async () => {
        sdk = new DevboxSDK(TEST_CONFIG)
        devboxInstance = await sdk.getDevbox(devboxName)
        console.log(`✅ Using devbox: ${devboxInstance.name}`)
    }, 30000)

    afterEach(async () => {
        await sdk.close()
    }, 10000)

    describe('Node.js File Execution', () => {
        it('should create and execute simple Node.js file', async () => {
            const simpleCode = `
console.log('Hello from Node.js!')
console.log('Process ID:', process.pid)
console.log('Node version:', process.version)
`

            await devboxInstance.writeFile('/home/devbox/project/simple.js', simpleCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['simple.js'],
                cwd: '/home/devbox/project'
            })

            expect(result.processId).toBeDefined()
            expect(result.pid).toBeGreaterThan(0)

            // Wait for execution to complete
            await new Promise(resolve => setTimeout(resolve, 2000))

            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('Hello from Node.js!')
            expect(logContent).toContain('Process ID:')
            expect(logContent).toContain('Node version:')
        }, 30000)

        it('should execute Node.js file with async operations', async () => {
            const asyncCode = `
async function main() {
  console.log('Start')
  await new Promise(resolve => setTimeout(resolve, 1000))
  console.log('After 1 second')
  await new Promise(resolve => setTimeout(resolve, 1000))
  console.log('After 2 seconds')
  console.log('Done')
}

main().catch(console.error)
`

            await devboxInstance.writeFile('/home/devbox/project/async.js', asyncCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['async.js'],
                cwd: '/home/devbox/project'
            })

            expect(result.processId).toBeDefined()

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 3000))

            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('Start')
            expect(logContent).toContain('After 1 second')
            expect(logContent).toContain('After 2 seconds')
            expect(logContent).toContain('Done')
        }, 30000)

        it('should execute Node.js file with environment variables', async () => {
            const envCode = `
console.log('APP_NAME:', process.env.APP_NAME)
console.log('APP_VERSION:', process.env.APP_VERSION)
console.log('NODE_ENV:', process.env.NODE_ENV)
`

            await devboxInstance.writeFile('/home/devbox/project/env_test.js', envCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['env_test.js'],
                cwd: '/home/devbox/project',
                env: {
                    APP_NAME: 'TestApp',
                    APP_VERSION: '1.0.0',
                    NODE_ENV: 'production'
                }
            })

            await new Promise(resolve => setTimeout(resolve, 2000))

            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('APP_NAME: TestApp')
            expect(logContent).toContain('APP_VERSION: 1.0.0')
            expect(logContent).toContain('NODE_ENV: production')
        }, 30000)
    })

    describe('Long-running Background Processes', () => {
        it('should run background process with continuous output', async () => {
            const longRunningCode = `
let counter = 0
const interval = setInterval(() => {
  counter++
  console.log(\`Tick \${counter}\`)
  
  if (counter >= 5) {
    console.log('Stopping...')
    clearInterval(interval)
    process.exit(0)
  }
}, 1000)

console.log('Long running process started')
`

            await devboxInstance.writeFile('/home/devbox/project/long_running.js', longRunningCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['long_running.js'],
                cwd: '/home/devbox/project'
            })

            console.log(`Started long running process: ${result.processId}`)

            // Wait for some output
            await new Promise(resolve => setTimeout(resolve, 3000))

            // Check process status
            const status = await devboxInstance.getProcessStatus(result.processId)
            console.log(`Process status: ${status.processStatus}`)

            // Get logs
            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('Long running process started')
            expect(logContent).toContain('Tick')

            // Cleanup: terminate process if still running
            if (status.processStatus === 'running') {
                await devboxInstance.killProcess(result.processId)
            }
        }, 30000)

        it('should monitor background process real-time status', async () => {
            const monitorCode = `
console.log('Process started at:', new Date().toISOString())

let count = 0
const interval = setInterval(() => {
  count++
  console.log(\`Status check \${count} at \${new Date().toISOString()}\`)
  
  if (count >= 3) {
    clearInterval(interval)
    console.log('Process completed')
    process.exit(0)
  }
}, 2000)
`

            await devboxInstance.writeFile('/home/devbox/project/monitor.js', monitorCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['monitor.js'],
                cwd: '/home/devbox/project'
            })

            // Check status multiple times
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000))

                const status = await devboxInstance.getProcessStatus(result.processId)
                console.log(`Check ${i + 1}: Process ${result.processId} is ${status.processStatus}`)

                const logs = await devboxInstance.getProcessLogs(result.processId)
                console.log(`Logs so far: ${logs.logs.length} lines`)
            }

            const finalLogs = await devboxInstance.getProcessLogs(result.processId)
            expect(finalLogs.logs.length).toBeGreaterThan(0)
        }, 30000)
    })

    describe('Concurrent Process Execution', () => {
        it('should run multiple Node.js processes concurrently', async () => {
            // Create 3 different scripts
            const script1 = `console.log('Script 1 running'); setTimeout(() => console.log('Script 1 done'), 2000)`
            const script2 = `console.log('Script 2 running'); setTimeout(() => console.log('Script 2 done'), 2000)`
            const script3 = `console.log('Script 3 running'); setTimeout(() => console.log('Script 3 done'), 2000)`

            await devboxInstance.writeFile('/home/devbox/project/script1.js', script1)
            await devboxInstance.writeFile('/home/devbox/project/script2.js', script2)
            await devboxInstance.writeFile('/home/devbox/project/script3.js', script3)

            // Start all processes concurrently
            const results = await Promise.all([
                devboxInstance.executeCommand({
                    command: 'node',
                    args: ['script1.js'],
                    cwd: '/home/devbox/project'
                }),
                devboxInstance.executeCommand({
                    command: 'node',
                    args: ['script2.js'],
                    cwd: '/home/devbox/project'
                }),
                devboxInstance.executeCommand({
                    command: 'node',
                    args: ['script3.js'],
                    cwd: '/home/devbox/project'
                })
            ])

            expect(results).toHaveLength(3)
            results.forEach((result, index) => {
                expect(result.processId).toBeDefined()
                console.log(`Process ${index + 1}: ${result.processId}`)
            })

            // Verify all processes are running
            await new Promise(resolve => setTimeout(resolve, 1000))

            const processList = await devboxInstance.listProcesses()
            const ourProcesses = processList.processes.filter(p =>
                results.some(r => r.processId === p.processId)
            )

            console.log(`Found ${ourProcesses.length} of our processes in the list`)
            expect(ourProcesses.length).toBeGreaterThan(0)

            // Wait for all processes to complete
            await new Promise(resolve => setTimeout(resolve, 3000))

            // Verify logs
            for (const result of results) {
                const logs = await devboxInstance.getProcessLogs(result.processId)
                expect(logs.logs.length).toBeGreaterThan(0)
            }
        }, 45000)
    })

    describe('Process Termination Tests', () => {
        it('should forcefully terminate process with SIGKILL', async () => {
            const infiniteCode = `
console.log('Infinite loop started')
let counter = 0

// Ignore SIGTERM
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, but ignoring it')
})

setInterval(() => {
  counter++
  console.log(\`Still running... \${counter}\`)
}, 1000)
`

            await devboxInstance.writeFile('/home/devbox/project/infinite.js', infiniteCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['infinite.js'],
                cwd: '/home/devbox/project'
            })

            console.log(`Started infinite process: ${result.processId}`)

            // Wait for process to run
            await new Promise(resolve => setTimeout(resolve, 3000))

            // Force terminate with SIGKILL
            console.log('Sending SIGKILL...')
            await devboxInstance.killProcess(result.processId, { signal: 'SIGKILL' })

            await new Promise(resolve => setTimeout(resolve, 1000))

            const status = await devboxInstance.getProcessStatus(result.processId)
            console.log(`Process status after SIGKILL: ${status.processStatus}`)

            // Verify process is terminated
            expect(status.processStatus).not.toBe('running')
        }, 30000)

        it('should find and terminate specific process in process list', async () => {
            const testCode = `
console.log('Test process for list and kill')
setInterval(() => {
  console.log('Heartbeat')
}, 1000)
`

            await devboxInstance.writeFile('/home/devbox/project/test_list_kill.js', testCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['test_list_kill.js'],
                cwd: '/home/devbox/project'
            })

            await new Promise(resolve => setTimeout(resolve, 2000))

            // Find this process in the process list
            const processList = await devboxInstance.listProcesses()
            const ourProcess = processList.processes.find(p => p.processId === result.processId)

            expect(ourProcess).toBeDefined()
            console.log(`Found process in list: ${ourProcess?.processId}`)

            // Terminate it
            await devboxInstance.killProcess(result.processId, { signal: 'SIGTERM' })

            await new Promise(resolve => setTimeout(resolve, 1000))

            const finalStatus = await devboxInstance.getProcessStatus(result.processId)
            console.log(`Final status: ${finalStatus.processStatus}`)
        }, 30000)
    })

    describe('Error Handling and Edge Cases', () => {
        it('should handle Node.js runtime errors', async () => {
            const errorCode = `
console.log('About to throw an error')
throw new Error('Intentional error for testing')
`

            await devboxInstance.writeFile('/home/devbox/project/error.js', errorCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['error.js'],
                cwd: '/home/devbox/project'
            })

            // Process will start but fail immediately
            expect(result.processId).toBeDefined()

            await new Promise(resolve => setTimeout(resolve, 2000))

            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('About to throw an error')
            expect(logContent).toContain('Error: Intentional error')
        }, 30000)

        it('should handle non-existent Node.js files', async () => {
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['nonexistent_file_12345.js'],
                cwd: '/home/devbox/project'
            })

            // executeCommand is async, will return processId
            expect(result.processId).toBeDefined()

            await new Promise(resolve => setTimeout(resolve, 2000))

            // But process will fail
            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            // Should contain error message
            expect(logContent).toContain('Cannot find module')
        }, 30000)

        it('should handle process crashes', async () => {
            const crashCode = `
console.log('Process starting')
setTimeout(() => {
  console.log('About to crash')
  process.exit(1)  // Non-zero exit code
}, 1000)
`

            await devboxInstance.writeFile('/home/devbox/project/crash.js', crashCode)

            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['crash.js'],
                cwd: '/home/devbox/project'
            })

            await new Promise(resolve => setTimeout(resolve, 2000))

            const status = await devboxInstance.getProcessStatus(result.processId)
            const logs = await devboxInstance.getProcessLogs(result.processId)

            console.log(`Process status: ${status.processStatus}`)
            console.log(`Logs: ${logs.logs.join('\n')}`)

            expect(logs.logs.join('\n')).toContain('About to crash')
        }, 30000)
    })
})
