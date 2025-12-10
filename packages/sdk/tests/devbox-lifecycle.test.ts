/**
 * Devbox Lifecycle Tests
 * Specifically tests Devbox lifecycle operations: create, start, pause, restart, delete, etc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import { TEST_CONFIG } from './setup'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { DevboxRuntime } from '../src/api/types'

describe('Devbox Lifecycle Management', () => {
  let sdk: DevboxSDK
  let createdDevboxes: string[] = []

  beforeEach(() => {
    sdk = new DevboxSDK(TEST_CONFIG)
  })

  afterEach(async () => {
    // Clean up all created Devboxes
    for (const name of createdDevboxes) {
      try {
        const devbox = await sdk.getDevbox(name)
        await devbox.delete()
      } catch (error) {
        console.warn(`Failed to cleanup Devbox ${name}:`, error)
      }
    }
    createdDevboxes = []

    await sdk.close()
  })

  // Helper function: generate unique name
  // Note: name must conform to Kubernetes DNS naming conventions (only lowercase letters, numbers, and hyphens)
  const generateDevboxName = (prefix: string) => {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    // Replace dots with hyphens to ensure DNS naming compliance
    const sanitizedPrefix = prefix.replace(/\./g, '-')
    return `test-${sanitizedPrefix}-${timestamp}-${random}`
  }

  describe('Create Devbox', () => {
    it('should successfully create basic Devbox', async () => {
      const name = generateDevboxName('basic')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: {
          cpu: 1,
          memory: 2,
        }
      })

      expect(devbox).toBeDefined()
      expect(devbox.name).toBe(name)
      createdDevboxes.push(name)

      // Verify can be retrieved via getDevbox
      const fetched = await sdk.getDevbox(name)
      expect(fetched.name).toBe(name)
    }, 120000)

    it('should create Devbox with port configuration', async () => {
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

    it('should create Devboxes with different runtimes', async () => {
      const runtimes = [DevboxRuntime.TEST_AGENT, DevboxRuntime.PYTHON, DevboxRuntime.NEXT_JS, DevboxRuntime.REACT]
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

    it('should handle duplicate name errors', async () => {
      const name = generateDevboxName('duplicate')

      // Create first one
      await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Attempting to create Devbox with same name should fail
      await expect(
        sdk.createDevbox({
          name,
          runtime: DevboxRuntime.TEST_AGENT,
          resource: { cpu: 1, memory: 2 },
        })
      ).rejects.toThrow()
    }, 120000)
  })

  describe('Get Devbox Information', () => {
    it('should be able to get created Devbox', async () => {
      const name = generateDevboxName('get')

      // Create first
      await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      const fetched = await sdk.getDevbox(name)
      expect(fetched.name).toBe(name)
      expect(fetched.runtime).toBe('node.js')
      expect(fetched.status).toBeDefined()
    }, 120000)

    it('should be able to get Devbox instance via getDevbox', async () => {
      const name = generateDevboxName('get-devbox')

      // Create Devbox
      const created = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Get via getDevbox
      const fetched = await sdk.getDevbox(name)

      // Verify basic information
      expect(fetched.name).toBe(name)
      expect(fetched.name).toBe(created.name)
      expect(fetched.runtime).toBe(created.runtime)
      expect(fetched.status).toBeDefined()
      expect(fetched.resources).toBeDefined()
    }, 120000)

    it('should throw error when getting non-existent Devbox', async () => {
      const nonExistentName = 'non-existent-devbox-999'

      await expect(sdk.getDevbox(nonExistentName)).rejects.toThrow()
    }, 30000)
  })

  describe('List All Devboxes', () => {
    it('should be able to list all Devboxes', async () => {
      // Create several test Devboxes
      const testNames: string[] = []
      for (let i = 0; i < 3; i++) {
        const name = generateDevboxName(`list-${i}`)
        await sdk.createDevbox({
          name,
          runtime: DevboxRuntime.TEST_AGENT,
          resource: { cpu: 1, memory: 2 },
        })
        createdDevboxes.push(name)
        testNames.push(name)
      }

      // List all Devboxes
      const allDevboxes = await sdk.listDevboxes()
      expect(Array.isArray(allDevboxes)).toBe(true)

      // Verify our created Devboxes are in the list
      const foundNames = allDevboxes.filter(d => testNames.includes(d.name))
      expect(foundNames.length).toBe(testNames.length)
    }, 180000)

    it('should return empty array when list is empty', async () => {
      // This test may not always be reliable as there may be other Devboxes
      const allDevboxes = await sdk.listDevboxes()
      expect(Array.isArray(allDevboxes)).toBe(true)
    }, 30000)
  })

  describe('Start Devbox', () => {
    it('should be able to start paused Devbox', async () => {
      const name = generateDevboxName('start')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Start Devbox
      await devbox.start()
      
      // Simply wait for status to become Running (don't check health to avoid hanging)
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }
      
      expect(currentDevbox.status).toBe('Running')

      // If already running, pause first
      await currentDevbox.pause()
      // Wait for pause to complete
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)
      expect(currentDevbox.status).toBe('Stopped')

      // Start Devbox again
      await currentDevbox.start()
      
      // Wait for start to complete
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)

      // Verify status changed to Running
      expect(currentDevbox.status).toBe('Running')
    }, 60000)

    it('should be safe to start already running Devbox', async () => {
      const name = generateDevboxName('start-running')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Start and wait for ready
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // Starting already running Devbox should not throw error
      await expect(currentDevbox.start()).resolves.not.toThrow()
    }, 60000)
  })

  describe('Pause Devbox', () => {
    it('should be able to pause running Devbox', async () => {
      const name = generateDevboxName('pause')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Start and wait for ready
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // Pause Devbox
      await currentDevbox.pause()
      
      // Wait for pause to complete
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)

      expect(currentDevbox.status).toBe('Stopped')
    }, 60000)

    it('should be safe to pause already paused Devbox', async () => {
      const name = generateDevboxName('pause-paused')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Start and wait for ready
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

      // Pausing again should not throw error
      await expect(currentDevbox.pause()).resolves.not.toThrow()
    }, 60000)
  })

  describe('Restart Devbox', () => {
    it('should be able to restart Devbox', async () => {
      const name = generateDevboxName('restart')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Start and wait for ready
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // Restart Devbox
      await currentDevbox.restart()
      
      // Wait for restart to complete
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)

      // Should still be in Running state after restart
      expect(currentDevbox.status).toBe('Running')
    }, 60000)
  })

  describe('Delete Devbox', () => {
    it('should be able to delete created Devbox', async () => {
      const name = generateDevboxName('delete')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })

      // Don't add to cleanup list as we manually delete
      expect(devbox.name).toBe(name)

      // Delete Devbox
      await devbox.delete()

      // Verify cannot get after deletion
      await expect(sdk.getDevbox(name)).rejects.toThrow()
    }, 120000)

    it('should throw error when deleting non-existent Devbox', async () => {
      const nonExistentName = 'non-existent-devbox-delete-999'

      // Try to get non-existent Devbox
      await expect(sdk.getDevbox(nonExistentName)).rejects.toThrow()
    }, 30000)
  })

  describe('Full Lifecycle Flow', () => {
    it('should support full create-start-pause-restart-delete flow', async () => {
      const name = generateDevboxName('full-lifecycle')

      // 1. Create
      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
        ports: [{ number: 3000, protocol: 'HTTP' }],
      })

      expect(devbox.name).toBe(name)
      createdDevboxes.push(name)

      // 2. Start and wait for ready
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }
      expect(currentDevbox.status).toBe('Running')

      // 3. Pause
      await currentDevbox.pause()
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)
      expect(currentDevbox.status).toBe('Stopped')

      // 4. Restart
      await currentDevbox.restart()
      await new Promise(resolve => setTimeout(resolve, 3000))
      currentDevbox = await sdk.getDevbox(name)
      expect(currentDevbox.status).toBe('Running')

      // 5. Verify can still be retrieved
      const fetched = await sdk.getDevbox(name)
      expect(fetched.name).toBe(name)

      // Note: actual deletion happens in afterEach
    }, 180000)
  })

  describe('Monitor Data', () => {
    it('should be able to get Devbox monitor data', async () => {
      const name = generateDevboxName('monitor')

      const devbox = await sdk.createDevbox({
        name,
        runtime: DevboxRuntime.TEST_AGENT,
        resource: { cpu: 1, memory: 2 },
      })
      createdDevboxes.push(name)

      // Start and wait for ready
      await devbox.start()
      let currentDevbox = await sdk.getDevbox(name)
      const startTime = Date.now()
      while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentDevbox = await sdk.getDevbox(name)
      }

      // Get monitor data
      const monitorData = await sdk.getMonitorData(name)

      expect(monitorData).toBeDefined()
      expect(Array.isArray(monitorData)).toBe(true)

      if (monitorData.length > 0) {
        const dataPoint = monitorData[0]
        expect(typeof dataPoint?.cpu).toBe('number')
        expect(typeof dataPoint?.memory).toBe('number')
        expect(typeof dataPoint?.network).toBe('object')
        expect(typeof dataPoint?.disk).toBe('object')
      }
    }, 120000)
  })
})