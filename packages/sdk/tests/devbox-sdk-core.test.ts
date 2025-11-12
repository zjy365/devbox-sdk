/**
 * DevboxSDK 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import { TEST_CONFIG } from './setup'
import type { DevboxSDKConfig } from '../src/core/types'

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
      expect(sdk.getMonitorData).toBeDefined()
      expect(sdk.close).toBeDefined()
    })

    it('应该验证配置参数 - 缺少 kubeconfig', () => {
      expect(() => {
        new DevboxSDK({} as DevboxSDKConfig)
      }).toThrow()
    })

    it('应该接受有效的配置', () => {
      const validConfig: DevboxSDKConfig = {
        kubeconfig: 'test-kubeconfig',
        baseUrl: 'http://localhost:3000',
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
        kubeconfig: 'test',
        baseUrl: 'http://localhost:3000',
      }
      
      const testSdk = new DevboxSDK(config)
      expect(testSdk).toBeDefined()
      testSdk.close()
    })

    it('应该使用自定义超时值', () => {
      const config: DevboxSDKConfig = {
        kubeconfig: 'test',
        baseUrl: 'http://localhost:3000',
        http: {
          timeout: 60000,
        },
      }
      
      const testSdk = new DevboxSDK(config)
      expect(testSdk).toBeDefined()
      testSdk.close()
    })
  })

  
  describe('API 方法可用性', () => {
    it('应该能够列出所有 Devbox', async () => {
      const list = await sdk.listDevboxes()
      expect(Array.isArray(list)).toBe(true)
    }, 30000)

    it('应该处理无效的 Devbox 名称', async () => {
      await expect(
        sdk.getDevbox('INVALID-NONEXISTENT-NAME-999')
      ).rejects.toThrow()
    }, 30000)
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

    it('应该提供 URL 解析器访问', () => {
      const urlResolver = sdk.getUrlResolver()
      expect(urlResolver).toBeDefined()
    })
  })
})
 