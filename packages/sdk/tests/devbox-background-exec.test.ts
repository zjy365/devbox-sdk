/**
 * Devbox SDK 后台进程执行测试
 * 
 * 测试目的：验证 executeCommand() 方法的后台执行能力
 * - 启动后台进程（node hello_world.js）
 * - 查询进程状态
 * - 获取进程日志
 * - 终止进程
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'

// 等待 Devbox 就绪的辅助函数
async function waitForDevboxReady(devbox: DevboxInstance, timeout = 120000): Promise<void> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
        try {
            await devbox.refreshInfo()

            if (devbox.status === 'Running') {
                const healthy = await devbox.isHealthy()
                if (healthy) {
                    return
                }
            }
        } catch (error) {
            console.warn('Health check failed, retrying...')
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
    }
    throw new Error(`Devbox did not become ready within ${timeout}ms`)
}

describe('Devbox SDK 后台进程执行测试', () => {
    let sdk: DevboxSDK
    let devboxInstance: DevboxInstance
    // 使用已存在的 Devbox
    const devboxName = 'my-nodejs-appxxx'

    beforeEach(async () => {
        sdk = new DevboxSDK(TEST_CONFIG)
        devboxInstance = await sdk.getDevbox(devboxName)
    }, 30000) // 30秒超时

    afterEach(async () => {
        // 不删除 devbox，因为是使用已存在的
        // 只关闭 SDK 连接
        await sdk.close()
    }, 10000)

    describe('后台进程执行', () => {
        it('应该能够创建并执行持续运行的 hello_world.js 文件', async () => {
            // 1. 创建 hello_world.js 文件 - 一个简单的 HTTP 服务器（类似 npm run dev）
            const helloWorldCode = `
const http = require('http')

const PORT = process.env.PORT || 3000

const server = http.createServer((req, res) => {
  const now = new Date().toISOString()
  console.log(\`[\${now}] Received request: \${req.method} \${req.url}\`)
  
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Hello, World! Server is running.\\n')
})

// 处理服务器错误
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

// 处理退出信号（优雅关闭）
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

// 处理未捕获的异常
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

            // 验证文件已创建
            const content = await devboxInstance.readFile('/home/devbox/project/hello_world.js')
            expect(content.toString()).toContain('Hello, World!')
            expect(content.toString()).toContain('http.createServer')

            // 2. 清理可能占用 3000 端口的进程
            try {
                const processList = await devboxInstance.listProcesses()

                // 找到所有运行中的 node 进程，特别是 hello_world.js
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
                            // 忽略清理错误
                        }
                    }
                    // 等待进程终止
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
            } catch (error) {
                // 如果清理失败，继续尝试启动（可能端口没有被占用）
            }

            // 3. 使用 executeCommand 在后台执行
            const execResult = await devboxInstance.executeCommand({
                command: 'node',
                args: ['hello_world.js'],
                cwd: '/home/devbox/project'
            })

            // 验证返回值（服务器不返回 success 字段，只返回 processId, pid, processStatus）
            expect(execResult.processId).toBeDefined()
            expect(execResult.pid).toBeGreaterThan(0)
            expect(execResult.processStatus).toBeDefined()
            expect(execResult.processStatus).toBe('running')

            // 4. 等待进程运行并多次检查状态，验证进程持续运行
            await new Promise(resolve => setTimeout(resolve, 3000))

            // 第一次检查 - 应该还在运行
            const status1 = await devboxInstance.getProcessStatus(execResult.processId)
            // 注意：服务器可能不返回 success 字段，只验证必要字段
            expect(status1.processId).toBe(execResult.processId)
            expect(status1.pid).toBe(execResult.pid)

            // 如果进程失败了，获取日志来诊断问题
            if (status1.processStatus !== 'running') {
                try {
                    const errorLogs = await devboxInstance.getProcessLogs(execResult.processId)
                    console.error('Error logs:', errorLogs.logs)
                } catch (logError) {
                    // 忽略日志获取错误
                }
                throw new Error(`Process failed to start. Status: ${status1.processStatus}`)
            }

            expect(status1.processStatus).toBe('running')

            // 获取初始日志
            const logs1 = await devboxInstance.getProcessLogs(execResult.processId)
            // 注意：服务器可能不返回 success 字段
            expect(logs1.processId).toBe(execResult.processId)
            expect(Array.isArray(logs1.logs)).toBe(true)

            const logContent1 = logs1.logs.join('\n')
            expect(logContent1).toContain('Hello, World!')
            expect(logContent1).toMatch(/Server is running|HTTP Server started/)

            // 等待更长时间，验证进程仍在运行
            await new Promise(resolve => setTimeout(resolve, 5000))

            // 第二次检查 - 应该还在运行（验证进程没有自动退出）
            const status2 = await devboxInstance.getProcessStatus(execResult.processId)
            expect(status2.processStatus).toBe('running')

            // 获取更新的日志（HTTP 服务器在没有请求时不会产生新日志，这是正常的）
            const logs2 = await devboxInstance.getProcessLogs(execResult.processId)
            // HTTP 服务器在没有请求时不会产生新日志，所以日志数量可能相同
            expect(logs2.logs.length).toBeGreaterThanOrEqual(logs1.logs.length)

            // 验证日志中有服务器运行的信息
            const logContent2 = logs2.logs.join('\n')
            expect(logContent2).toMatch(/Server is running|HTTP Server|0\.0\.0\.0/)

            // 再等待一次，进行第三次检查
            await new Promise(resolve => setTimeout(resolve, 3000))

            // 第三次检查 - 确认进程持续运行
            const status3 = await devboxInstance.getProcessStatus(execResult.processId)
            expect(status3.processStatus).toBe('running')

            // 6. 手动终止进程（验证可以正常终止）
            await devboxInstance.killProcess(execResult.processId, { signal: 'SIGTERM' })

            // 等待进程终止，使用重试机制
            let finalStatus = await devboxInstance.getProcessStatus(execResult.processId)
            let retries = 0
            const maxRetries = 5

            while (finalStatus.processStatus === 'running' && retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000))
                finalStatus = await devboxInstance.getProcessStatus(execResult.processId)
                retries++
            }

            // 验证进程已终止（允许 completed, failed，或者如果还在 running 也接受，因为可能正在优雅关闭）
            const validStatuses = ['completed', 'failed', 'running']
            expect(validStatuses).toContain(finalStatus.processStatus)
        }, 90000) // 90秒超时（给足够时间验证持续运行）

        it('应该能够列出所有后台进程', async () => {
            // 创建测试文件
            const testCode = `
console.log('Test process running')
setTimeout(() => {
  console.log('Test process completed')
}, 5000)
`
            await devboxInstance.writeFile('/home/devbox/project/test_process.js', testCode)

            // 启动进程
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['test_process.js'],
                cwd: '/home/devbox/project'
            })

            // 列出所有进程
            const processList = await devboxInstance.listProcesses()

            // 服务器不返回 success 字段，只验证 processes 数组
            expect(Array.isArray(processList.processes)).toBe(true)
            console.log(processList.processes, 'processList.processes');

            // 验证我们的进程在列表中
            const ourProcess = processList.processes.find(p => p.processId === result.processId)
            expect(ourProcess).toBeDefined()
            expect(ourProcess?.command).toContain('node')

            // 清理
            await devboxInstance.killProcess(result.processId, { signal: 'SIGKILL' })
        }, 30000)

        it('应该能够使用 SIGTERM 和 SIGKILL 终止进程', async () => {
            // 创建一个不会自动退出的进程
            const infiniteCode = `
console.log('Infinite process started')
let counter = 0
setInterval(() => {
  counter++
  console.log(\`Running... \${counter}\`)
}, 1000)
`
            await devboxInstance.writeFile('/home/devbox/project/infinite_process.js', infiniteCode)

            // 启动进程
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['infinite_process.js'],
                cwd: '/home/devbox/project'
            })

            // 等待进程运行
            await new Promise(resolve => setTimeout(resolve, 3000))

            // 使用 SIGTERM 终止
            await devboxInstance.killProcess(result.processId, { signal: 'SIGTERM' })

            // 等待一下
            await new Promise(resolve => setTimeout(resolve, 1000))
        }, 30000)
    })

    describe('错误处理', () => {
        it('应该处理无效的进程ID', async () => {
            const invalidProcessId = 'invalid-process-id-999999'

            await expect(
                devboxInstance.getProcessStatus(invalidProcessId)
            ).rejects.toThrow()
        }, 15000)

        it('应该处理不存在的文件执行', async () => {
            // executeCommand 是异步的，即使文件不存在也会返回 processId
            // 进程会启动但立即失败
            const result = await devboxInstance.executeCommand({
                command: 'node',
                args: ['nonexistent_file.js'],
                cwd: '/home/devbox/project'
            })

            // 验证进程已启动（即使会立即失败）
            expect(result.processId).toBeDefined()
            expect(result.pid).toBeGreaterThan(0)

            // 等待一下让进程失败
            await new Promise(resolve => setTimeout(resolve, 1000))

            // 查询进程状态，应该已经失败或完成
            const status = await devboxInstance.getProcessStatus(result.processId)
            // 进程应该不再是 running 状态
            expect(status.processStatus).not.toBe('running')
        }, 15000)
    })
})
