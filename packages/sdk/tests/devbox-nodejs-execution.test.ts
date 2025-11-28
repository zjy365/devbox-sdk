/**
 * Devbox SDK Node.js 代码执行测试
 * 
 * 测试目的：
 * 验证在 Devbox 中执行实际 Node.js 代码文件的能力，包括：
 * 1. 创建并执行 Node.js 文件
 * 2. 后台运行长时间进程
 * 3. 并发执行多个进程
 * 4. SIGKILL 强制终止
 * 5. 实时日志监控
 * 
 * 与 devbox-process.test.ts 的区别：
 * - devbox-process.test.ts: 测试进程管理 API 的基础功能
 * - 本文件: 测试实际 Node.js 应用场景和复杂工作流
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'

describe('Devbox SDK Node.js 代码执行测试', () => {
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

    describe('Node.js 文件执行', () => {
        it('应该能够创建并执行简单的 Node.js 文件', async () => {
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

            // 等待执行完成
            await new Promise(resolve => setTimeout(resolve, 2000))

            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('Hello from Node.js!')
            expect(logContent).toContain('Process ID:')
            expect(logContent).toContain('Node version:')
        }, 30000)

        it('应该能够执行带有异步操作的 Node.js 文件', async () => {
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

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 3000))

            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('Start')
            expect(logContent).toContain('After 1 second')
            expect(logContent).toContain('After 2 seconds')
            expect(logContent).toContain('Done')
        }, 30000)

        it('应该能够执行使用环境变量的 Node.js 文件', async () => {
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

    describe('长时间运行的后台进程', () => {
        it('应该能够运行持续输出的后台进程', async () => {
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

            // 等待一些输出
            await new Promise(resolve => setTimeout(resolve, 3000))

            // 检查进程状态
            const status = await devboxInstance.getProcessStatus(result.processId)
            console.log(`Process status: ${status.processStatus}`)

            // 获取日志
            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('Long running process started')
            expect(logContent).toContain('Tick')

            // 清理：如果进程还在运行，终止它
            if (status.processStatus === 'running') {
                await devboxInstance.killProcess(result.processId)
            }
        }, 30000)

        it('应该能够监控后台进程的实时状态', async () => {
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

            // 多次检查状态
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

    describe('并发进程执行', () => {
        it('应该能够同时运行多个 Node.js 进程', async () => {
            // 创建3个不同的脚本
            const script1 = `console.log('Script 1 running'); setTimeout(() => console.log('Script 1 done'), 2000)`
            const script2 = `console.log('Script 2 running'); setTimeout(() => console.log('Script 2 done'), 2000)`
            const script3 = `console.log('Script 3 running'); setTimeout(() => console.log('Script 3 done'), 2000)`

            await devboxInstance.writeFile('/home/devbox/project/script1.js', script1)
            await devboxInstance.writeFile('/home/devbox/project/script2.js', script2)
            await devboxInstance.writeFile('/home/devbox/project/script3.js', script3)

            // 并发启动所有进程
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

            // 验证所有进程都在运行
            await new Promise(resolve => setTimeout(resolve, 1000))

            const processList = await devboxInstance.listProcesses()
            const ourProcesses = processList.processes.filter(p =>
                results.some(r => r.processId === p.processId)
            )

            console.log(`Found ${ourProcesses.length} of our processes in the list`)
            expect(ourProcesses.length).toBeGreaterThan(0)

            // 等待所有进程完成
            await new Promise(resolve => setTimeout(resolve, 3000))

            // 验证日志
            for (const result of results) {
                const logs = await devboxInstance.getProcessLogs(result.processId)
                expect(logs.logs.length).toBeGreaterThan(0)
            }
        }, 45000)
    })

    describe('进程终止测试', () => {
        it('应该能够使用 SIGKILL 强制终止进程', async () => {
            const infiniteCode = `
console.log('Infinite loop started')
let counter = 0

// 忽略 SIGTERM
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

            // 等待进程运行
            await new Promise(resolve => setTimeout(resolve, 3000))

            // 使用 SIGKILL 强制终止
            console.log('Sending SIGKILL...')
            await devboxInstance.killProcess(result.processId, { signal: 'SIGKILL' })

            await new Promise(resolve => setTimeout(resolve, 1000))

            const status = await devboxInstance.getProcessStatus(result.processId)
            console.log(`Process status after SIGKILL: ${status.processStatus}`)

            // 验证进程已终止
            expect(status.processStatus).not.toBe('running')
        }, 30000)

        it('应该能够在进程列表中找到并终止特定进程', async () => {
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

            // 在进程列表中找到这个进程
            const processList = await devboxInstance.listProcesses()
            const ourProcess = processList.processes.find(p => p.processId === result.processId)

            expect(ourProcess).toBeDefined()
            console.log(`Found process in list: ${ourProcess?.processId}`)

            // 终止它
            await devboxInstance.killProcess(result.processId, { signal: 'SIGTERM' })

            await new Promise(resolve => setTimeout(resolve, 1000))

            const finalStatus = await devboxInstance.getProcessStatus(result.processId)
            console.log(`Final status: ${finalStatus.processStatus}`)
        }, 30000)
    })

    describe('错误处理和边缘情况', () => {
        it('应该处理 Node.js 运行时错误', async () => {
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

            // 进程会启动但会立即失败
            expect(result.processId).toBeDefined()

            await new Promise(resolve => setTimeout(resolve, 2000))

            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            expect(logContent).toContain('About to throw an error')
            expect(logContent).toContain('Error: Intentional error')
        }, 30000)

        it('应该处理不存在的 Node.js 文件', async () => {
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['nonexistent_file_12345.js'],
                cwd: '/home/devbox/project'
            })

            // executeCommand 是异步的，会返回 processId
            expect(result.processId).toBeDefined()

            await new Promise(resolve => setTimeout(resolve, 2000))

            // 但进程会失败
            const logs = await devboxInstance.getProcessLogs(result.processId)
            const logContent = logs.logs.join('\n')

            // 应该包含错误信息
            expect(logContent).toContain('Cannot find module')
        }, 30000)

        it('应该处理进程崩溃', async () => {
            const crashCode = `
console.log('Process starting')
setTimeout(() => {
  console.log('About to crash')
  process.exit(1)  // 非零退出码
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
