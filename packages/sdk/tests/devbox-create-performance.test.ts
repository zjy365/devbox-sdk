/**
 * Devbox Creation Performance Test
 * 
 * Purpose: Diagnose performance bottlenecks when creating a new devbox via SDK
 * Records timing for each step, including:
 * 1. API call time (createDevbox)
 * 2. Time waiting for Running status (refreshInfo calls)
 * 3. Health check time (isHealthy calls)
 * 4. Total time
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'
import { DevboxRuntime } from '../src/api/types'

interface PerformanceMetrics {
  // API call phase
  apiCallStart: number
  apiCallEnd: number
  apiCallDuration: number

  // Waiting phase
  waitStart: number
  waitEnd: number
  waitDuration: number

  // refreshInfo call details
  refreshInfoCalls: Array<{
    timestamp: number
    duration: number
    status: string
    elapsed: number // Time elapsed since waitStart
  }>

  // isHealthy call details
  isHealthyCalls: Array<{
    timestamp: number
    duration: number
    healthy: boolean
    elapsed: number // Time elapsed since waitStart
  }>

  // Total duration
  totalDuration: number

  // Status change timestamps
  statusChanges: Array<{
    timestamp: number
    status: string
    elapsed: number
  }>
}

/**
 * Helper function to format performance metrics
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

function printMetrics(metrics: PerformanceMetrics, devboxName: string) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`Performance Analysis Report: ${devboxName}`)
  console.log('='.repeat(80))

  console.log('\n📊 Overall Time Statistics:')
  console.log(`  Total Duration: ${formatDuration(metrics.totalDuration)}`)
  console.log(`  API Call Duration: ${formatDuration(metrics.apiCallDuration)} (${((metrics.apiCallDuration / metrics.totalDuration) * 100).toFixed(1)}%)`)
  console.log(`  Wait Duration: ${formatDuration(metrics.waitDuration)} (${((metrics.waitDuration / metrics.totalDuration) * 100).toFixed(1)}%)`)

  console.log('\n🔌 API Call Phase:')
  console.log(`  Start Time: ${new Date(metrics.apiCallStart).toISOString()}`)
  console.log(`  End Time: ${new Date(metrics.apiCallEnd).toISOString()}`)
  console.log(`  Duration: ${formatDuration(metrics.apiCallDuration)}`)

  console.log('\n⏳ Waiting Phase Details:')
  console.log(`  Start Time: ${new Date(metrics.waitStart).toISOString()}`)
  console.log(`  End Time: ${new Date(metrics.waitEnd).toISOString()}`)
  console.log(`  Total Duration: ${formatDuration(metrics.waitDuration)}`)

  if (metrics.statusChanges.length > 0) {
    console.log('\n📈 Status Change Timeline:')
    metrics.statusChanges.forEach((change, index) => {
      console.log(`  ${index + 1}. [${formatDuration(change.elapsed)}] Status: ${change.status}`)
    })
  }

  if (metrics.refreshInfoCalls.length > 0) {
    console.log('\n🔄 refreshInfo Call Statistics:')
    console.log(`  Total Calls: ${metrics.refreshInfoCalls.length}`)
    const durations = metrics.refreshInfoCalls.map(c => c.duration)
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    const maxDuration = Math.max(...durations)
    const minDuration = Math.min(...durations)
    console.log(`  Average Duration: ${formatDuration(avgDuration)}`)
    console.log(`  Max Duration: ${formatDuration(maxDuration)}`)
    console.log(`  Min Duration: ${formatDuration(minDuration)}`)
    console.log(`  Total Duration: ${formatDuration(durations.reduce((a, b) => a + b, 0))}`)

    console.log('\n  Detailed Call Records:')
    metrics.refreshInfoCalls.forEach((call, index) => {
      console.log(`    ${index + 1}. [${formatDuration(call.elapsed)}] Duration: ${formatDuration(call.duration)}, Status: ${call.status}`)
    })
  }

  if (metrics.isHealthyCalls.length > 0) {
    console.log('\n💚 isHealthy Call Statistics:')
    console.log(`  Total Calls: ${metrics.isHealthyCalls.length}`)
    const durations = metrics.isHealthyCalls.map(c => c.duration)
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    const maxDuration = Math.max(...durations)
    const minDuration = Math.min(...durations)
    console.log(`  Average Duration: ${formatDuration(avgDuration)}`)
    console.log(`  Max Duration: ${formatDuration(maxDuration)}`)
    console.log(`  Min Duration: ${formatDuration(minDuration)}`)
    console.log(`  Total Duration: ${formatDuration(durations.reduce((a, b) => a + b, 0))}`)

    console.log('\n  Detailed Call Records:')
    metrics.isHealthyCalls.forEach((call, index) => {
      console.log(`    ${index + 1}. [${formatDuration(call.elapsed)}] Duration: ${formatDuration(call.duration)}, Healthy: ${call.healthy}`)
    })
  }

  console.log(`\n${'='.repeat(80)}`)
}

describe('Devbox Creation Performance Test', () => {
  let sdk: DevboxSDK

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)
  }, 10000)

  afterEach(async () => {
    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  it('should record detailed performance metrics when creating a devbox', async () => {
    const devboxName = `perf-test-${Date.now()}`
    const metrics: PerformanceMetrics = {
      apiCallStart: 0,
      apiCallEnd: 0,
      apiCallDuration: 0,
      waitStart: 0,
      waitEnd: 0,
      waitDuration: 0,
      refreshInfoCalls: [],
      isHealthyCalls: [],
      totalDuration: 0,
      statusChanges: [],
    }

    // Record API call time
    metrics.apiCallStart = Date.now()
    
    // Create devbox instance (without waiting for ready)
    const instance = await sdk.createDevboxAsync({
      name: devboxName,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: {
        cpu: 2,
        memory: 4,
      },
      ports: [{ number: 8080, protocol: 'HTTP' }],
    })

    metrics.apiCallEnd = Date.now()
    metrics.apiCallDuration = metrics.apiCallEnd - metrics.apiCallStart

    // Record initial status
    let lastStatus = instance.status
    metrics.statusChanges.push({
      timestamp: metrics.apiCallEnd,
      status: lastStatus,
      elapsed: 0,
    })

    // Manually implement waitForReady and record detailed metrics
    metrics.waitStart = Date.now()
    const timeout = 300000 // 5 minutes
    const checkInterval = 2000 // 2 seconds
    const waitStartTime = Date.now()

    // Save original refreshInfo and isHealthy methods
    const originalRefreshInfo = instance.refreshInfo.bind(instance)
    const originalIsHealthy = instance.isHealthy.bind(instance)

    // Wrap refreshInfo to record performance
    instance.refreshInfo = async function() {
      const start = Date.now()
      await originalRefreshInfo()
      const duration = Date.now() - start
      const elapsed = Date.now() - waitStartTime

      metrics.refreshInfoCalls.push({
        timestamp: Date.now(),
        duration,
        status: this.status,
        elapsed,
      })

      // Record status changes
      if (this.status !== lastStatus) {
        metrics.statusChanges.push({
          timestamp: Date.now(),
          status: this.status,
          elapsed,
        })
        lastStatus = this.status
      }
    }

    // Wrap isHealthy to record performance
    instance.isHealthy = async () => {
      const start = Date.now()
      const result = await originalIsHealthy()
      const duration = Date.now() - start
      const elapsed = Date.now() - waitStartTime

      metrics.isHealthyCalls.push({
        timestamp: Date.now(),
        duration,
        healthy: result,
        elapsed,
      })

      return result
    }

    // Execute waiting logic
    while (Date.now() - waitStartTime < timeout) {
      try {
        await instance.refreshInfo()

        if (instance.status === 'Running') {
          const healthy = await instance.isHealthy()

          if (healthy) {
            metrics.waitEnd = Date.now()
            metrics.waitDuration = metrics.waitEnd - metrics.waitStart
            metrics.totalDuration = metrics.waitEnd - metrics.apiCallStart

            // Print performance report
            printMetrics(metrics, devboxName)

            // Verify devbox is ready
            expect(instance.status).toBe('Running')
            expect(healthy).toBe(true)

            // Cleanup: delete devbox
            await instance.delete()
            return
          }
        }
      } catch (error) {
        // Continue waiting but log error
        console.warn(`Error during wait: ${error}`)
      }

      // Wait interval
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    metrics.waitEnd = Date.now()
    metrics.waitDuration = metrics.waitEnd - metrics.waitStart
    metrics.totalDuration = metrics.waitEnd - metrics.apiCallStart

    // Print performance report (even if timeout)
    printMetrics(metrics, devboxName)

    // Cleanup: delete devbox
    try {
      await instance.delete()
    } catch (error) {
      console.warn(`Error cleaning up devbox: ${error}`)
    }

    throw new Error(`Devbox '${devboxName}' did not become ready within ${timeout}ms`)
  }, 360000) // 6 minute timeout

  it('should compare performance difference between createDevbox and createDevboxAsync + waitForReady', async () => {
    const devboxName1 = `perf-compare-1-${Date.now()}`
    const devboxName2 = `perf-compare-2-${Date.now()}`

    // Method 1: Use createDevbox (default wait)
    const start1 = Date.now()
    const instance1 = await sdk.createDevbox({
      name: devboxName1,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: {
        cpu: 2,
        memory: 4,
      },
      ports: [{ number: 8080, protocol: 'HTTP' }],
    })
    const duration1 = Date.now() - start1

    // Method 2: Use createDevboxAsync + manual waitForReady (with same options as Method 1)
    const start2 = Date.now()
    const instance2 = await sdk.createDevboxAsync({
      name: devboxName2,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: {
        cpu: 2,
        memory: 4,
      },
      ports: [{ number: 8080, protocol: 'HTTP' }],
    })
    const apiCallDuration = Date.now() - start2

    const waitStart = Date.now()
    // Use same options as createDevbox default: exponential backoff with 500ms initial, 5000ms max
    await instance2.waitForReady({
      timeout: 180000, // 3 minutes (same as createDevbox default)
      useExponentialBackoff: true,
      initialCheckInterval: 500,
      maxCheckInterval: 5000,
      backoffMultiplier: 1.5,
    })
    const waitDuration = Date.now() - waitStart
    const duration2 = Date.now() - start2

    console.log(`\n${'='.repeat(80)}`)
    console.log('Performance Comparison Test')
    console.log('='.repeat(80))
    console.log(`Method 1 (createDevbox): ${formatDuration(duration1)}`)
    console.log('Method 2 (createDevboxAsync + waitForReady):')
    console.log(`  API Call: ${formatDuration(apiCallDuration)}`)
    console.log(`  Wait for Ready: ${formatDuration(waitDuration)}`)
    console.log(`  Total: ${formatDuration(duration2)}`)
    console.log(`Difference: ${formatDuration(Math.abs(duration1 - duration2))}`)
    console.log(`${'='.repeat(80)}\n`)

    // Verify both instances are ready
    expect(instance1.status).toBe('Running')
    expect(instance2.status).toBe('Running')

    // Cleanup
    await instance1.delete()
    await instance2.delete()
  }, 360000) // 6 minute timeout
})

