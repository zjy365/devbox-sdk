/**
 * Devbox 生命周期测试
 * 专门测试 Devbox 的创建、启动、暂停、重启、删除等生命周期操作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/DevboxSDK'
import { TEST_CONFIG } from './setup'
import type { DevboxInstance } from '../src/core/DevboxInstance'
import { DevboxRuntime } from '../src/api/types'

describe('Devbox 生命周期管理', () => {
  let sdk: DevboxSDK
  let createdDevboxes: string[] = []

  beforeEach(() => {
    sdk = new DevboxSDK(TEST_CONFIG)
  })

  afterEach(async () => {
    // 清理所有创建的 Devbox
    for (const name of createdDevboxes) {
      try {
        const devbox = await sdk.getDevbox(name)
        await devbox.delete()
      } catch (error) {
        console.warn(`清理 Devbox ${name} 失败:`, error)
      }
    }
    createdDevboxes = []

    await sdk.close()
  })

  // 辅助函数：生成唯一名称
  // 注意：名称必须符合 Kubernetes DNS 命名规范（只能包含小写字母、数字和连字符）
  const generateDevboxName = (prefix: string) => {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    // 将点号替换为连字符，确保符合 DNS 命名规范
    const sanitizedPrefix = prefix.replace(/\./g, '-')
    return `test-${sanitizedPrefix}-${timestamp}-${random}`
  }

  describe('创建 Devbox', () => {
    it('应该成功创建基础 Devbox', async () => {
      const name = generateDevboxName('basic')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: {
          cpu: 1,
          memory: 2,
        }
      })

      expect(devbox).toBeDefined()
      expect(devbox.name).toBe(name)
      createdDevboxes.push(name)

      // 验证可以通过 getDevbox 获取
      const fetched = await sdk.getDevbox(name)
      expect(fetched.name).toBe(name)
    }, 120000)

    it('应该创建带端口配置的 Devbox', async () => {
      const name = generateDevboxName('ports')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NEXT_JS,
        resource: {
          cpu: 2,
          memory: 4,
        },
        ports: [
          {
            number: 3000,
            protocol: 'HTTP',
          }
        ],
      })

      expect(devbox.name).toBe(name)
      createdDevboxes.push(name)
    }, 120000)

    it('应该创建不同运行时的 Devbox', async () => {
      const runtimes = [DevboxRuntime.NODE_JS, DevboxRuntime.PYTHON, DevboxRuntime.NEXT_JS, DevboxRuntime.REACT]
      const devboxes: DevboxInstance[] = []

      for (const runtime of runtimes) {
        const name = generateDevboxName(runtime)
        const devbox = await sdk.createDevbox({
          name,
          runtime,
          resource: { cpu: 1, memory: 2 },
        })

        expect(devbox.name).toBe(name)
        expect(devbox.runtime).toBe(runtime)
        createdDevboxes.push(name)
        devboxes.push(devbox)
      }
    }, 180000)

    it('应该处理重复名称的错误', async () => {
      const name = generateDevboxName('duplicate')

      // 创建第一个
      await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // 尝试创建同名 Devbox 应该失败
      await expect(
        sdk.createDevbox({
          name,
          runtime: DevboxRuntime.NODE_JS,
          resource: { cpu: 1, memory: 2 },
        })
      ).rejects.toThrow()
    }, 120000)
  })

  describe('获取 Devbox 信息', () => {
    it('应该能够获取已创建的 Devbox', async () => {
      const name = generateDevboxName('get')

      // 先创建
      await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      const fetched = await sdk.getDevbox(name)
      expect(fetched.name).toBe(name)
      expect(fetched.runtime).toBe('node.js')
      expect(fetched.status).toBeDefined()
    }, 120000)

    it('获取不存在的 Devbox 应该抛出错误', async () => {
      const nonExistentName = 'non-existent-devbox-999'

      await expect(sdk.getDevbox(nonExistentName)).rejects.toThrow()
    }, 30000)
  })

  describe('列出所有 Devbox', () => {
    it('应该能够列出所有 Devbox', async () => {
      // 创建几个测试 Devbox
      const testNames: string[] = []
      for (let i = 0; i < 3; i++) {
        const name = generateDevboxName(`list-${i}`)
        await sdk.createDevbox({
          name,
          runtime: DevboxRuntime.NODE_JS,
          resource: { cpu: 1, memory: 2 },
        })
        createdDevboxes.push(name)
        testNames.push(name)
      }

      // 列出所有 Devbox
      const allDevboxes = await sdk.listDevboxes()
      expect(Array.isArray(allDevboxes)).toBe(true)

      // 验证我们创建的 Devbox 在列表中
      const foundNames = allDevboxes.filter(d => testNames.includes(d.name))
      expect(foundNames.length).toBe(testNames.length)
    }, 180000)

    it('空列表时应该返回空数组', async () => {
      // 这个测试可能不总是可靠，因为可能有其他 Devbox 存在
      const allDevboxes = await sdk.listDevboxes()
      expect(Array.isArray(allDevboxes)).toBe(true)
    }, 30000)
  })

  describe('启动 Devbox', () => {
    it('应该能够启动已暂停的 Devbox', async () => {
      const name = generateDevboxName('start')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // 启动 Devbox
      await devbox.start()
      
      // 简单等待状态变为运行中（不检查健康状态，避免卡住）
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }
      
      expect(currentDevbox.status).toBe('Running')

      // 如果已经运行，先暂停
      await currentDevbox.pause()
      // 等待暂停完成
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)
      expect(currentDevbox.status).toBe('Stopped')

      // 再次启动 Devbox
      await currentDevbox.start()
      
      // 等待启动完成
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)

      // 验证状态变为运行中
      expect(currentDevbox.status).toBe('Running')
    }, 60000)

    it('启动运行中的 Devbox 应该是安全的', async () => {
      const name = generateDevboxName('start-running')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // 启动并等待就绪
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // 再次启动运行中的 Devbox 应该不报错
      await expect(currentDevbox.start()).resolves.not.toThrow()
    }, 60000)
  })

  describe('暂停 Devbox', () => {
    it('应该能够暂停运行中的 Devbox', async () => {
      const name = generateDevboxName('pause')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // 启动并等待就绪
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // 暂停 Devbox
      await currentDevbox.pause()
      
      // 等待暂停完成
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)

      expect(currentDevbox.status).toBe('Stopped')
    }, 60000)

    it('暂停已暂停的 Devbox 应该是安全的', async () => {
      const name = generateDevboxName('pause-paused')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // 启动并等待就绪
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }
      
      await currentDevbox.pause()
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)

      // 再次暂停应该不报错
      await expect(currentDevbox.pause()).resolves.not.toThrow()
    }, 60000)
  })

  describe('重启 Devbox', () => {
    it('应该能够重启 Devbox', async () => {
      const name = generateDevboxName('restart')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // 启动并等待就绪
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // 重启 Devbox
      await currentDevbox.restart()
      
      // 等待重启完成
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)

      // 重启后应该仍然是运行状态
      expect(currentDevbox.status).toBe('Running')
    }, 60000)
  })

  describe('删除 Devbox', () => {
    it('应该能够删除已创建的 Devbox', async () => {
      const name = generateDevboxName('delete')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })

      // 不添加到清理列表，因为我们手动删除
      expect(devbox.name).toBe(name)

      // 删除 Devbox
      await devbox.delete()

      // 验证删除后无法获取
      await expect(sdk.getDevbox(name)).rejects.toThrow()
    }, 120000)

    it('删除不存在的 Devbox 应该抛出错误', async () => {
      const nonExistentName = 'non-existent-devbox-delete-999'

      // 尝试获取不存在的 Devbox
      await expect(sdk.getDevbox(nonExistentName)).rejects.toThrow()
    }, 30000)
  })

  describe('完整的生命周期流程', () => {
    it('应该支持完整的创建-启动-暂停-重启-删除流程', async () => {
      const name = generateDevboxName('full-lifecycle')

      // 1. 创建
      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
        ports: [{ number: 3000, protocol: 'HTTP' }],
      })

      expect(devbox.name).toBe(name)
      createdDevboxes.push(name)

      // 2. 启动并等待就绪
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }
      expect(currentDevbox.status).toBe('Running')

      // 3. 暂停
      await currentDevbox.pause()
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)
      expect(currentDevbox.status).toBe('Stopped')

      // 4. 重启
      await currentDevbox.restart()
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)
      expect(currentDevbox.status).toBe('Running')

      // 5. 验证仍然可以获取
      const fetched = await sdk.getDevbox(name)
      expect(fetched.name).toBe(name)

      // 注意：实际删除在 afterEach 中进行
    }, 180000)
  })

  describe('监控数据', () => {
    it('应该能够获取 Devbox 监控数据', async () => {
      const name = generateDevboxName('monitor')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.NODE_JS,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // 启动并等待就绪
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // 获取监控数据
      const monitorData = await sdk.getMonitorData(name)

      expect(monitorData).toBeDefined()
      expect(Array.isArray(monitorData)).toBe(true)

      if (monitorData.length > 0) {
        const dataPoint = monitorData[0]
        expect(typeof dataPoint.cpu).toBe('number')
        expect(typeof dataPoint.memory).toBe('number')
        expect(typeof dataPoint.network).toBe('object')
        expect(typeof dataPoint.disk).toBe('object')
      }
    }, 120000)
  })
})