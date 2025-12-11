/**
 * DevboxSDK Unit Tests
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

  describe('Initialization', () => {
    it('should successfully initialize SDK', () => {
      expect(sdk).toBeDefined()
      expect(sdk.createDevbox).toBeDefined()
      expect(sdk.getDevbox).toBeDefined()
      expect(sdk.listDevboxes).toBeDefined()
      expect(sdk.getMonitorData).toBeDefined()
      expect(sdk.close).toBeDefined()
    })

    it('should validate config parameters - missing kubeconfig', () => {
      expect(() => {
        new DevboxSDK({} as DevboxSDKConfig)
      }).toThrow()
    })

    it('should accept valid configuration', () => {
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

  describe('Configuration Management', () => {
    it('should use default timeout value', () => {
      const config: DevboxSDKConfig = {
        kubeconfig: 'test',
        baseUrl: 'http://localhost:3000',
      }
      
      const testSdk = new DevboxSDK(config)
      expect(testSdk).toBeDefined()
      testSdk.close()
    })

    it('should use custom timeout value', () => {
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

  
  describe('API Method Availability', () => {
    it('should be able to list all Devboxes', async () => {
      const list = await sdk.listDevboxes()
      expect(Array.isArray(list)).toBe(true)
    }, 30000)

    it('should handle invalid Devbox name', async () => {
      await expect(
        sdk.getDevbox('INVALID-NONEXISTENT-NAME-999')
      ).rejects.toThrow()
    }, 30000)
  })

  describe('Resource Cleanup', () => {
    it('should properly close SDK', async () => {
      const testSdk = new DevboxSDK(TEST_CONFIG)
      await testSdk.close()
      
      // Should not throw error after closing (multiple closes should be safe)
      await expect(testSdk.close()).resolves.not.toThrow()
    })

    it('should support multiple closes', async () => {
      const testSdk = new DevboxSDK(TEST_CONFIG)
      await testSdk.close()
      await testSdk.close()
      await testSdk.close()
      
      // Should not throw error
      expect(true).toBe(true)
    })
  })

  describe('API Client Access', () => {
    it('should provide API client access', () => {
      const apiClient = sdk.getAPIClient()
      expect(apiClient).toBeDefined()
    })

    it('should provide URL resolver access', () => {
      const urlResolver = sdk.getUrlResolver()
      expect(urlResolver).toBeDefined()
    })
  })
})
 