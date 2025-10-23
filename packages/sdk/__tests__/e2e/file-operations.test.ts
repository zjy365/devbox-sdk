import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { DevboxSDK } from '../../src/core/DevboxSDK'
import { DevboxConfig } from '../../src/core/types'
import nock from 'nock'
import { WebSocket } from 'ws'

describe('End-to-End File Operations Tests', () => {
  let sdk: DevboxSDK
  let mockScope: nock.Scope
  let mockWebSocket: any

  beforeEach(() => {
    mockScope = nock('https://api.devbox.example.com')

    const config: DevboxConfig = {
      apiEndpoint: 'https://api.devbox.example.com',
      authToken: 'test-auth-token',
      timeout: 10000,
      retryAttempts: 3
    }

    sdk = new DevboxSDK(config)
  })

  afterEach(() => {
    nock.cleanAll()
    if (sdk) {
      sdk.disconnect()
    }
    if (mockWebSocket) {
      mockWebSocket.close()
    }
  })

  describe('Complete File Workflow', () => {
    test('should create, read, update, and delete files', async () => {
      const devboxId = 'test-devbox-1'
      const filePath = '/workspace/test.txt'
      const initialContent = 'Hello, World!'
      const updatedContent = 'Hello, Updated World!'

      // Mock devbox creation
      mockScope
        .post('/devboxes')
        .reply(201, {
          success: true,
          data: {
            id: devboxId,
            name: 'Test Devbox',
            status: 'creating',
            endpoints: {
              http: `https://${devboxId}.devbox.example.com`,
              websocket: `wss://${devboxId}.devbox.example.com/ws`
            }
          }
        })

      // Mock devbox status check
      mockScope
        .get(`/devboxes/${devboxId}`)
        .reply(200, {
          success: true,
          data: {
            id: devboxId,
            status: 'running',
            endpoints: {
              http: `https://${devboxId}.devbox.example.com`,
              websocket: `wss://${devboxId}.devbox.example.com/ws`
            }
          }
        })

      // Mock file write (create)
      mockScope
        .put(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, {
          success: true,
          bytesWritten: initialContent.length
        })

      // Mock file read
      mockScope
        .get(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, initialContent, {
          'Content-Type': 'text/plain',
          'Content-Length': String(initialContent.length)
        })

      // Mock file update
      mockScope
        .put(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, {
          success: true,
          bytesWritten: updatedContent.length
        })

      // Mock file read after update
      mockScope
        .get(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, updatedContent, {
          'Content-Type': 'text/plain',
          'Content-Length': String(updatedContent.length)
        })

      // Mock file delete
      mockScope
        .delete(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, {
          success: true,
          message: 'File deleted successfully'
        })

      // Mock file read after delete (should fail)
      mockScope
        .get(`/devboxes/${devboxId}/files${filePath}`)
        .reply(404, {
          error: 'File not found',
          message: 'The requested file does not exist'
        })

      // Execute the complete workflow
      const devbox = await sdk.createDevbox({
        name: 'Test Devbox',
        template: 'nodejs',
        resources: { cpu: 1, memory: '2GB' }
      })

      assert.strictEqual(devbox.id, devboxId)

      // Wait for devbox to be ready
      let ready = false
      while (!ready) {
        const status = await sdk.getDevbox(devboxId)
        if (status.data.status === 'running') {
          ready = true
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Create file
      const writeResult = await sdk.writeFile(devboxId, filePath, initialContent)
      assert.strictEqual(writeResult.success, true)
      assert.strictEqual(writeResult.bytesWritten, initialContent.length)

      // Read file
      const readContent = await sdk.readFile(devboxId, filePath)
      assert.strictEqual(readContent, initialContent)

      // Update file
      const updateResult = await sdk.writeFile(devboxId, filePath, updatedContent)
      assert.strictEqual(updateResult.success, true)
      assert.strictEqual(updateResult.bytesWritten, updatedContent.length)

      // Read updated file
      const updatedReadContent = await sdk.readFile(devboxId, filePath)
      assert.strictEqual(updatedReadContent, updatedContent)

      // Delete file
      const deleteResult = await sdk.deleteFile(devboxId, filePath)
      assert.strictEqual(deleteResult.success, true)

      // Verify file is deleted
      await assert.rejects(
        sdk.readFile(devboxId, filePath),
        /File not found/
      )

      // Clean up devbox
      await sdk.deleteDevbox(devboxId)
    })

    test('should handle large file operations', async () => {
      const devboxId = 'test-devbox-2'
      const filePath = '/workspace/large-file.txt'
      const largeContent = 'x'.repeat(1024 * 1024) // 1MB file

      // Mock devbox setup
      mockScope
        .get(`/devboxes/${devboxId}`)
        .reply(200, {
          success: true,
          data: {
            id: devboxId,
            status: 'running',
            endpoints: {
              http: `https://${devboxId}.devbox.example.com`,
              websocket: `wss://${devboxId}.devbox.example.com/ws`
            }
          }
        })

      // Mock large file upload with streaming
      mockScope
        .put(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, {
          success: true,
          bytesWritten: largeContent.length,
          streamed: true
        })

      // Mock large file download with streaming
      mockScope
        .get(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, largeContent, {
          'Content-Type': 'text/plain',
          'Content-Length': String(largeContent.length),
          'Accept-Ranges': 'bytes'
        })

      const startTime = Date.now()

      // Upload large file
      const uploadResult = await sdk.writeFile(devboxId, filePath, largeContent)
      assert.strictEqual(uploadResult.success, true)
      assert.strictEqual(uploadResult.bytesWritten, largeContent.length)

      const uploadTime = Date.now() - startTime

      // Download large file
      const downloadStart = Date.now()
      const downloadedContent = await sdk.readFile(devboxId, filePath)
      const downloadTime = Date.now() - downloadStart

      assert.strictEqual(downloadedContent.length, largeContent.length)
      assert.strictEqual(downloadedContent, largeContent)

      // Performance assertions
      assert(uploadTime < 10000, `Upload took ${uploadTime}ms, expected < 10000ms`)
      assert(downloadTime < 10000, `Download took ${downloadTime}ms, expected < 10000ms`)

      console.log(`Large file upload: ${uploadTime}ms, download: ${downloadTime}ms`)
    })
  })

  describe('Directory Operations', () => {
    test('should create and navigate directories', async () => {
      const devboxId = 'test-devbox-3'
      const dirPath = '/workspace/test-project/src/components'

      // Mock devbox status
      mockScope
        .get(`/devboxes/${devboxId}`)
        .reply(200, {
          success: true,
          data: {
            id: devboxId,
            status: 'running',
            endpoints: {
              http: `https://${devboxId}.devbox.example.com`
            }
          }
        })

      // Mock directory creation
      mockScope
        .post(`/devboxes/${devboxId}/files${dirPath}/mkdir`)
        .reply(200, {
          success: true,
          path: dirPath
        })

      // Mock directory listing
      mockScope
        .get(`/devboxes/${devboxId}/files/workspace/test-project`)
        .reply(200, {
          success: true,
          data: [
            { name: 'src', type: 'directory', modified: '2023-01-01T12:00:00Z' },
            { name: 'package.json', type: 'file', size: 256, modified: '2023-01-01T12:00:00Z' }
          ]
        })

      // Mock subdirectory listing
      mockScope
        .get(`/devboxes/${devboxId}/files${dirPath}`)
        .reply(200, {
          success: true,
          data: [
            { name: 'Button.jsx', type: 'file', size: 1024, modified: '2023-01-01T12:00:00Z' },
            { name: 'Input.jsx', type: 'file', size: 768, modified: '2023-01-01T12:00:00Z' }
          ]
        })

      // Create directory structure
      const createResult = await sdk.createDirectory(devboxId, dirPath)
      assert.strictEqual(createResult.success, true)
      assert.strictEqual(createResult.path, dirPath)

      // List parent directory
      const parentListing = await sdk.listFiles(devboxId, '/workspace/test-project')
      assert.strictEqual(parentListing.success, true)
      assert.strictEqual(parentListing.data.length, 2)
      assert.strictEqual(parentListing.data[0].name, 'src')
      assert.strictEqual(parentListing.data[0].type, 'directory')

      // List created directory
      const dirListing = await sdk.listFiles(devboxId, dirPath)
      assert.strictEqual(dirListing.success, true)
      assert.strictEqual(dirListing.data.length, 2)
      assert.strictEqual(dirListing.data[0].name, 'Button.jsx')
      assert.strictEqual(dirListing.data[0].type, 'file')
    })

    test('should handle batch file operations', async () => {
      const devboxId = 'test-devbox-4'
      const files = [
        { path: '/workspace/project/src/app.js', content: 'console.log("app");' },
        { path: '/workspace/project/src/utils.js', content: 'export function helper() {}' },
        { path: '/workspace/project/src/config.json', content: '{"name": "test"}' }
      ]

      // Mock devbox status
      mockScope
        .get(`/devboxes/${devboxId}`)
        .reply(200, {
          success: true,
          data: {
            id: devboxId,
            status: 'running',
            endpoints: {
              http: `https://${devboxId}.devbox.example.com`
            }
          }
        })

      // Mock batch file operations
      files.forEach(file => {
        mockScope
          .put(`/devboxes/${devboxId}/files${file.path}`)
          .reply(200, {
            success: true,
            bytesWritten: file.content.length
          })

        mockScope
          .get(`/devboxes/${devboxId}/files${file.path}`)
          .reply(200, file.content, {
            'Content-Type': 'text/plain',
            'Content-Length': String(file.content.length)
          })
      })

      // Mock directory listing after all files are created
      mockScope
        .get(`/devboxes/${devboxId}/files/workspace/project/src`)
        .reply(200, {
          success: true,
          data: files.map(file => ({
            name: file.path.split('/').pop(),
            type: 'file',
            size: file.content.length,
            modified: '2023-01-01T12:00:00Z'
          }))
        })

      // Execute batch operations
      const startTime = Date.now()

      const writePromises = files.map(file =>
        sdk.writeFile(devboxId, file.path, file.content)
      )

      const writeResults = await Promise.all(writePromises)
      writeResults.forEach((result, index) => {
        assert.strictEqual(result.success, true)
        assert.strictEqual(result.bytesWritten, files[index].content.length)
      })

      const writeTime = Date.now() - startTime

      // Read all files back
      const readPromises = files.map(file =>
        sdk.readFile(devboxId, file.path)
      )

      const readResults = await Promise.all(readPromises)
      readResults.forEach((content, index) => {
        assert.strictEqual(content, files[index].content)
      })

      // Verify directory listing
      const listing = await sdk.listFiles(devboxId, '/workspace/project/src')
      assert.strictEqual(listing.success, true)
      assert.strictEqual(listing.data.length, files.length)

      console.log(`Batch operations: ${writeTime}ms for ${files.length} files`)
    })
  })

  describe('Real-time File Watching', () => {
    test('should watch file changes via WebSocket', (done) => {
      const devboxId = 'test-devbox-5'
      const filePath = '/workspace/watched.txt'
      const watchPath = '/workspace'

      // Mock devbox status
      mockScope
        .get(`/devboxes/${devboxId}`)
        .reply(200, {
          success: true,
          data: {
            id: devboxId,
            status: 'running',
            endpoints: {
              http: `https://${devboxId}.devbox.example.com`,
              websocket: `wss://${devboxId}.devbox.example.com/ws`
            }
          }
        })

      // Mock WebSocket connection
      let mockWsServer: any = {
        clients: new Set(),
        emit(event: string, data: any) {
          this.clients.forEach((client: any) => {
            if (client.emit) {
              client.emit(event, data)
            }
          })
        }
      }

      // Mock WebSocket
      global.WebSocket = class MockWebSocket {
        url: string
        onopen: ((event: any) => void) | null = null
        onmessage: ((event: any) => void) | null = null
        onclose: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null

        constructor(url: string) {
          this.url = url
          mockWsServer.clients.add(this)

          // Simulate successful connection
          setTimeout(() => {
            if (this.onopen) {
              this.onopen({ type: 'open' })
            }
          }, 50)
        }

        send(data: string) {
          // Mock sending data
        }

        close() {
          mockWsServer.clients.delete(this)
          if (this.onclose) {
            this.onclose({ type: 'close' })
          }
        }
      } as any

      let changeEvents: any[] = []

      // Start watching
      sdk.watchFiles(devboxId, watchPath, {
        patterns: ['*.txt'],
        onFileChange: (event) => {
          changeEvents.push(event)

          if (changeEvents.length === 3) {
            // Verify all expected events were received
            assert.strictEqual(changeEvents[0].type, 'created')
            assert.strictEqual(changeEvents[0].path, filePath)

            assert.strictEqual(changeEvents[1].type, 'modified')
            assert.strictEqual(changeEvents[1].path, filePath)

            assert.strictEqual(changeEvents[2].type, 'deleted')
            assert.strictEqual(changeEvents[2].path, filePath)

            done()
          }
        }
      }).then(() => {
        // Simulate file change events
        setTimeout(() => {
          mockWsServer.emit('message', JSON.stringify({
            type: 'file_change',
            event: { type: 'created', path: filePath, timestamp: Date.now() }
          }))
        }, 100)

        setTimeout(() => {
          mockWsServer.emit('message', JSON.stringify({
            type: 'file_change',
            event: { type: 'modified', path: filePath, timestamp: Date.now() }
          }))
        }, 200)

        setTimeout(() => {
          mockWsServer.emit('message', JSON.stringify({
            type: 'file_change',
            event: { type: 'deleted', path: filePath, timestamp: Date.now() }
          }))
        }, 300)
      })
    })

    test('should handle WebSocket disconnections and reconnections', (done) => {
      const devboxId = 'test-devbox-6'
      let reconnectionAttempts = 0

      // Mock devbox status
      mockScope
        .get(`/devboxes/${devboxId}`)
        .reply(200, {
          success: true,
          data: {
            id: devboxId,
            status: 'running',
            endpoints: {
              websocket: `wss://${devboxId}.devbox.example.com/ws`
            }
          }
        })

      // Mock WebSocket with disconnection simulation
      global.WebSocket = class MockWebSocket {
        url: string
        onopen: ((event: any) => void) | null = null
        onmessage: ((event: any) => void) | null = null
        onclose: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null

        constructor(url: string) {
          this.url = url

          // Simulate connection then disconnection
          setTimeout(() => {
            if (this.onopen) {
              this.onopen({ type: 'open' })
            }

            // Simulate disconnection after 100ms
            setTimeout(() => {
              if (this.onclose) {
                this.onclose({ type: 'close', code: 1006, reason: 'Connection lost' })
              }
              reconnectionAttempts++
            }, 100)
          }, 50)
        }

        send(data: string) {}
        close() {}
      } as any

      // Start watching with reconnection handling
      sdk.watchFiles(devboxId, '/workspace', {
        reconnect: true,
        maxReconnectAttempts: 3,
        onReconnect: (attempt) => {
          assert(attempt <= 3)
          if (attempt === 3) {
            assert.strictEqual(reconnectionAttempts, 3)
            done()
          }
        }
      })
    })
  })

  describe('Error Recovery', () => {
    test('should recover from network interruptions during file operations', async () => {
      const devboxId = 'test-devbox-7'
      const filePath = '/workspace/resilient.txt'
      const content = 'This content should survive network issues'

      let attemptCount = 0

      // Mock devbox status
      mockScope
        .get(`/devboxes/${devboxId}`)
        .reply(200, {
          success: true,
          data: {
            id: devboxId,
            status: 'running',
            endpoints: {
              http: `https://${devboxId}.devbox.example.com`
            }
          }
        })

      // Mock initial failures followed by success
      mockScope
        .put(`/devboxes/${devboxId}/files${filePath}`)
        .reply(() => {
          attemptCount++
          if (attemptCount <= 2) {
            return [500, { error: 'Network error' }]
          }
          return [200, { success: true, bytesWritten: content.length }]
        })

      // Mock file read after successful write
      mockScope
        .get(`/devboxes/${devboxId}/files${filePath}`)
        .reply(200, content, {
          'Content-Type': 'text/plain',
          'Content-Length': String(content.length)
        })

      // Execute resilient file write
      const writeResult = await sdk.writeFile(devboxId, filePath, content, {
        retryAttempts: 5,
        retryDelay: 100
      })

      assert.strictEqual(writeResult.success, true)
      assert.strictEqual(attemptCount, 3) // Failed twice, succeeded on third try

      // Verify file content
      const readContent = await sdk.readFile(devboxId, filePath)
      assert.strictEqual(readContent, content)
    })
  })
})