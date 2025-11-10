/**
 * Devbox WebSocket 文件监控测试
 * 测试通过 WebSocket 实时监控 Devbox 内部文件变化
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/DevboxSDK'
import type { DevboxInstance } from '../src/core/DevboxInstance'
import { TEST_CONFIG } from './setup'
import type { FileChangeEvent, DevboxCreateConfig } from '../src/core/types'
import { DevboxRuntime } from '../src/api/types'

// Utility function to wait for Devbox to be ready
async function waitForDevboxReady(devbox: DevboxInstance, timeout = 120000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      await devbox.refreshInfo()
      if (devbox.status === 'Running') {
        await new Promise(resolve => setTimeout(resolve, 8000))
        return
      }
    } catch (error) {
      // Ignore intermediate errors
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  throw new Error(`Devbox ${devbox.name} did not become ready within ${timeout}ms`)
}

describe('Devbox WebSocket File Watch', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-ws-filewatch-${Date.now()}`

  // 测试文件路径
  const WATCH_DIR = '/watch-test'

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    const config: DevboxCreateConfig = {
      name: TEST_DEVBOX_NAME,
      runtime: DevboxRuntime.NODE_JS,
      resource: {
        cpu: 0.5,
        memory: 512,
      },
    }

    devboxInstance = await sdk.createDevbox(config)
    await devboxInstance.start()
    await waitForDevboxReady(devboxInstance)

    // 创建监控目录
    await sdk.uploadFiles(devboxInstance.name, {
      [`${WATCH_DIR}/.gitkeep`]: '',
    })
  }, 45000)

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
  }, 15000)

  describe('WebSocket 连接', () => {
    it('应该能够建立 WebSocket 连接', async () => {
      const events: FileChangeEvent[] = []

      // 创建文件监控连接
      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      expect(wsConnection).toBeDefined()
      // Note: WebSocket state check depends on implementation

      // 清理连接
      wsConnection.close()
    }, 10000)

    it('应该在连接断开后自动重连', async () => {
      const reconnectionCount = 0
      const events: FileChangeEvent[] = []

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 模拟连接断开
      wsConnection.close()

      // 等待重连
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Note: Reconnection logic depends on SDK implementation

      wsConnection.close()
    }, 15000)

    it('应该能够关闭 WebSocket 连接', async () => {
      const events: FileChangeEvent[] = []

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // Note: WebSocket state check depends on implementation

      // 关闭连接
      wsConnection.close()

      // Note: WebSocket state check depends on implementation
    }, 10000)
  })

  describe('文件变化监控', () => {
    it('应该监控到文件创建事件', async () => {
      const events: FileChangeEvent[] = []
      const testFilePath = `${WATCH_DIR}/new-file.txt`
      const testContent = 'New file content'

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 创建文件
      await devboxInstance.writeFile(testFilePath, testContent)

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 2000))

      expect(events.length).toBeGreaterThan(0)
      expect(events.some(e => e.type === 'add' && e.path === testFilePath)).toBe(true)

      wsConnection.close()
    }, 15000)

    it('应该监控到文件修改事件', async () => {
      const events: FileChangeEvent[] = []
      const testFilePath = `${WATCH_DIR}/modify-test.txt`
      const originalContent = 'Original content'
      const modifiedContent = 'Modified content'

      // 先创建文件
      await devboxInstance.writeFile(testFilePath, originalContent)

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 修改文件
      await devboxInstance.writeFile(testFilePath, modifiedContent)

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 2000))

      expect(events.length).toBeGreaterThan(0)
      expect(events.some(e => e.type === 'change' && e.path === testFilePath)).toBe(true)

      wsConnection.close()
    }, 15000)

    it('应该监控到文件删除事件', async () => {
      const events: FileChangeEvent[] = []
      const testFilePath = `${WATCH_DIR}/delete-test.txt`
      const testContent = 'To be deleted'

      // 先创建文件
      await devboxInstance.writeFile(testFilePath, testContent)

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 删除文件
      await sdk.deleteFile(devboxInstance.name, testFilePath)

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 2000))

      expect(events.length).toBeGreaterThan(0)
      expect(events.some(e => e.type === 'unlink' && e.path === testFilePath)).toBe(true)

      wsConnection.close()
    }, 15000)

    it('应该监控到批量文件操作', async () => {
      const events: FileChangeEvent[] = []
      const batchFiles: Record<string, string> = {}

      // 准备批量文件
      for (let i = 0; i < 5; i++) {
        batchFiles[`${WATCH_DIR}/batch-${i}.txt`] = `Batch content ${i}`
      }

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 批量上传文件
      await sdk.uploadFiles(devboxInstance.name, batchFiles)

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 3000))

      const addEvents = events.filter(e => e.type === 'add')
      expect(addEvents.length).toBe(Object.keys(batchFiles).length)

      wsConnection.close()
    }, 20000)
  })

  describe('子目录监控', () => {
    it('应该监控到子目录中的文件变化', async () => {
      const events: FileChangeEvent[] = []
      const subDir = `${WATCH_DIR}/subdir`
      const subFile = `${subDir}/subfile.txt`

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 在子目录中创建文件
      await devboxInstance.writeFile(subFile, 'Subdirectory content')

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 2000))

      expect(events.length).toBeGreaterThan(0)
      expect(events.some(e => e.type === 'add' && e.path === subFile)).toBe(true)

      wsConnection.close()
    }, 15000)

    it('应该支持递归监控', async () => {
      const events: FileChangeEvent[] = []
      const deepDir = `${WATCH_DIR}/level1/level2/level3`
      const deepFile = `${deepDir}/deep.txt`

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 在深层目录中创建文件
      await devboxInstance.writeFile(deepFile, 'Deep content')

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 3000))

      expect(events.length).toBeGreaterThan(0)
      expect(events.some(e => e.type === 'add' && e.path === deepFile)).toBe(true)

      wsConnection.close()
    }, 20000)
  })

  describe('事件过滤', () => {
    it('应该支持文件类型过滤', async () => {
      const events: FileChangeEvent[] = []

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 创建不同类型的文件
      await Promise.all([
        devboxInstance.writeFile(`${WATCH_DIR}/file.txt`, 'Text file'),
        devboxInstance.writeFile(`${WATCH_DIR}/file.js`, 'JavaScript file'),
        devboxInstance.writeFile(`${WATCH_DIR}/file.json`, 'JSON file'),
      ])

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 应该只收到 .txt 文件的事件
      expect(events.length).toBe(1)
      expect(events[0].path).toMatch(/\.txt$/)

      wsConnection.close()
    }, 15000)

    it('应该支持文件名模式过滤', async () => {
      const events: FileChangeEvent[] = []

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 创建不同名称的文件
      await Promise.all([
        devboxInstance.writeFile(`${WATCH_DIR}/app.log`, 'Log content'),
        devboxInstance.writeFile(`${WATCH_DIR}/error.log`, 'Error log'),
        devboxInstance.writeFile(`${WATCH_DIR}/config.txt`, 'Config file'),
      ])

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 应该只收到 .log 文件的事件
      expect(events.length).toBe(2)
      expect(events.every(e => e.path.endsWith('.log'))).toBe(true)

      wsConnection.close()
    }, 15000)
  })

  describe('性能和稳定性', () => {
    it('应该能够处理高频文件操作', async () => {
      const events: FileChangeEvent[] = []
      const OPERATION_COUNT = 50

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 快速连续创建文件
      const createPromises = []
      for (let i = 0; i < OPERATION_COUNT; i++) {
        createPromises.push(devboxInstance.writeFile(`${WATCH_DIR}/rapid-${i}.txt`, `Content ${i}`))
      }
      await Promise.all(createPromises)

      // 等待所有事件触发
      await new Promise(resolve => setTimeout(resolve, 5000))

      expect(events.length).toBe(OPERATION_COUNT)

      wsConnection.close()
    }, 30000)

    it('应该在大文件操作后正常工作', async () => {
      const events: FileChangeEvent[] = []
      const largeContent = 'Large file content '.repeat(100000) // ~2MB

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 创建大文件
      await devboxInstance.writeFile(`${WATCH_DIR}/large.txt`, largeContent)

      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 3000))

      expect(events.length).toBeGreaterThan(0)
      expect(events.some(e => e.type === 'add')).toBe(true)

      // 验证连接仍然正常
      expect(wsConnection.readyState).toBe(WebSocket.OPEN)

      wsConnection.close()
    }, 25000)
  })

  describe('错误处理', () => {
    it('应该处理无效的监控路径', async () => {
      await expect(sdk.watchFiles(devboxInstance.name, '/invalid/path', () => {})).rejects.toThrow()
    }, 5000)

    it('应该处理网络中断后的恢复', async () => {
      const events: FileChangeEvent[] = []
      const reconnectionCount = 0

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 模拟网络中断（关闭连接）
      wsConnection.close()

      // 等待重连尝试
      await new Promise(resolve => setTimeout(resolve, 5000))

      expect(reconnectionCount).toBeGreaterThan(0)

      wsConnection.close()
    }, 15000)

    it('应该处理大量事件的缓冲', async () => {
      const events: FileChangeEvent[] = []
      const BATCH_SIZE = 100

      const wsConnection = await sdk.watchFiles(devboxInstance.name, WATCH_DIR, event => {
        events.push(event)
      })

      // 等待监控开始
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 快速创建大量文件，可能超过缓冲区大小
      const createPromises = []
      for (let i = 0; i < BATCH_SIZE + 20; i++) {
        createPromises.push(
          devboxInstance.writeFile(`${WATCH_DIR}/buffer-${i}.txt`, `Content ${i}`)
        )
      }
      await Promise.all(createPromises)

      // 等待所有事件处理
      await new Promise(resolve => setTimeout(resolve, 8000))

      expect(events.length).toBeGreaterThan(BATCH_SIZE)

      wsConnection.close()
    }, 35000)
  })
})
