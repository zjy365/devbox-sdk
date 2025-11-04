import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { ConnectionManager } from '../../src/connection/manager'
import { ConnectionPool } from '../../src/connection/pool'
import nock from 'nock'

describe('Connection Pool Tests', () => {
  let connectionManager: ConnectionManager
  let connectionPool: ConnectionPool
  let mockServer: any

  beforeEach(() => {
    // Set up mock HTTP server
    mockServer = nock('https://test-server.com')

    connectionPool = new ConnectionPool({
      maxConnections: 5,
      maxIdleTime: 30000,
      healthCheckInterval: 10000,
      retryAttempts: 3,
      timeout: 5000,
    })

    connectionManager = new ConnectionManager({
      baseURL: 'https://test-server.com',
      pool: connectionPool,
    })
  })

  afterEach(() => {
    nock.cleanAll()
    if (connectionManager) {
      connectionManager.disconnect()
    }
    if (connectionPool) {
      connectionPool.clear()
    }
  })

  describe('Connection Pool Management', () => {
    test('should create connection pool with default settings', () => {
      const pool = new ConnectionPool()
      assert(pool instanceof ConnectionPool)
      assert.strictEqual(pool.getStats().maxConnections, 10) // Default value
    })

    test('should create connection pool with custom settings', () => {
      const customPool = new ConnectionPool({
        maxConnections: 3,
        maxIdleTime: 60000,
        healthCheckInterval: 15000,
      })

      assert.strictEqual(customPool.getStats().maxConnections, 3)
    })

    test('should acquire connection from pool', async () => {
      mockServer.get('/test').reply(200, { success: true })

      const connection = await connectionPool.acquire()
      assert(connection !== null)
      assert.strictEqual(typeof connection.id, 'string')
      assert.strictEqual(connection.inUse, false)

      // Release connection back to pool
      connectionPool.release(connection)
    })

    test('should reuse idle connections', async () => {
      mockServer.get('/test1').reply(200, { success: true })
      mockServer.get('/test2').reply(200, { success: true })

      // Acquire first connection
      const connection1 = await connectionPool.acquire()
      const connectionId = connection1.id

      // Release connection
      connectionPool.release(connection1)

      // Acquire again (should reuse the same connection)
      const connection2 = await connectionPool.acquire()
      assert.strictEqual(connection2.id, connectionId)

      connectionPool.release(connection2)
    })

    test('should create new connection when pool is empty', async () => {
      mockServer.get('/test').reply(200, { success: true })

      // Fill up the pool
      const connections = []
      for (let i = 0; i < 5; i++) {
        const connection = await connectionPool.acquire()
        connections.push(connection)
      }

      // All connections should be in use
      assert.strictEqual(connectionPool.getStats().activeConnections, 5)
      assert.strictEqual(connectionPool.getStats().idleConnections, 0)

      // Release all connections
      connections.forEach(conn => connectionPool.release(conn))
    })

    test('should respect max connections limit', async () => {
      mockServer.get('/test').reply(200, { success: true })

      const connections = []

      // Acquire up to max connections
      for (let i = 0; i < 5; i++) {
        const connection = await connectionPool.acquire()
        connections.push(connection)
      }

      // Try to acquire one more (should return null or wait)
      const extraConnection = await connectionPool.acquire()
      assert.strictEqual(extraConnection, null)

      // Release connections
      connections.forEach(conn => connectionPool.release(conn))
    })
  })

  describe('Connection Health Checks', () => {
    test('should perform health checks on idle connections', async () => {
      mockServer.get('/health').reply(200, { status: 'healthy' })

      const connection = await connectionPool.acquire()
      connectionPool.release(connection)

      // Wait for health check interval
      await new Promise(resolve => setTimeout(resolve, 100))

      const stats = connectionPool.getStats()
      assert.strictEqual(stats.healthyConnections, 1)
    })

    test('should remove unhealthy connections', async () => {
      mockServer.get('/health').reply(500, { error: 'Unhealthy' })

      const connection = await connectionPool.acquire()
      connectionPool.release(connection)

      // Wait for health check
      await new Promise(resolve => setTimeout(resolve, 100))

      const stats = connectionPool.getStats()
      assert.strictEqual(stats.healthyConnections, 0)
    })

    test('should mark connections as unhealthy on errors', async () => {
      mockServer.get('/test').replyWithError('Connection refused')

      const connection = await connectionPool.acquire()

      // Simulate connection error
      connection.healthy = false

      connectionPool.release(connection)

      const stats = connectionPool.getStats()
      assert.strictEqual(stats.healthyConnections, 0)
    })
  })

  describe('Connection Lifecycle', () => {
    test('should track connection age', async () => {
      const connection = await connectionPool.acquire()
      const createdAt = connection.createdAt

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100))

      const age = Date.now() - createdAt
      assert(age >= 100)

      connectionPool.release(connection)
    })

    test('should track last used timestamp', async () => {
      const connection = await connectionPool.acquire()
      connectionPool.release(connection)

      const lastUsed = connection.lastUsed
      const now = Date.now()

      assert(now - lastUsed < 1000) // Should be very recent
    })

    test('should close old connections', async () => {
      const oldPool = new ConnectionPool({
        maxIdleTime: 50, // Very short idle time
      })

      const connection = await oldPool.acquire()
      oldPool.release(connection)

      // Wait for connection to become old
      await new Promise(resolve => setTimeout(resolve, 100))

      // Trigger cleanup
      oldPool.cleanup()

      const stats = oldPool.getStats()
      assert.strictEqual(stats.totalConnections, 0)
    })
  })

  describe('Connection Manager Integration', () => {
    test('should use connection pool for requests', async () => {
      mockServer.get('/api/test').reply(200, { data: 'test' })

      const response = await connectionManager.request('/test')
      assert.strictEqual(response.data, 'test')

      const stats = connectionPool.getStats()
      assert(stats.totalConnections >= 1)
    })

    test('should handle concurrent requests with connection pooling', async () => {
      mockServer.get('/api/test1').reply(200, { data: 'test1' })
      mockServer.get('/api/test2').reply(200, { data: 'test2' })
      mockServer.get('/api/test3').reply(200, { data: 'test3' })

      const promises = [
        connectionManager.request('/test1'),
        connectionManager.request('/test2'),
        connectionManager.request('/test3'),
      ]

      const results = await Promise.all(promises)
      assert.strictEqual(results.length, 3)
      assert.strictEqual(results[0].data, 'test1')
      assert.strictEqual(results[1].data, 'test2')
      assert.strictEqual(results[2].data, 'test3')
    })

    test('should retry failed requests with new connections', async () => {
      const attempts = 0

      mockServer
        .get('/api/retry')
        .twice()
        .reply(500, { error: 'Server error' })
        .get('/api/retry')
        .reply(200, { data: 'success' })

      const response = await connectionManager.request('/retry')
      assert.strictEqual(response.data, 'success')
    })
  })

  describe('Performance and Load Testing', () => {
    test('should handle high request volume', async () => {
      // Mock many successful responses
      for (let i = 0; i < 50; i++) {
        mockServer.get(`/api/load/${i}`).reply(200, { data: `response-${i}` })
      }

      const startTime = Date.now()
      const promises = Array.from({ length: 50 }, (_, i) => connectionManager.request(`/load/${i}`))

      const results = await Promise.all(promises)
      const duration = Date.now() - startTime

      assert.strictEqual(results.length, 50)
      results.forEach((result, i) => {
        assert.strictEqual(result.data, `response-${i}`)
      })

      // Should complete within reasonable time
      assert(duration < 5000, `Requests took ${duration}ms, expected < 5000ms`)

      const stats = connectionPool.getStats()
      assert(stats.totalConnections <= 5) // Should not exceed max connections
    })

    test('should maintain performance under sustained load', async () => {
      const requestCount = 100
      const batchSize = 10

      // Mock responses
      for (let i = 0; i < requestCount; i++) {
        mockServer.get(`/api/sustained/${i}`).reply(200, { data: `data-${i}` })
      }

      const durations: number[] = []

      for (let batch = 0; batch < requestCount / batchSize; batch++) {
        const startTime = Date.now()

        const promises = Array.from({ length: batchSize }, (_, i) => {
          const index = batch * batchSize + i
          return connectionManager.request(`/sustained/${index}`)
        })

        await Promise.all(promises)
        durations.push(Date.now() - startTime)
      }

      // Performance should not degrade significantly
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const maxDuration = Math.max(...durations)

      assert(avgDuration < 2000, `Average batch time: ${avgDuration}ms`)
      assert(
        maxDuration < avgDuration * 2,
        `Max batch time: ${maxDuration}ms, avg: ${avgDuration}ms`
      )
    })
  })

  describe('Error Handling and Recovery', () => {
    test('should handle connection timeouts', async () => {
      mockServer
        .get('/api/timeout')
        .delayConnection(10000) // Longer than timeout
        .reply(200, { data: 'late response' })

      await assert.rejects(connectionManager.request('/timeout'), /timeout/)
    })

    test('should handle connection resets', async () => {
      mockServer.get('/api/reset').replyWithError('Connection reset by peer')

      await assert.rejects(connectionManager.request('/reset'), /Connection reset/)
    })

    test('should recover from connection failures', async () => {
      let failureCount = 0

      mockServer.get('/api/recover').reply(() => {
        failureCount++
        if (failureCount <= 2) {
          return [500, { error: 'Temporary failure' }]
        }
        return [200, { data: 'recovered' }]
      })

      const response = await connectionManager.request('/recover')
      assert.strictEqual(response.data, 'recovered')
      assert.strictEqual(failureCount, 3)
    })

    test('should handle malformed responses', async () => {
      mockServer.get('/api/malformed').reply(200, 'invalid json response', {
        'Content-Type': 'application/json',
      })

      await assert.rejects(connectionManager.request('/malformed'), /Invalid JSON/)
    })
  })

  describe('Statistics and Monitoring', () => {
    test('should provide accurate connection statistics', async () => {
      mockServer.get('/api/stats').reply(200, { data: 'stats' })

      const initialStats = connectionPool.getStats()
      assert.strictEqual(initialStats.totalConnections, 0)
      assert.strictEqual(initialStats.activeConnections, 0)
      assert.strictEqual(initialStats.idleConnections, 0)

      // Acquire a connection
      const connection = await connectionPool.acquire()
      const activeStats = connectionPool.getStats()
      assert.strictEqual(activeStats.activeConnections, 1)
      assert.strictEqual(activeStats.idleConnections, 0)

      // Release connection
      connectionPool.release(connection)
      const idleStats = connectionPool.getStats()
      assert.strictEqual(idleStats.activeConnections, 0)
      assert.strictEqual(idleStats.idleConnections, 1)
    })

    test('should track request metrics', async () => {
      mockServer.get('/api/metrics').reply(200, { data: 'metrics' })

      await connectionManager.request('/metrics')
      await connectionManager.request('/metrics')
      await connectionManager.request('/metrics')

      const metrics = connectionManager.getMetrics()
      assert.strictEqual(metrics.totalRequests, 3)
      assert.strictEqual(metrics.successfulRequests, 3)
      assert.strictEqual(metrics.failedRequests, 0)
      assert(metrics.averageResponseTime > 0)
    })

    test('should track error rates', async () => {
      mockServer.get('/api/error1').reply(500, { error: 'Server error' })
      mockServer.get('/api/error2').reply(404, { error: 'Not found' })
      mockServer.get('/api/success').reply(200, { data: 'success' })

      await assert.rejects(connectionManager.request('/error1'))
      await assert.rejects(connectionManager.request('/error2'))
      await connectionManager.request('/success')

      const metrics = connectionManager.getMetrics()
      assert.strictEqual(metrics.totalRequests, 3)
      assert.strictEqual(metrics.successfulRequests, 1)
      assert.strictEqual(metrics.failedRequests, 2)
      assert.strictEqual(metrics.errorRate, 2 / 3)
    })
  })
})
