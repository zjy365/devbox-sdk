/**
 * Unit tests for ServiceContainer
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { ServiceContainer } from '../../src/core/container'

describe('ServiceContainer', () => {
  let container: ServiceContainer

  beforeEach(() => {
    container = new ServiceContainer()
  })

  describe('register', () => {
    it('should register a service factory', () => {
      const factory = () => ({ name: 'test' })
      container.register('test', factory)

      expect(container.has('test')).toBe(true)
    })

    it('should allow multiple services', () => {
      container.register('service1', () => ({ id: 1 }))
      container.register('service2', () => ({ id: 2 }))
      container.register('service3', () => ({ id: 3 }))

      expect(container.size).toBe(3)
    })

    it('should overwrite existing service with same name', () => {
      container.register('test', () => ({ version: 1 }))
      container.register('test', () => ({ version: 2 }))

      const service = container.get<{ version: number }>('test')
      expect(service.version).toBe(2)
    })
  })

  describe('get', () => {
    it('should return service instance', () => {
      const testService = { name: 'test' }
      container.register('test', () => testService)

      const service = container.get('test')
      expect(service).toBe(testService)
    })

    it('should throw error if service not found', () => {
      expect(() => container.get('nonexistent')).toThrow('Service "nonexistent" not found')
    })

    it('should implement lazy initialization', () => {
      let factoryCalled = false
      const factory = () => {
        factoryCalled = true
        return { lazy: true }
      }

      container.register('lazy', factory)
      expect(factoryCalled).toBe(false) // Not called on register

      container.get('lazy')
      expect(factoryCalled).toBe(true) // Called on first get
    })

    it('should return same instance on multiple calls (singleton)', () => {
      let callCount = 0
      const factory = () => {
        callCount++
        return { id: callCount }
      }

      container.register('singleton', factory)

      const instance1 = container.get('singleton')
      const instance2 = container.get('singleton')
      const instance3 = container.get('singleton')

      expect(instance1).toBe(instance2)
      expect(instance2).toBe(instance3)
      expect(callCount).toBe(1) // Factory called only once
    })

    it('should support TypeScript generics', () => {
      interface TestService {
        doSomething(): string
      }

      const service: TestService = {
        doSomething() {
          return 'done'
        }
      }

      container.register<TestService>('typed', () => service)
      const retrieved = container.get<TestService>('typed')

      expect(retrieved.doSomething()).toBe('done')
    })
  })

  describe('has', () => {
    it('should return true for registered service', () => {
      container.register('exists', () => ({}))
      expect(container.has('exists')).toBe(true)
    })

    it('should return false for non-existent service', () => {
      expect(container.has('nope')).toBe(false)
    })

    it('should return true even if service not yet instantiated', () => {
      container.register('lazy', () => ({}))
      expect(container.has('lazy')).toBe(true)
    })
  })

  describe('clear', () => {
    it('should remove all services', () => {
      container.register('service1', () => ({}))
      container.register('service2', () => ({}))
      container.register('service3', () => ({}))

      expect(container.size).toBe(3)

      container.clear()

      expect(container.size).toBe(0)
      expect(container.has('service1')).toBe(false)
      expect(container.has('service2')).toBe(false)
      expect(container.has('service3')).toBe(false)
    })

    it('should allow re-registration after clear', () => {
      container.register('test', () => ({ version: 1 }))
      container.clear()
      container.register('test', () => ({ version: 2 }))

      const service = container.get<{ version: number }>('test')
      expect(service.version).toBe(2)
    })
  })

  describe('size', () => {
    it('should return correct size', () => {
      expect(container.size).toBe(0)

      container.register('s1', () => ({}))
      expect(container.size).toBe(1)

      container.register('s2', () => ({}))
      expect(container.size).toBe(2)

      container.register('s3', () => ({}))
      expect(container.size).toBe(3)
    })
  })

  describe('real-world usage', () => {
    it('should work with logger service', () => {
      interface Logger {
        log(message: string): void
      }

      const logger: Logger = {
        log(message: string) {
          console.log(message)
        }
      }

      container.register<Logger>('logger', () => logger)

      const retrievedLogger = container.get<Logger>('logger')
      expect(retrievedLogger).toBe(logger)
    })

    it('should work with service dependencies', () => {
      interface ConfigService {
        getPort(): number
      }

      interface ServerService {
        config: ConfigService
        start(): void
      }

      // Register config first
      container.register<ConfigService>('config', () => ({
        getPort() {
          return 3000
        }
      }))

      // Server depends on config
      container.register<ServerService>('server', () => {
        const config = container.get<ConfigService>('config')
        return {
          config,
          start() {
            console.log(`Starting on port ${config.getPort()}`)
          }
        }
      })

      const server = container.get<ServerService>('server')
      expect(server.config.getPort()).toBe(3000)
    })
  })
})
