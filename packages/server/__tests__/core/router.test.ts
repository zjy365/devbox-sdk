/**
 * Unit tests for Router
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { Router } from '../../src/core/router'
import { ServiceContainer } from '../../src/core/container'
import type { RouteHandler } from '../../src/core/router'

describe('Router', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  describe('register', () => {
    it('should register a route handler', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/test', handler)

      const routes = router.getRoutes()
      expect(routes.has('GET')).toBe(true)
    })

    it('should normalize HTTP methods to uppercase', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('get', '/test', handler)
      router.register('Post', '/test2', handler)

      const routes = router.getRoutes()
      expect(routes.has('GET')).toBe(true)
      expect(routes.has('POST')).toBe(true)
    })

    it('should support multiple routes for same method', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/route1', handler)
      router.register('GET', '/route2', handler)
      router.register('GET', '/route3', handler)

      const routes = router.getRoutes()
      expect(routes.get('GET')?.size).toBe(3)
    })

    it('should support multiple HTTP methods', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/test', handler)
      router.register('POST', '/test', handler)
      router.register('PUT', '/test', handler)
      router.register('DELETE', '/test', handler)

      const routes = router.getRoutes()
      expect(routes.size).toBe(4)
    })
  })

  describe('match', () => {
    it('should match exact static routes', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/files/list', handler)

      const match = router.match('GET', 'http://localhost:3000/files/list')
      expect(match).not.toBeNull()
      expect(match?.handler).toBe(handler)
    })

    it('should return null for non-existent route', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/test', handler)

      const match = router.match('GET', 'http://localhost:3000/nonexistent')
      expect(match).toBeNull()
    })

    it('should return null for wrong HTTP method', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/test', handler)

      const match = router.match('POST', 'http://localhost:3000/test')
      expect(match).toBeNull()
    })

    it('should match routes with path parameters', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/files/:path', handler)

      const match = router.match('GET', 'http://localhost:3000/files/app.js')
      expect(match).not.toBeNull()
      expect(match?.params.path).toEqual({ path: 'app.js' })
    })

    it('should match routes with multiple path parameters', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/api/:version/users/:userId', handler)

      const match = router.match('GET', 'http://localhost:3000/api/v1/users/123')
      expect(match).not.toBeNull()
      expect(match?.params.path).toEqual({
        version: 'v1',
        userId: '123'
      })
    })

    it('should decode URI-encoded path parameters', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/files/:path', handler)

      const match = router.match('GET', 'http://localhost:3000/files/my%20file.txt')
      expect(match).not.toBeNull()
      expect(match?.params.path.path).toBe('my file.txt')
    })

    it('should extract query parameters', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/search', handler)

      const match = router.match('GET', 'http://localhost:3000/search?q=test&limit=10')
      expect(match).not.toBeNull()
      expect(match?.params.query).toEqual({
        q: 'test',
        limit: '10'
      })
    })

    it('should handle routes with both path and query parameters', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/users/:id/posts', handler)

      const match = router.match('GET', 'http://localhost:3000/users/42/posts?page=2&limit=20')
      expect(match).not.toBeNull()
      expect(match?.params.path).toEqual({ id: '42' })
      expect(match?.params.query).toEqual({ page: '2', limit: '20' })
    })

    it('should handle empty query parameters', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/test', handler)

      const match = router.match('GET', 'http://localhost:3000/test')
      expect(match).not.toBeNull()
      expect(match?.params.query).toEqual({})
    })

    it('should not match routes with different segment counts', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/api/users', handler)

      const match1 = router.match('GET', 'http://localhost:3000/api')
      const match2 = router.match('GET', 'http://localhost:3000/api/users/123')

      expect(match1).toBeNull()
      expect(match2).toBeNull()
    })

    it('should match first registered route when multiple patterns match', () => {
      const handler1: RouteHandler = async () => new Response('Handler 1')
      const handler2: RouteHandler = async () => new Response('Handler 2')

      router.register('GET', '/files/:path', handler1)
      router.register('GET', '/files/special', handler2)

      const match = router.match('GET', 'http://localhost:3000/files/special')
      expect(match?.handler).toBe(handler1) // First registered wins
    })

    it('should handle trailing slashes consistently', () => {
      const handler: RouteHandler = async () => new Response('OK')
      router.register('GET', '/test', handler)

      // Without trailing slash should match
      const match1 = router.match('GET', 'http://localhost:3000/test')
      expect(match1).not.toBeNull()

      // With trailing slash should also match (empty segments filtered)
      const match2 = router.match('GET', 'http://localhost:3000/test/')
      expect(match2).not.toBeNull()

      // But multiple segments should not match
      const match3 = router.match('GET', 'http://localhost:3000/test/extra')
      expect(match3).toBeNull()
    })
  })

  describe('integration with ServiceContainer', () => {
    it('should accept container in constructor', () => {
      const container = new ServiceContainer()
      const routerWithContainer = new Router(container)

      expect(routerWithContainer).toBeDefined()
    })

    it('should provide getService method to access container', () => {
      const container = new ServiceContainer()
      const testService = { name: 'test' }
      container.register('test', () => testService)

      const routerWithContainer = new Router(container)
      const service = routerWithContainer.getService('test')

      expect(service).toBe(testService)
    })

    it('should throw error if getService called without container', () => {
      const routerWithoutContainer = new Router()

      expect(() => routerWithoutContainer.getService('test')).toThrow(
        'Container not provided to router'
      )
    })

    it('should allow handlers to access services', async () => {
      interface FileHandler {
        handleRead(path: string): Promise<string>
      }

      const fileHandler: FileHandler = {
        async handleRead(path: string) {
          return `Reading ${path}`
        }
      }

      const container = new ServiceContainer()
      container.register<FileHandler>('fileHandler', () => fileHandler)

      const routerWithContainer = new Router(container)

      const handler: RouteHandler = async (req, params) => {
        const handler = routerWithContainer.getService<FileHandler>('fileHandler')
        const result = await handler.handleRead(params.path.path || '')
        return new Response(result)
      }

      routerWithContainer.register('GET', '/files/:path', handler)

      const match = routerWithContainer.match('GET', 'http://localhost:3000/files/test.txt')
      expect(match).not.toBeNull()

      if (match) {
        const request = new Request('http://localhost:3000/files/test.txt')
        const response = await match.handler(request, match.params)
        const text = await response.text()
        expect(text).toBe('Reading test.txt')
      }
    })
  })

  describe('real-world scenarios', () => {
    it('should handle file API routes', () => {
      const handler: RouteHandler = async () => new Response('OK')

      router.register('POST', '/files/write', handler)
      router.register('GET', '/files/read/:path', handler)
      router.register('GET', '/files/list/:directory', handler)
      router.register('DELETE', '/files/delete/:path', handler)

      expect(router.match('POST', 'http://localhost:3000/files/write')).not.toBeNull()
      expect(router.match('GET', 'http://localhost:3000/files/read/app.js')).not.toBeNull()
      expect(router.match('GET', 'http://localhost:3000/files/list/src')).not.toBeNull()
      expect(router.match('DELETE', 'http://localhost:3000/files/delete/temp.txt')).not.toBeNull()
    })

    it('should handle process API routes', () => {
      const handler: RouteHandler = async () => new Response('OK')

      router.register('POST', '/process/execute', handler)
      router.register('POST', '/process/start', handler)
      router.register('POST', '/process/kill/:id', handler)
      router.register('GET', '/process/status/:id', handler)

      expect(router.match('POST', 'http://localhost:3000/process/execute')).not.toBeNull()
      expect(router.match('POST', 'http://localhost:3000/process/start')).not.toBeNull()
      expect(router.match('POST', 'http://localhost:3000/process/kill/123')).not.toBeNull()
      expect(router.match('GET', 'http://localhost:3000/process/status/456')).not.toBeNull()
    })

    it('should handle session API routes', () => {
      const handler: RouteHandler = async () => new Response('OK')

      router.register('POST', '/session/create', handler)
      router.register('POST', '/session/:id/execute', handler)
      router.register('DELETE', '/session/:id', handler)

      expect(router.match('POST', 'http://localhost:3000/session/create')).not.toBeNull()
      expect(router.match('POST', 'http://localhost:3000/session/abc-123/execute')).not.toBeNull()
      expect(router.match('DELETE', 'http://localhost:3000/session/abc-123')).not.toBeNull()
    })
  })
})
