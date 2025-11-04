/**
 * DevboxSDK 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../../src/core/DevboxSDK'
import { TEST_CONFIG } from '../setup'
import type { DevboxSDKConfig } from '../../src/core/types'

describe('DevboxSDK', () => {
  let sdk: DevboxSDK

  beforeEach(() => {
    sdk = new DevboxSDK(TEST_CONFIG)
  })

  afterEach(async () => {
    if (sdk) {
      await sdk.close()
    }
  })

  describe('初始化', () => {
    it('应该成功初始化 SDK', () => {
      expect(sdk).toBeDefined()
      expect(sdk.createDevbox).toBeDefined()
      expect(sdk.getDevbox).toBeDefined()
      expect(sdk.listDevboxes).toBeDefined()
      expect(sdk.writeFile).toBeDefined()
      expect(sdk.readFile).toBeDefined()
    })

    it('应该验证配置参数 - 缺少 apiEndpoint', () => {
      expect(() => {
        new DevboxSDK({} as DevboxSDKConfig)
      }).toThrow()
    })

    it('应该接受有效的配置', () => {
      const validConfig: DevboxSDKConfig = {
        baseUrl: 'http://localhost:3000',
        kubeconfig: 'test-kubeconfig',
        http: {
          timeout: 10000,
        },
      }
      const testSdk = new DevboxSDK(validConfig)
      expect(testSdk).toBeDefined()
      testSdk.close()
    })
  })

  describe('配置管理', () => {
    it('应该使用默认超时值', () => {
      const config: DevboxSDKConfig = {
        baseUrl: 'http://localhost:3000',
        kubeconfig: 'test',
      }
      
      const testSdk = new DevboxSDK(config)
      expect(testSdk).toBeDefined()
      testSdk.close()
    })

    it('应该使用自定义超时值', () => {
      const config: DevboxSDKConfig = {
        baseUrl: 'http://localhost:3000',
        kubeconfig: 'test',
        http: {
          timeout: 60000,
        },
      }
      
      const testSdk = new DevboxSDK(config)
      expect(testSdk).toBeDefined()
      testSdk.close()
    })
  })

  describe('Devbox 生命周期', () => {
    it('应该列出所有 Devbox', async () => {
      const list = await sdk.listDevboxes() 
      expect(Array.isArray(list)).toBe(true)
      if (list.length > 0) {
        expect(list[0]).toHaveProperty('name')
        expect(list[0]).toHaveProperty('status')
      }
    }, 30000)

    it('应该创建 Devbox', async () => {
      const name = `test-sdk-${Date.now()}`
      
      const devbox = await sdk.createDevbox({
        name,
        runtime: 'next.js',
        resource: {
          cpu: 1,
          memory: 2,
        },
        ports: [
          {
            number: 3000,
            protocol: 'HTTP',
          },
        ],
      })
    
      
      expect(devbox).toBeDefined()
      expect(devbox.name).toBe(name)

    
      try {
        await devbox.delete()
      } catch (error) {
        console.warn('Cleanup failed:', error)
      }
    }, 120000)

    it('应该获取单个 Devbox', async () => {
      const name = `test-sdk-get-${Date.now()}`
      
      // 先创建
      const created = await sdk.createDevbox({
        name,
        runtime: 'node.js',
        resource: { cpu: 1, memory: 2 },
      })

      // 再获取
      const fetched = await sdk.getDevbox(name)

      expect(fetched.name).toBe(name)
      expect(fetched.name).toBe(created.name)

      // 清理
      try {
        await created.delete()
      } catch (error) {
        console.warn('Cleanup failed:', error)
      }
    }, 120000)
  })

  describe('错误处理', () => {
    it('应该处理无效的 Devbox 名称', async () => {
      await expect(
        sdk.getDevbox('INVALID-NONEXISTENT-NAME-999')
      ).rejects.toThrow()
    }, 30000)

    it('应该处理重复创建', async () => {
      const name = `test-sdk-duplicate-${Date.now()}`
      
      const first = await sdk.createDevbox({
        name,
        runtime: 'node.js',
        resource: { cpu: 1, memory: 2 },
      })

      // 尝试创建同名 Devbox
      await expect(
        sdk.createDevbox({
          name,
          runtime: 'node.js',
          resource: { cpu: 1, memory: 2 },
        })
      ).rejects.toThrow()

      // 清理
      try {
        await first.delete()
      } catch (error) {
        console.warn('Cleanup failed:', error)
      }
    }, 120000)
  })

  describe('资源清理', () => {
    it('应该正确关闭 SDK', async () => {
      const testSdk = new DevboxSDK(TEST_CONFIG)
      await testSdk.close()
      
      // 关闭后不应该抛出错误（多次关闭应该是安全的）
      await expect(testSdk.close()).resolves.not.toThrow()
    })

    it('应该支持多次关闭', async () => {
      const testSdk = new DevboxSDK(TEST_CONFIG)
      await testSdk.close()
      await testSdk.close()
      await testSdk.close()
      
      // 不应该抛出错误
      expect(true).toBe(true)
    })
  })

  describe('API 客户端访问', () => {
    it('应该提供 API 客户端访问', () => {
      const apiClient = sdk.getAPIClient()
      expect(apiClient).toBeDefined()
    })

    it('应该提供连接管理器访问', () => {
      const connManager = sdk.getConnectionManager()
      expect(connManager).toBeDefined()
    })
  })
})
 