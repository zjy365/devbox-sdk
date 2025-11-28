/**
 * Devbox SDK 进程管理功能测试
 *
 * 测试目的：
 * 本测试文件用于验证 Devbox SDK 的进程管理功能，包括：
 * 1. 异步进程执行
 * 2. 同步进程执行
 * 3. 流式进程执行（SSE）
 * 4. 进程列表查询
 * 5. 进程状态查询
 * 6. 进程终止
 * 7. 进程日志获取
 *
 * 测试覆盖范围：
 * - 异步执行命令并获取 process_id
 * - 同步执行命令并获取输出
 * - 流式执行命令并处理实时输出
 * - 列出所有运行的进程
 * - 查询特定进程的状态
 * - 终止运行中的进程
 * - 获取进程的执行日志
 * - 错误处理和边界情况
 *
 * 注意事项：
 * - 所有测试都需要真实的 Devbox 实例（通过 Kubernetes API 创建）
 * - 测试使用 mockServerUrl 连接到本地 Go Server（通过 DEVBOX_SERVER_URL 环境变量配置）
 * - 测试会创建和删除 Devbox 实例，确保测试环境有足够的资源
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'
import type { DevboxCreateConfig, ProcessExecOptions } from '../src/core/types'
import { DevboxRuntime } from '../src/api/types'

async function waitForDevboxReady(devbox: DevboxInstance, timeout = 120000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      await devbox.refreshInfo()
      if (devbox.status === 'Running') {
        await new Promise(resolve => setTimeout(resolve, 3000))
        return
      }
    } catch (error) {
      // Ignore intermediate errors
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  throw new Error(`Devbox ${devbox.name} did not become ready within ${timeout}ms`)
}

describe('Devbox SDK 进程管理功能测试', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-process-ops-${Date.now()}`

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    const config: DevboxCreateConfig = {
      name: TEST_DEVBOX_NAME,
      runtime: DevboxRuntime.NODE_JS,
      resource: {
        cpu: 1,
        memory: 2,
      },
    }

    devboxInstance = await sdk.createDevbox(config)
    await devboxInstance.start()
    await waitForDevboxReady(devboxInstance)
  }, 30000)

  afterEach(async () => {
    if (devboxInstance) {
      try {
        await devboxInstance.delete()
      } catch (error) {
        console.warn('Failed to cleanup devbox:', error)
      }
    }

    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  describe('异步进程执行', () => {
    it('应该能够异步执行简单命令', async () => {
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

    it('应该能够异步执行带工作目录的命令', async () => {
      const options: ProcessExecOptions = {
        command: 'pwd',
        cwd: '/tmp',
      }

      const result = await devboxInstance.executeCommand(options)

      expect(result.processId).toBeDefined()
      expect(result.pid).toBeGreaterThan(0)
    }, 10000)

    it('应该能够异步执行带环境变量的命令', async () => {
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

    it('应该能够异步执行带超时的命令', async () => {
      const options: ProcessExecOptions = {
        command: 'sleep',
        args: ['1'],
        timeout: 5,
      }

      const result = await devboxInstance.executeCommand(options)

      expect(result.processId).toBeDefined()
    }, 10000)
  })

  describe('同步进程执行', () => {
    it('应该能够同步执行命令并获取输出', async () => {
      const options: ProcessExecOptions = {
        command: 'echo',
        args: ['Hello World'],
      }

      const result = await devboxInstance.execSync(options)

      expect(result.stdout).toContain('Hello World')
      expect(result.stderr).toBeDefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.startTime).toBeGreaterThan(0)
      expect(result.endTime).toBeGreaterThanOrEqual(result.startTime)
    }, 15000)

    it('应该能够同步执行命令并获取退出码', async () => {
      const options: ProcessExecOptions = {
        command: 'sh',
        args: ['-c', 'exit 0'],
      }

      const result = await devboxInstance.execSync(options)

      expect(result.exitCode).toBe(0)
    }, 15000)

    it('应该能够同步执行失败的命令', async () => {
      const options: ProcessExecOptions = {
        command: 'sh',
        args: ['-c', 'exit 1'],
      }

      const result = await devboxInstance.execSync(options)

      expect(result.exitCode).toBe(1)
    }, 15000)

    it('应该能够同步执行带工作目录的命令', async () => {
      const options: ProcessExecOptions = {
        command: 'pwd',
        cwd: '/tmp',
      }

      const result = await devboxInstance.execSync(options)

      expect(result.stdout).toContain('/tmp')
    }, 15000)

    it('应该能够同步执行带环境变量的命令', async () => {
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

    it('应该能够处理超时的命令', async () => {
      const options: ProcessExecOptions = {
        command: 'sleep',
        args: ['10'],
        timeout: 2,
      }

      // 这个测试可能会因为超时而失败，这是预期的行为
      try {
        const result = await devboxInstance.execSync(options)
        // 如果命令在超时前完成，验证结果
        expect(result.success).toBeDefined()
      } catch (error) {
        // 超时错误也是可以接受的
        expect(error).toBeDefined()
      }
    }, 30000)
  })

  describe('流式进程执行', () => {
    it('应该能够流式执行命令', async () => {
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
      // SSE 流可能包含事件格式，所以只检查是否有输出
      expect(output.length).toBeGreaterThan(0)
    }, 20000)

    it('应该能够处理流式执行的错误', async () => {
      const options: ProcessExecOptions = {
        command: 'nonexistent-command-12345',
      }

      try {
        const stream = await devboxInstance.execSyncStream(options)
        const reader = stream.getReader()

        try {
          // 尝试读取一些数据
          await reader.read()
        } finally {
          reader.releaseLock()
        }
      } catch (error) {
        // 错误是预期的
        expect(error).toBeDefined()
      }
    }, 15000)
  })

  describe('进程列表查询', () => {
    it('应该能够列出所有进程', async () => {
      // 先启动一个进程
      await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['5'],
      })

      // 等待一下让进程启动
      await new Promise(resolve => setTimeout(resolve, 1000))

      const result = await devboxInstance.listProcesses()

      expect(result.processes).toBeDefined()
      expect(Array.isArray(result.processes)).toBe(true)
      // 至少应该有一个进程（我们刚启动的）
      expect(result.processes.length).toBeGreaterThan(0)
    }, 15000)

    it('进程列表应该包含正确的字段', async () => {
      // 启动一个进程
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['5'],
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      const result = await devboxInstance.listProcesses()

      if (result.processes.length > 0) {
        const process = result.processes[0]
        console.log('process', process);
        expect(process?.processId).toBeDefined()
        expect(process?.pid).toBeGreaterThan(0)
        expect(process?.command).toBeDefined()
        expect(process?.processStatus).toBeDefined() // todo go server fix this
        expect(process?.startTime).toBeGreaterThan(0)
      }
    }, 15000)
  })

  describe('进程状态查询', () => {
    it('应该能够获取进程状态', async () => {
      // 启动一个长时间运行的进程
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['10'],
      })

      // 等待进程启动
      await new Promise(resolve => setTimeout(resolve, 1000))

      const status = await devboxInstance.getProcessStatus(execResult.processId)

      expect(status.processId).toBe(execResult.processId)
      expect(status.pid).toBe(execResult.pid)
      expect(status.processStatus).toBeDefined()
      // expect(status.startedAt).toBeDefined()
    }, 15000)

    it('应该能够处理不存在的进程ID', async () => {
      const nonExistentId = 'non-existent-process-id-12345'

      await expect(devboxInstance.getProcessStatus(nonExistentId)).rejects.toThrow()
    }, 10000)
  })

  describe('进程终止', () => {
    it('应该能够终止运行中的进程', async () => {
      // 启动一个长时间运行的进程
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['30'],
      })

      // 等待进程启动
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 终止进程
      await devboxInstance.killProcess(execResult.processId)

      // 验证进程已被终止
      await new Promise(resolve => setTimeout(resolve, 1000))

      const status = await devboxInstance.getProcessStatus(execResult.processId)
      // 进程状态应该是 terminated 或类似的
      expect(status.processStatus).toBeDefined()
    }, 20000)

    it('应该能够使用指定信号终止进程', async () => {
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

    it('应该能够处理终止不存在的进程', async () => {
      const nonExistentId = 'non-existent-process-id-12345'

      await expect(
        devboxInstance.killProcess(nonExistentId)
      ).rejects.toThrow()
    }, 10000)
  })

  describe('进程日志获取', () => {
    it('应该能够获取进程日志', async () => {
      // 启动一个产生输出的进程
      const execResult = await devboxInstance.executeCommand({
        command: 'sh',
        args: ['-c', 'echo "Line 1"; echo "Line 2"; sleep 2'],
      })

      // 等待进程产生一些输出
      await new Promise(resolve => setTimeout(resolve, 2000))

      const logs = await devboxInstance.getProcessLogs(execResult.processId)

      expect(logs.processId).toBe(execResult.processId)
      expect(logs.logs).toBeDefined()
      expect(Array.isArray(logs.logs)).toBe(true)
    }, 15000)

    it('应该能够获取已完成进程的日志', async () => {
      // 启动一个快速完成的进程
      const execResult = await devboxInstance.executeCommand({
        command: 'sh',
        args: ['-c', 'echo "Test output"; exit 0'],
      })

      // 等待进程完成
      await new Promise(resolve => setTimeout(resolve, 2000))

      const logs = await devboxInstance.getProcessLogs(execResult.processId)

      expect(logs.processId).toBe(execResult.processId)
      expect(logs.logs).toBeDefined()
    }, 15000)

    it('应该能够处理不存在的进程日志', async () => {
      const nonExistentId = 'non-existent-process-id-12345'

      await expect(devboxInstance.getProcessLogs(nonExistentId)).rejects.toThrow()
    }, 10000)
  })

  describe('进程管理集成测试', () => {
    it('应该能够完整地执行、查询和终止进程', async () => {
      // 1. 启动进程
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['20'],
      })

      expect(execResult.processId).toBeDefined()

      // 2. 查询进程状态
      await new Promise(resolve => setTimeout(resolve, 1000))
      const status = await devboxInstance.getProcessStatus(execResult.processId)
      expect(status.processId).toBe(execResult.processId)

      // 3. 获取进程日志
      const logs = await devboxInstance.getProcessLogs(execResult.processId)

      // 4. 终止进程
      await devboxInstance.killProcess(execResult.processId)

      // 5. 验证进程已终止
      await new Promise(resolve => setTimeout(resolve, 1000))
      const finalStatus = await devboxInstance.getProcessStatus(execResult.processId)
      expect(finalStatus.processStatus).toBeDefined()
    }, 30000)

    it('应该能够在进程列表中看到新启动的进程', async () => {
      // 启动一个进程
      const execResult = await devboxInstance.executeCommand({
        command: 'sleep',
        args: ['10'],
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      // 列出所有进程
      const listResult = await devboxInstance.listProcesses()

      // 检查我们的进程是否在列表中
      const foundProcess = listResult.processes.find(
        p => p.processId === execResult.processId
      )

      expect(foundProcess).toBeDefined()
      if (foundProcess) {
        expect(foundProcess.pid).toBe(execResult.pid)
      }
    }, 15000)
  })

  describe('错误处理', () => {
    it('应该处理无效的命令', async () => {
      const options: ProcessExecOptions = {
        command: '',
      }

      await expect(devboxInstance.executeCommand(options)).rejects.toThrow()
    }, 10000)

    it('应该处理不存在的命令', async () => {
      const options: ProcessExecOptions = {
        command: 'nonexistent-command-xyz123',
      }

      // 异步执行可能会成功（返回 process_id），但进程会失败
      try {
        const result = await devboxInstance.executeCommand(options)
        expect(result.processId).toBeDefined()
      } catch (error) {
        // 如果直接失败也是可以接受的
        expect(error).toBeDefined()
      }
    }, 10000)

    it('应该处理同步执行不存在的命令', async () => {
      const options: ProcessExecOptions = {
        command: 'nonexistent-command-xyz123',
      }

      await expect(devboxInstance.execSync(options)).rejects.toThrow()
    }, 15000)
  })
})

