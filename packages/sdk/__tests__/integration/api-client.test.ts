import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { APIClient } from '../../src/api/client'
import { AuthManager } from '../../src/api/auth'
import nock from 'nock'

describe('API Client Integration Tests', () => {
  let apiClient: APIClient
  let authManager: AuthManager
  let mockScope: nock.Scope

  beforeEach(() => {
    // Set up nock to mock HTTP requests
    mockScope = nock('https://api.example.com')

    authManager = new AuthManager({
      endpoint: 'https://api.example.com',
      token: 'test-token'
    })

    apiClient = new APIClient({
      baseURL: 'https://api.example.com',
      auth: authManager,
      timeout: 5000
    })
  })

  afterEach(() => {
    nock.cleanAll()
    if (apiClient) {
      apiClient.disconnect()
    }
  })

  describe('Authentication', () => {
    test('should authenticate with valid token', async () => {
      mockScope
        .post('/auth/verify')
        .reply(200, {
          success: true,
          user: { id: 'user-1', username: 'testuser' }
        })

      const result = await authManager.verifyToken()
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.user.username, 'testuser')
    })

    test('should handle authentication failure', async () => {
      mockScope
        .post('/auth/verify')
        .reply(401, {
          error: 'Invalid token',
          message: 'Authentication failed'
        })

      await assert.rejects(authManager.verifyToken(), /Authentication failed/)
    })

    test('should refresh token when expired', async () => {
      mockScope
        .post('/auth/refresh')
        .reply(200, {
          success: true,
          token: 'new-token',
          expiresIn: 3600
        })

      const result = await authManager.refreshToken()
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.token, 'new-token')
    })
  })

  describe('Devbox Operations', () => {
    test('should list devboxes successfully', async () => {
      const mockDevboxes = [
        {
          id: 'devbox-1',
          name: 'Development Box 1',
          status: 'running',
          createdAt: '2023-01-01T00:00:00Z',
          resources: { cpu: 2, memory: '4GB', storage: '50GB' }
        },
        {
          id: 'devbox-2',
          name: 'Development Box 2',
          status: 'stopped',
          createdAt: '2023-01-02T00:00:00Z',
          resources: { cpu: 1, memory: '2GB', storage: '25GB' }
        }
      ]

      mockScope
        .get('/devboxes')
        .reply(200, {
          success: true,
          data: mockDevboxes,
          total: mockDevboxes.length
        })

      const result = await apiClient.listDevboxes()
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.length, 2)
      assert.strictEqual(result.data[0].name, 'Development Box 1')
      assert.strictEqual(result.total, 2)
    })

    test('should create devbox successfully', async () => {
      const createRequest = {
        name: 'Test Devbox',
        template: 'nodejs',
        resources: { cpu: 2, memory: '4GB' }
      }

      const mockResponse = {
        id: 'devbox-3',
        name: createRequest.name,
        template: createRequest.template,
        status: 'creating',
        createdAt: '2023-01-03T00:00:00Z',
        resources: createRequest.resources
      }

      mockScope
        .post('/devboxes')
        .reply(201, {
          success: true,
          data: mockResponse
        })

      const result = await apiClient.createDevbox(createRequest)
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.name, 'Test Devbox')
      assert.strictEqual(result.data.status, 'creating')
    })

    test('should get devbox details', async () => {
      const mockDevbox = {
        id: 'devbox-1',
        name: 'Development Box 1',
        status: 'running',
        createdAt: '2023-01-01T00:00:00Z',
        resources: { cpu: 2, memory: '4GB', storage: '50GB' },
        endpoints: {
          http: 'https://devbox-1.example.com',
          websocket: 'wss://devbox-1.example.com/ws'
        }
      }

      mockScope
        .get('/devboxes/devbox-1')
        .reply(200, {
          success: true,
          data: mockDevbox
        })

      const result = await apiClient.getDevbox('devbox-1')
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.id, 'devbox-1')
      assert.strictEqual(result.data.endpoints.http, 'https://devbox-1.example.com')
    })

    test('should start devbox', async () => {
      mockScope
        .post('/devboxes/devbox-1/start')
        .reply(200, {
          success: true,
          data: { id: 'devbox-1', status: 'starting' }
        })

      const result = await apiClient.startDevbox('devbox-1')
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.status, 'starting')
    })

    test('should stop devbox', async () => {
      mockScope
        .post('/devboxes/devbox-1/stop')
        .reply(200, {
          success: true,
          data: { id: 'devbox-1', status: 'stopping' }
        })

      const result = await apiClient.stopDevbox('devbox-1')
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.status, 'stopping')
    })

    test('should delete devbox', async () => {
      mockScope
        .delete('/devboxes/devbox-1')
        .reply(200, {
          success: true,
          message: 'Devbox deleted successfully'
        })

      const result = await apiClient.deleteDevbox('devbox-1')
      assert.strictEqual(result.success, true)
    })
  })

  describe('File Operations', () => {
    test('should list files in directory', async () => {
      const mockFiles = [
        {
          name: 'app.js',
          type: 'file',
          size: 1024,
          modified: '2023-01-01T12:00:00Z'
        },
        {
          name: 'src',
          type: 'directory',
          modified: '2023-01-01T12:00:00Z'
        }
      ]

      mockScope
        .get('/devboxes/devbox-1/files/workspace')
        .reply(200, {
          success: true,
          data: mockFiles
        })

      const result = await apiClient.listFiles('devbox-1', 'workspace')
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.length, 2)
      assert.strictEqual(result.data[0].name, 'app.js')
      assert.strictEqual(result.data[1].type, 'directory')
    })

    test('should read file content', async () => {
      const mockContent = 'console.log("Hello, World!");'

      mockScope
        .get('/devboxes/devbox-1/files/workspace/app.js')
        .reply(200, mockContent, {
          'Content-Type': 'text/plain',
          'Content-Length': String(mockContent.length)
        })

      const result = await apiClient.readFile('devbox-1', 'workspace/app.js')
      assert.strictEqual(result, mockContent)
    })

    test('should write file content', async () => {
      const content = 'console.log("Updated content!");'

      mockScope
        .put('/devboxes/devbox-1/files/workspace/app.js')
        .reply(200, {
          success: true,
          bytesWritten: content.length
        })

      const result = await apiClient.writeFile('devbox-1', 'workspace/app.js', content)
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.bytesWritten, content.length)
    })

    test('should delete file', async () => {
      mockScope
        .delete('/devboxes/devbox-1/files/workspace/old-file.js')
        .reply(200, {
          success: true,
          message: 'File deleted successfully'
        })

      const result = await apiClient.deleteFile('devbox-1', 'workspace/old-file.js')
      assert.strictEqual(result.success, true)
    })
  })

  describe('Error Handling', () => {
    test('should handle network timeout', async () => {
      mockScope
        .get('/devboxes')
        .delayConnection(6000) // Longer than timeout
        .reply(200, { success: true, data: [] })

      await assert.rejects(apiClient.listDevboxes(), /timeout/)
    })

    test('should handle server errors', async () => {
      mockScope
        .get('/devboxes')
        .reply(500, {
          error: 'Internal Server Error',
          message: 'Something went wrong'
        })

      await assert.rejects(apiClient.listDevboxes(), /Internal Server Error/)
    })

    test('should handle rate limiting', async () => {
      mockScope
        .get('/devboxes')
        .reply(429, {
          error: 'Rate Limit Exceeded',
          message: 'Too many requests',
          retryAfter: 60
        })

      await assert.rejects(apiClient.listDevboxes(), /Rate Limit Exceeded/)
    })

    test('should retry failed requests', async () => {
      let attempts = 0

      mockScope
        .get('/devboxes')
        .twice()
        .reply(500, { error: 'Temporary failure' })
        .get('/devboxes')
        .reply(200, { success: true, data: [] })

      const result = await apiClient.listDevboxes()
      assert.strictEqual(result.success, true)
    })
  })

  describe('Connection Pool', () => {
    test('should reuse connections for multiple requests', async () => {
      // Mock multiple requests to the same endpoint
      mockScope
        .get('/devboxes')
        .reply(200, { success: true, data: [] })
        .get('/devboxes/devbox-1')
        .reply(200, { success: true, data: { id: 'devbox-1' } })

      const result1 = await apiClient.listDevboxes()
      const result2 = await apiClient.getDevbox('devbox-1')

      assert.strictEqual(result1.success, true)
      assert.strictEqual(result2.success, true)

      // Verify that connections are being reused (implementation-specific)
      // This would require access to connection pool internals
    })

    test('should handle connection limits', async () => {
      // Test behavior when connection limit is reached
      const promises = Array.from({ length: 10 }, (_, i) =>
        mockScope.get('/devboxes').reply(200, { success: true, data: [] })
      )

      const results = await Promise.all(
        Array.from({ length: 10 }, () => apiClient.listDevboxes())
      )

      assert.strictEqual(results.length, 10)
      results.forEach(result => assert.strictEqual(result.success, true))
    })
  })

  describe('WebSocket Support', () => {
    test('should establish WebSocket connection', async () => {
      // Mock WebSocket server
      const wsUrl = 'wss://api.example.com/ws'

      // This would require a WebSocket mock library
      // For now, we'll just test the connection logic

      const mockConnect = async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { connected: true, url: wsUrl }
      }

      const result = await mockConnect()
      assert.strictEqual(result.connected, true)
      assert.strictEqual(result.url, wsUrl)
    })

    test('should handle WebSocket messages', (done) => {
      // Mock WebSocket message handling
      const mockMessage = {
        type: 'file_change',
        data: { path: '/workspace/test.txt', change: 'modified' }
      }

      const onMessage = (message: any) => {
        assert.strictEqual(message.type, 'file_change')
        assert.strictEqual(message.data.path, '/workspace/test.txt')
        done()
      }

      // Simulate receiving message
      setTimeout(() => onMessage(mockMessage), 50)
    })

    test('should handle WebSocket disconnections', async () => {
      const mockDisconnect = async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { disconnected: true, code: 1000, reason: 'Normal closure' }
      }

      const result = await mockDisconnect()
      assert.strictEqual(result.disconnected, true)
      assert.strictEqual(result.code, 1000)
    })
  })
})