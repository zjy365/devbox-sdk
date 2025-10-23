import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { performance } from 'perf_hooks'
import { DevboxSDK } from '../../src/core/DevboxSDK'
import { ConnectionManager } from '../../src/connection/manager'
import { ConnectionPool } from '../../src/connection/pool'
import nock from 'nock'

describe('Performance Benchmarks', () => {
  let sdk: DevboxSDK
  let connectionManager: ConnectionManager
  let connectionPool: ConnectionPool
  let mockScope: nock.Scope

  beforeEach(() => {
    mockScope = nock('https://bench.devbox.example.com')

    connectionPool = new ConnectionPool({
      maxConnections: 10,
      maxIdleTime: 60000,
      healthCheckInterval: 30000
    })

    connectionManager = new ConnectionManager({
      baseURL: 'https://bench.devbox.example.com',
      pool: connectionPool,
      timeout: 30000
    })

    sdk = new DevboxSDK({
      apiEndpoint: 'https://bench.devbox.example.com',
      authToken: 'benchmark-token',
      timeout: 30000,
      retryAttempts: 1 // Minimize retries for benchmarking
    })
  })

  afterEach(() => {
    nock.cleanAll()
    if (sdk) {
      sdk.disconnect()
    }
    if (connectionManager) {
      connectionManager.disconnect()
    }
    if (connectionPool) {
      connectionPool.clear()
    }
  })

  describe('API Performance', () => {
    test('should handle 1000 concurrent API calls within acceptable time', async () => {
      const requestCount = 1000
      const acceptableTimePerRequest = 100 // ms
      const totalTimeLimit = requestCount * acceptableTimePerRequest

      // Mock successful responses
      for (let i = 0; i < requestCount; i++) {
        mockScope.get(`/api/benchmark/${i}`).reply(200, {
          success: true,
          data: { id: i, timestamp: Date.now() }
        })
      }

      const startTime = performance.now()

      // Execute concurrent requests
      const promises = Array.from({ length: requestCount }, (_, i) =>
        sdk.request(`/benchmark/${i}`)
      )

      const results = await Promise.all(promises)
      const endTime = performance.now()
      const totalTime = endTime - startTime
      const avgTimePerRequest = totalTime / requestCount

      // Verify all requests succeeded
      assert.strictEqual(results.length, requestCount)
      results.forEach((result, i) => {
        assert.strictEqual(result.success, true)
        assert.strictEqual(result.data.id, i)
      })

      // Performance assertions
      assert(avgTimePerRequest < acceptableTimePerRequest,
        `Average time per request: ${avgTimePerRequest.toFixed(2)}ms, expected < ${acceptableTimePerRequest}ms`)
      assert(totalTime < totalTimeLimit,
        `Total time: ${totalTime.toFixed(2)}ms, expected < ${totalTimeLimit}ms`)

      console.log(`API Performance: ${requestCount} requests in ${totalTime.toFixed(2)}ms (${avgTimePerRequest.toFixed(2)}ms per request)`)
    })

    test('should maintain performance with sustained load', async () => {
      const batches = 10
      const requestsPerBatch = 100
      const acceptableResponseTime = 200 // ms
      const performanceDegradationThreshold = 1.5 // 50% increase acceptable

      const batchTimes: number[] = []

      // Mock responses for all batches
      for (let batch = 0; batch < batches; batch++) {
        for (let i = 0; i < requestsPerBatch; i++) {
          const requestId = batch * requestsPerBatch + i
          mockScope.get(`/api/sustained/${requestId}`).reply(200, {
            success: true,
            data: { id: requestId, batch }
          })
        }
      }

      // Execute batches sequentially
      for (let batch = 0; batch < batches; batch++) {
        const startTime = performance.now()

        const promises = Array.from({ length: requestsPerBatch }, (_, i) => {
          const requestId = batch * requestsPerBatch + i
          return sdk.request(`/sustained/${requestId}`)
        })

        await Promise.all(promises)

        const endTime = performance.now()
        const batchTime = endTime - startTime
        batchTimes.push(batchTime)

        // Check if performance is degrading significantly
        if (batch > 0) {
          const avgTime = batchTimes.slice(0, batch).reduce((a, b) => a + b, 0) / batch
          const degradationRatio = batchTime / avgTime

          assert(degradationRatio < performanceDegradationThreshold,
            `Performance degradation detected: batch ${batch} took ${batchTime.toFixed(2)}ms, ${degradationRatio.toFixed(2)}x slower than average`)
        }
      }

      const avgBatchTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length
      const maxBatchTime = Math.max(...batchTimes)

      assert(avgBatchTime < acceptableResponseTime,
        `Average batch time: ${avgBatchTime.toFixed(2)}ms, expected < ${acceptableResponseTime}ms`)

      console.log(`Sustained Load: ${batches} batches, avg: ${avgBatchTime.toFixed(2)}ms, max: ${maxBatchTime.toFixed(2)}ms`)
    })
  })

  describe('File Operation Performance', () => {
    test('should handle large file transfers efficiently', async () => {
      const fileSizes = [
        { name: 'Small', size: 1024 * 10 },      // 10KB
        { name: 'Medium', size: 1024 * 1024 },   // 1MB
        { name: 'Large', size: 1024 * 1024 * 10 } // 10MB
      ]

      const throughputThreshold = 1024 * 1024 // 1MB/s minimum throughput

      for (const { name, size } of fileSizes) {
        const content = 'x'.repeat(size)
        const filePath = `/workspace/test-${name.toLowerCase()}.txt`

        // Mock file operations
        mockScope
          .put(`/devboxes/bench-devbox-1/files${filePath}`)
          .reply(200, {
            success: true,
            bytesWritten: content.length
          })

        mockScope
          .get(`/devboxes/bench-devbox-1/files${filePath}`)
          .reply(200, content, {
            'Content-Type': 'text/plain',
            'Content-Length': String(content.length)
          })

        // Benchmark upload
        const uploadStart = performance.now()
        const uploadResult = await sdk.writeFile('bench-devbox-1', filePath, content)
        const uploadEnd = performance.now()
        const uploadTime = uploadEnd - uploadStart

        // Benchmark download
        const downloadStart = performance.now()
        const downloadedContent = await sdk.readFile('bench-devbox-1', filePath)
        const downloadEnd = performance.now()
        const downloadTime = downloadEnd - downloadStart

        // Calculate throughput
        const uploadThroughput = (content.length / 1024 / 1024) / (uploadTime / 1000) // MB/s
        const downloadThroughput = (content.length / 1024 / 1024) / (downloadTime / 1000) // MB/s

        // Verify results
        assert.strictEqual(uploadResult.success, true)
        assert.strictEqual(downloadedContent.length, content.length)
        assert.strictEqual(downloadedContent, content)

        // Performance assertions
        assert(uploadThroughput > throughputThreshold,
          `${name} file upload throughput: ${uploadThroughput.toFixed(2)}MB/s, expected > ${throughputThreshold}MB/s`)
        assert(downloadThroughput > throughputThreshold,
          `${name} file download throughput: ${downloadThroughput.toFixed(2)}MB/s, expected > ${throughputThreshold}MB/s`)

        console.log(`${name} File (${(size / 1024 / 1024).toFixed(2)}MB): Upload ${uploadThroughput.toFixed(2)}MB/s, Download ${downloadThroughput.toFixed(2)}MB/s`)
      }
    })

    test('should handle concurrent file operations efficiently', async () => {
      const fileCount = 50
      const fileSize = 1024 * 10 // 10KB per file
      const acceptableAvgTime = 500 // ms per operation

      // Mock file operations for all files
      for (let i = 0; i < fileCount; i++) {
        const content = 'x'.repeat(fileSize)
        const filePath = `/workspace/concurrent-${i}.txt`

        mockScope
          .put(`/devboxes/bench-devbox-2/files${filePath}`)
          .reply(200, {
            success: true,
            bytesWritten: content.length
          })

        mockScope
          .get(`/devboxes/bench-devbox-2/files${filePath}`)
          .reply(200, content, {
            'Content-Type': 'text/plain',
            'Content-Length': String(content.length)
          })
      }

      // Benchmark concurrent uploads
      const uploadStart = performance.now()
      const uploadPromises = Array.from({ length: fileCount }, (_, i) => {
        const content = 'x'.repeat(fileSize)
        const filePath = `/workspace/concurrent-${i}.txt`
        return sdk.writeFile('bench-devbox-2', filePath, content)
      })

      const uploadResults = await Promise.all(uploadPromises)
      const uploadEnd = performance.now()
      const uploadTime = uploadEnd - uploadStart

      // Benchmark concurrent downloads
      const downloadStart = performance.now()
      const downloadPromises = Array.from({ length: fileCount }, (_, i) => {
        const filePath = `/workspace/concurrent-${i}.txt`
        return sdk.readFile('bench-devbox-2', filePath)
      })

      const downloadResults = await Promise.all(downloadPromises)
      const downloadEnd = performance.now()
      const downloadTime = downloadEnd - downloadStart

      // Verify results
      assert.strictEqual(uploadResults.length, fileCount)
      assert.strictEqual(downloadResults.length, fileCount)
      uploadResults.forEach(result => assert.strictEqual(result.success, true))
      downloadResults.forEach(content => assert.strictEqual(content.length, fileSize))

      // Performance assertions
      const avgUploadTime = uploadTime / fileCount
      const avgDownloadTime = downloadTime / fileCount

      assert(avgUploadTime < acceptableAvgTime,
        `Average upload time: ${avgUploadTime.toFixed(2)}ms, expected < ${acceptableAvgTime}ms`)
      assert(avgDownloadTime < acceptableAvgTime,
        `Average download time: ${avgDownloadTime.toFixed(2)}ms, expected < ${acceptableAvgTime}ms`)

      console.log(`Concurrent Operations (${fileCount} files): Upload avg ${avgUploadTime.toFixed(2)}ms, Download avg ${avgDownloadTime.toFixed(2)}ms`)
    })
  })

  describe('Connection Pool Performance', () => {
    test('should efficiently reuse connections', async () => {
      const requestCount = 200
      const maxConnections = 10

      // Mock responses
      for (let i = 0; i < requestCount; i++) {
        mockScope.get('/api/pool-test').reply(200, {
          success: true,
          data: { request: i }
        })
      }

      const initialStats = connectionPool.getStats()

      // Execute requests
      const promises = Array.from({ length: requestCount }, () =>
        connectionManager.request('/pool-test')
      )

      await Promise.all(promises)

      const finalStats = connectionPool.getStats()

      // Verify connection pool efficiency
      assert(finalStats.totalConnections <= maxConnections,
        `Total connections: ${finalStats.totalConnections}, expected <= ${maxConnections}`)

      assert(finalStats.idleConnections > 0,
        'Should have idle connections available for reuse')

      const connectionReuseRatio = (requestCount - finalStats.totalConnections) / requestCount
      assert(connectionReuseRatio > 0.8,
        `Connection reuse ratio: ${connectionReuseRatio.toFixed(2)}, expected > 0.8`)

      console.log(`Connection Pool Efficiency: ${connectionReuseRatio.toFixed(2)} reuse ratio, ${finalStats.totalConnections} total connections`)
    })

    test('should handle connection pool warm-up efficiently', async () => {
      const warmupRequests = 20
      const benchmarkRequests = 100

      // Mock responses
      for (let i = 0; i < warmupRequests + benchmarkRequests; i++) {
        mockScope.get('/api/warmup').reply(200, {
          success: true,
          data: { request: i }
        })
      }

      // Warm-up phase
      const warmupStart = performance.now()
      const warmupPromises = Array.from({ length: warmupRequests }, () =>
        connectionManager.request('/warmup')
      )
      await Promise.all(warmupPromises)
      const warmupEnd = performance.now()
      const warmupTime = warmupEnd - warmupStart

      // Benchmark phase (with warm connections)
      const benchmarkStart = performance.now()
      const benchmarkPromises = Array.from({ length: benchmarkRequests }, () =>
        connectionManager.request('/warmup')
      )
      await Promise.all(benchmarkPromises)
      const benchmarkEnd = performance.now()
      const benchmarkTime = benchmarkEnd - benchmarkStart

      const warmupAvgTime = warmupTime / warmupRequests
      const benchmarkAvgTime = benchmarkTime / benchmarkRequests
      const improvementRatio = warmupAvgTime / benchmarkAvgTime

      // Warm connections should be faster
      assert(improvementRatio > 1.2,
        `Warm-up improvement: ${improvementRatio.toFixed(2)}x, expected > 1.2x`)

      console.log(`Connection Warm-up: Cold avg ${warmupAvgTime.toFixed(2)}ms, Warm avg ${benchmarkAvgTime.toFixed(2)}ms, ${improvementRatio.toFixed(2)}x improvement`)
    })
  })

  describe('Memory Usage', () => {
    test('should maintain stable memory usage under load', async () => {
      const iterations = 5
      const requestsPerIteration = 100

      const memorySnapshots: number[] = []

      // Mock responses
      for (let i = 0; i < iterations * requestsPerIteration; i++) {
        mockScope.get('/api/memory-test').reply(200, {
          success: true,
          data: { id: i, data: 'x'.repeat(1024) } // 1KB response
        })
      }

      for (let iteration = 0; iteration < iterations; iteration++) {
        // Take memory snapshot
        if (global.gc) {
          global.gc() // Force garbage collection if available
        }
        const memBefore = process.memoryUsage().heapUsed

        // Execute requests
        const promises = Array.from({ length: requestsPerIteration }, (_, i) => {
          const requestId = iteration * requestsPerIteration + i
          return connectionManager.request('/memory-test')
        })

        await Promise.all(promises)

        // Take memory snapshot after
        if (global.gc) {
          global.gc() // Force garbage collection
        }
        const memAfter = process.memoryUsage().heapUsed
        memorySnapshots.push(memAfter)

        console.log(`Iteration ${iteration + 1}: Memory usage ${((memAfter - memBefore) / 1024 / 1024).toFixed(2)}MB`)
      }

      // Check for memory leaks
      const initialMemory = memorySnapshots[0]
      const finalMemory = memorySnapshots[memorySnapshots.length - 1]
      const memoryGrowth = finalMemory - initialMemory
      const memoryGrowthMB = memoryGrowth / 1024 / 1024

      // Memory growth should be minimal (< 10MB)
      assert(memoryGrowthMB < 10,
        `Memory growth: ${memoryGrowthMB.toFixed(2)}MB, expected < 10MB`)

      console.log(`Memory Usage: Initial ${(initialMemory / 1024 / 1024).toFixed(2)}MB, Final ${(finalMemory / 1024 / 1024).toFixed(2)}MB, Growth ${memoryGrowthMB.toFixed(2)}MB`)
    })
  })

  describe('WebSocket Performance', () => {
    test('should handle high-frequency WebSocket messages efficiently', async () => {
      const messageCount = 1000
      const messageInterval = 1 // ms between messages
      const acceptableMessageLatency = 50 // ms

      // Mock WebSocket
      let messagesSent = 0
      let totalLatency = 0
      const latencies: number[] = []

      global.WebSocket = class MockWebSocket {
        url: string
        onopen: ((event: any) => void) | null = null
        onmessage: ((event: any) => void) | null = null
        onclose: ((event: any) => void) | null = null

        constructor(url: string) {
          this.url = url

          // Simulate connection
          setTimeout(() => {
            if (this.onopen) {
              this.onopen({ type: 'open' })
            }

            // Start sending messages
            const sendMessages = () => {
              if (messagesSent < messageCount) {
                const sendTime = Date.now()

                setTimeout(() => {
                  if (this.onmessage) {
                    const receiveTime = Date.now()
                    const latency = receiveTime - sendTime
                    latencies.push(latency)
                    totalLatency += latency
                    messagesSent++

                    this.onmessage({
                      type: 'message',
                      data: JSON.stringify({
                        type: 'test_message',
                        id: messagesSent,
                        timestamp: sendTime
                      })
                    })
                  }

                  if (messagesSent < messageCount) {
                    sendMessages()
                  }
                }, messageInterval)
              }
            }

            sendMessages()
          }, 50)
        }

        send(data: string) {}
        close() {}
      } as any

      return new Promise<void>((resolve) => {
        let messagesReceived = 0

        sdk.connectWebSocket('bench-devbox-3', {
          onMessage: (message) => {
            messagesReceived++
            if (messagesReceived === messageCount) {
              // Calculate statistics
              const avgLatency = totalLatency / messageCount
              const maxLatency = Math.max(...latencies)
              const minLatency = Math.min(...latencies)

              assert(avgLatency < acceptableMessageLatency,
                `Average message latency: ${avgLatency.toFixed(2)}ms, expected < ${acceptableMessageLatency}ms`)

              console.log(`WebSocket Performance: ${messageCount} messages, avg latency ${avgLatency.toFixed(2)}ms, min ${minLatency}ms, max ${maxLatency}ms`)
              resolve()
            }
          }
        })
      })
    })
  })

  describe('Overall SDK Performance', () => {
    test('should meet overall performance requirements', async () => {
      const operations = [
        { name: 'Devbox List', count: 50, endpoint: '/devboxes' },
        { name: 'File Write', count: 30, endpoint: '/files/write', type: 'file' },
        { name: 'File Read', count: 30, endpoint: '/files/read', type: 'file' },
        { name: 'Process Execute', count: 20, endpoint: '/process/execute', type: 'process' }
      ]

      const performanceTargets = {
        apiCalls: 100, // ms max average
        fileOps: 500,  // ms max average
        processOps: 2000 // ms max average
      }

      // Mock all operations
      operations.forEach(op => {
        for (let i = 0; i < op.count; i++) {
          if (op.type === 'file') {
            if (op.endpoint.includes('write')) {
              mockScope.post(op.endpoint).reply(200, { success: true, bytesWritten: 1024 })
            } else {
              mockScope.get(op.endpoint).reply(200, 'test file content')
            }
          } else if (op.type === 'process') {
            mockScope.post(op.endpoint).reply(200, {
              success: true,
              exitCode: 0,
              stdout: 'process output',
              duration: 100
            })
          } else {
            mockScope.get(op.endpoint).reply(200, { success: true, data: [] })
          }
        }
      })

      const results: Array<{ name: string; avgTime: number; totalTime: number }> = []

      // Execute operations and measure performance
      for (const operation of operations) {
        const startTime = performance.now()

        const promises = Array.from({ length: operation.count }, (_, i) => {
          if (operation.type === 'file') {
            if (operation.endpoint.includes('write')) {
              return sdk.writeFile('bench-devbox-4', `/test-${i}.txt`, 'test content')
            } else {
              return sdk.readFile('bench-devbox-4', `/test-${i}.txt`)
            }
          } else if (operation.type === 'process') {
            return sdk.executeProcess('bench-devbox-4', 'echo', ['test'])
          } else {
            return sdk.request(operation.endpoint)
          }
        })

        await Promise.all(promises)

        const endTime = performance.now()
        const totalTime = endTime - startTime
        const avgTime = totalTime / operation.count

        results.push({ name: operation.name, avgTime, totalTime })

        // Verify performance targets
        if (operation.type === 'file') {
          assert(avgTime < performanceTargets.fileOps,
            `${operation.name} average time: ${avgTime.toFixed(2)}ms, expected < ${performanceTargets.fileOps}ms`)
        } else if (operation.type === 'process') {
          assert(avgTime < performanceTargets.processOps,
            `${operation.name} average time: ${avgTime.toFixed(2)}ms, expected < ${performanceTargets.processOps}ms`)
        } else {
          assert(avgTime < performanceTargets.apiCalls,
            `${operation.name} average time: ${avgTime.toFixed(2)}ms, expected < ${performanceTargets.apiCalls}ms`)
        }
      }

      // Print performance summary
      console.log('\nPerformance Summary:')
      results.forEach(result => {
        console.log(`  ${result.name}: ${result.avgTime.toFixed(2)}ms avg (${result.totalTime.toFixed(2)}ms total)`)
      })

      const totalOperations = operations.reduce((sum, op) => sum + op.count, 0)
      const totalAvgTime = results.reduce((sum, result) => sum + result.avgTime, 0) / results.length

      console.log(`\nOverall: ${totalOperations} operations, ${totalAvgTime.toFixed(2)}ms average per operation type`)
    })
  })
})