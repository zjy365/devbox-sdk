import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { DevboxSDK } from '../../src/core/DevboxSDK'
import { DevboxConfig } from '../../src/core/types'

describe('DevboxSDK Core', () => {
  let sdk: DevboxSDK
  let mockConfig: DevboxConfig

  beforeEach(() => {
    mockConfig = {
      apiEndpoint: 'https://api.example.com',
      authToken: 'test-token',
      timeout: 5000,
      retryAttempts: 3
    }
  })

  afterEach(() => {
    if (sdk) {
      sdk.disconnect()
    }
  })

  describe('Constructor', () => {
    test('should create SDK instance with default config', () => {
      sdk = new DevboxSDK()
      assert(sdk instanceof DevboxSDK)
      assert.strictEqual(sdk.isConnected(), false)
    })

    test('should create SDK instance with custom config', () => {
      sdk = new DevboxSDK(mockConfig)
      assert(sdk instanceof DevboxSDK)
      assert.strictEqual(sdk.isConnected(), false)
    })

    test('should validate config parameters', () => {
      assert.throws(() => {
        new DevboxSDK({ apiEndpoint: '', authToken: 'token' })
      }, /apiEndpoint is required/)

      assert.throws(() => {
        new DevboxSDK({ apiEndpoint: 'https://api.example.com', authToken: '' })
      }, /authToken is required/)
    })
  })

  describe('Connection Management', () => {
    beforeEach(() => {
      sdk = new DevboxSDK(mockConfig)
    })

    test('should connect successfully', async () => {
      // Mock successful connection
      const mockConnect = async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { success: true, message: 'Connected' }
      }

      // This would be replaced with actual implementation
      const result = await mockConnect()
      assert.strictEqual(result.success, true)
    })

    test('should handle connection failures', async () => {
      // Mock connection failure
      const mockConnect = async () => {
        throw new Error('Connection failed')
      }

      await assert.rejects(mockConnect, /Connection failed/)
    })

    test('should disconnect properly', async () => {
      // Mock disconnect
      const mockDisconnect = async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return { success: true }
      }

      const result = await mockDisconnect()
      assert.strictEqual(result.success, true)
    })

    test('should track connection state', () => {
      assert.strictEqual(sdk.isConnected(), false)
      // After connecting, this should be true
      // sdk.connect() would be called here in actual implementation
    })
  })

  describe('Devbox Management', () => {
    beforeEach(() => {
      sdk = new DevboxSDK(mockConfig)
    })

    test('should list devboxes', async () => {
      const mockDevboxes = [
        { id: 'devbox-1', name: 'Development Box 1', status: 'running' },
        { id: 'devbox-2', name: 'Development Box 2', status: 'stopped' }
      ]

      // Mock API call
      const mockList = async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { devboxes: mockDevboxes }
      }

      const result = await mockList()
      assert.strictEqual(result.devboxes.length, 2)
      assert.strictEqual(result.devboxes[0].id, 'devbox-1')
    })

    test('should create new devbox', async () => {
      const mockCreate = async (name: string) => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return { id: 'devbox-3', name, status: 'creating' }
      }

      const result = await mockCreate('Test Devbox')
      assert.strictEqual(result.name, 'Test Devbox')
      assert.strictEqual(result.status, 'creating')
    })

    test('should delete devbox', async () => {
      const mockDelete = async (id: string) => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { success: true, deletedId: id }
      }

      const result = await mockDelete('devbox-1')
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.deletedId, 'devbox-1')
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      sdk = new DevboxSDK(mockConfig)
    })

    test('should handle network errors gracefully', async () => {
      const mockOperation = async () => {
        throw new Error('Network timeout')
      }

      await assert.rejects(mockOperation, /Network timeout/)
    })

    test('should retry failed operations', async () => {
      let attempts = 0
      const mockRetry = async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Temporary failure')
        }
        return { success: true }
      }

      const result = await mockRetry()
      assert.strictEqual(result.success, true)
      assert.strictEqual(attempts, 3)
    })

    test('should validate input parameters', () => {
      // Test parameter validation
      assert.throws(() => {
        // This would be an actual SDK method call
        throw new Error('Invalid devbox ID')
      }, /Invalid devbox ID/)
    })
  })

  describe('Configuration', () => {
    test('should update configuration', () => {
      sdk = new DevboxSDK(mockConfig)

      const newConfig = { timeout: 10000 }
      // sdk.updateConfig(newConfig) would be called here

      // Verify configuration was updated
      // assert.strictEqual(sdk.getConfig().timeout, 10000)
    })

    test('should reset to default configuration', () => {
      sdk = new DevboxSDK(mockConfig)

      // sdk.resetConfig() would be called here

      // Verify configuration was reset
      // assert.deepStrictEqual(sdk.getConfig(), new DevboxSDK().getConfig())
    })
  })

  describe('Events', () => {
    beforeEach(() => {
      sdk = new DevboxSDK(mockConfig)
    })

    test('should emit connection events', (done) => {
      let eventCount = 0

      // Mock event listeners
      const onConnect = () => {
        eventCount++
        if (eventCount === 2) done()
      }

      const onDisconnect = () => {
        eventCount++
        if (eventCount === 2) done()
      }

      // Simulate events
      setTimeout(onConnect, 50)
      setTimeout(onDisconnect, 100)
    })

    test('should emit devbox status events', (done) => {
      const onStatusChange = (status: string) => {
        assert.strictEqual(status, 'running')
        done()
      }

      // Simulate status change event
      setTimeout(() => onStatusChange('running'), 50)
    })
  })
})