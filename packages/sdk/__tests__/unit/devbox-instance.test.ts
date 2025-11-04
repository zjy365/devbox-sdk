/**
 * DevboxInstance 单元测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { TestHelper, skipIfNoKubeconfig, sleep } from '../setup'
import type { DevboxInstance } from '../../src/core/DevboxInstance'

describe('DevboxInstance', () => {
  let helper: TestHelper
  let devbox: DevboxInstance

  beforeAll(async () => {
    if (skipIfNoKubeconfig()) {
      return
    }

    helper = new TestHelper()
    devbox = await helper.createTestDevbox()
    
    console.log('⏳ Waiting for Devbox to be ready...')
    await helper.waitForDevboxReady(devbox)
    console.log('✓ Devbox is ready')
  }, 180000)

  afterAll(async () => {
    if (helper) {
      await helper.cleanup()
    }
  })

  describe('基本属性', () => {
    it.skipIf(skipIfNoKubeconfig())('应该有正确的属性', () => {
      expect(devbox.name).toBeTruthy()
      expect(devbox.status).toBeDefined()
      expect(devbox.runtime).toBeDefined()
    })

    it.skipIf(skipIfNoKubeconfig())('应该提供 serverUrl', () => {
      // 只有在 Running 状态才有 serverUrl
      if (devbox.status === 'Running') {
        expect(() => devbox.serverUrl).not.toThrow()
      }
    })
  })

  describe('生命周期管理 (需要真实环境)', () => {
    it.skipIf(skipIfNoKubeconfig())('应该能刷新信息', async () => {
      const oldStatus = devbox.status
      await devbox.refreshInfo()
      
      // 状态应该被更新（可能相同或不同）
      expect(devbox.status).toBeDefined()
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该暂停和启动 Devbox', async () => {
      // 暂停
      await devbox.pause()
      await sleep(5000)
      await devbox.refreshInfo()
      
      expect(['Stopped', 'Stopping']).toContain(devbox.status)

      // 启动
      await devbox.start()
      await helper.waitForDevboxReady(devbox)
      await devbox.refreshInfo()

      expect(devbox.status).toBe('Running')
    }, 180000)

    it.skipIf(skipIfNoKubeconfig())('应该重启 Devbox', async () => {
      await devbox.restart()
      await helper.waitForDevboxReady(devbox)
      await devbox.refreshInfo()

      expect(devbox.status).toBe('Running')
    }, 180000)
  })

  describe('文件操作 (需要真实环境)', () => {
    it.skipIf(skipIfNoKubeconfig())('应该写入和读取文本文件', async () => {
      const testContent = 'Hello, Devbox SDK!'
      const testPath = '/tmp/test-text.txt'
      
      await devbox.writeFile(testPath, testContent)
      const content = await devbox.readFile(testPath)

      expect(content.toString('utf-8')).toBe(testContent)
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该处理二进制文件', async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const testPath = '/tmp/test-binary.bin'
      
      await devbox.writeFile(testPath, buffer)
      const read = await devbox.readFile(testPath)

      expect(Buffer.isBuffer(read)).toBe(true)
      expect(read).toEqual(buffer)
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该处理大文件', async () => {
      const largeContent = 'x'.repeat(10000) // 10KB
      const testPath = '/tmp/test-large.txt'
      
      await devbox.writeFile(testPath, largeContent)
      const read = await devbox.readFile(testPath)

      expect(read.toString('utf-8')).toBe(largeContent)
    }, 60000)

    it.skipIf(skipIfNoKubeconfig())('应该列出文件', async () => {
      // 先创建一些测试文件
      await devbox.writeFile('/tmp/list-test-1.txt', 'test1')
      await devbox.writeFile('/tmp/list-test-2.txt', 'test2')

      const files = await devbox.listFiles('/tmp')

      expect(Array.isArray(files)).toBe(true)
      expect(files.length).toBeGreaterThan(0)
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该批量上传文件', async () => {
      const files = {
        '/tmp/batch-1.txt': 'content1',
        '/tmp/batch-2.txt': 'content2',
        '/tmp/batch-3.txt': 'content3',
      }

      const result = await devbox.uploadFiles(files)

      expect(result.success).toBe(true)
      expect(result.transferred).toBeGreaterThanOrEqual(3)
    }, 60000)

    it.skipIf(skipIfNoKubeconfig())('应该删除文件', async () => {
      const testPath = '/tmp/to-delete.txt'
      
      // 先创建文件
      await devbox.writeFile(testPath, 'delete me')
      
      // 删除文件
      await devbox.deleteFile(testPath)
      
      // 尝试读取应该失败
      await expect(devbox.readFile(testPath)).rejects.toThrow()
    }, 30000)
  })

  describe('命令执行 (需要真实环境)', () => {
    it.skipIf(skipIfNoKubeconfig())('应该执行简单命令', async () => {
      const result = await devbox.executeCommand('echo "hello"')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello')
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该处理命令错误', async () => {
      const result = await devbox.executeCommand('nonexistent-command-xyz')

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr || result.stdout).toBeTruthy()
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该设置工作目录', async () => {
      const result = await devbox.executeCommand('pwd', {
        cwd: '/tmp'
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('/tmp')
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该设置环境变量', async () => {
      const result = await devbox.executeCommand('echo $MY_VAR', {
        env: { MY_VAR: 'test-value' }
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('test-value')
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该支持命令超时', async () => {
      await expect(
        devbox.executeCommand('sleep 30', { timeout: 2000 })
      ).rejects.toThrow()
    }, 10000)
  })

  describe('错误处理', () => {
    it.skipIf(skipIfNoKubeconfig())('应该处理无效路径', async () => {
      await expect(
        devbox.readFile('/nonexistent/deeply/nested/file.txt')
      ).rejects.toThrow()
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该验证路径安全性', async () => {
      // 尝试目录遍历攻击
      await expect(
        devbox.writeFile('../../etc/passwd', 'malicious')
      ).rejects.toThrow()
    }, 10000)

    it.skipIf(skipIfNoKubeconfig())('应该处理空文件路径', async () => {
      await expect(
        devbox.readFile('')
      ).rejects.toThrow()
    }, 10000)
  })

  describe('进程管理 (需要真实环境)', () => {
    it.skipIf(skipIfNoKubeconfig())('应该列出进程', async () => {
      const processes = await devbox.listProcesses()

      expect(Array.isArray(processes)).toBe(true)
      // 应该至少有一些系统进程
      expect(processes.length).toBeGreaterThan(0)
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该终止进程', async () => {
      // 启动一个长时间运行的进程
      await devbox.executeCommand('sleep 300 &')
      await sleep(1000)

      const processes = await devbox.listProcesses()
      const sleepProcess = processes.find(p => p.command.includes('sleep'))

      if (sleepProcess) {
        await devbox.killProcess(sleepProcess.pid)
        await sleep(1000)

        // 验证进程已被终止
        const afterProcesses = await devbox.listProcesses()
        const stillExists = afterProcesses.find(p => p.pid === sleepProcess.pid)
        expect(stillExists).toBeUndefined()
      }
    }, 60000)
  })

  describe('监控 (需要真实环境)', () => {
    it.skipIf(skipIfNoKubeconfig())('应该获取资源使用情况', async () => {
      const stats = await devbox.getResourceStats()

      expect(stats).toBeDefined()
      expect(stats.cpu).toBeDefined()
      expect(stats.memory).toBeDefined()
    }, 30000)

    it.skipIf(skipIfNoKubeconfig())('应该获取日志', async () => {
      const logs = await devbox.getLogs({ lines: 100 })

      expect(Array.isArray(logs)).toBe(true)
    }, 30000)
  })
})

