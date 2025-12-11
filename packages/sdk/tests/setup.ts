import type { DevboxSDKConfig } from '../src/core/types'
import type { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { DevboxRuntime } from '../src/api/types'

if (!process.env.DEVBOX_API_URL) {
  throw new Error('Missing required environment variable: DEVBOX_API_URL')
}

if (!process.env.KUBECONFIG) {
  throw new Error('Missing required environment variable: KUBECONFIG')
}

export const TEST_CONFIG: DevboxSDKConfig = {
  baseUrl: process.env.DEVBOX_API_URL,
  kubeconfig: process.env.KUBECONFIG,
  // mockServerUrl: process.env.MOCK_SERVER_URL,
  http: {
    timeout: 300000,
    retries: 3,
    rejectUnauthorized: false,
  },
}

/**
 * Shared devbox name for all non-lifecycle tests
 * This devbox is reused across test runs to reduce creation/deletion overhead
 */
export const SHARED_DEVBOX_NAME = 'devbox-sdk-test'

/**
 * Wait for a devbox to become ready (Running status)
 * @param devbox - The devbox instance to wait for
 * @param timeout - Maximum time to wait in milliseconds (default: 120000ms)
 */
export async function waitForDevboxReady(devbox: DevboxInstance, timeout = 120000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      await devbox.refreshInfo()
      if (devbox.status === 'Running') {
        // Give it a bit more time to fully stabilize
        await new Promise(resolve => setTimeout(resolve, 3000))
        return
      }
    } catch (error) {
      // Ignore intermediate errors
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  throw new Error(`Devbox ${devbox.name} did not become ready within ${timeout}ms`)
}

/**
 * Get or create the shared devbox for testing
 * This function tries to get an existing devbox with the shared name,
 * and creates it if it doesn't exist
 * 
 * @param sdk - The DevboxSDK instance
 * @returns The shared devbox instance
 */
export async function getOrCreateSharedDevbox(sdk: DevboxSDK): Promise<DevboxInstance> {
  try {
    // Try to get existing shared devbox
    const devbox = await sdk.getDevbox(SHARED_DEVBOX_NAME)

    // If devbox exists, ensure it's running
    if (devbox.status !== 'Running') {
      await devbox.start()
      await waitForDevboxReady(devbox)
    } else {
      // Even if running, wait a bit to ensure it's stable
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return devbox
  } catch (error) {
    // Devbox doesn't exist, create it
    console.log(`Creating shared devbox: ${SHARED_DEVBOX_NAME}`)
    const devbox = await sdk.createDevbox({
      name: SHARED_DEVBOX_NAME,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: {
        cpu: 2,
        memory: 4,
      },
      ports: [{ number: 8080, protocol: 'HTTP' }],
    })

    await devbox.start()
    await waitForDevboxReady(devbox)

    return devbox
  }
}

/**
 * Clean up test files in the shared devbox
 * Call this in beforeEach to ensure a clean state between tests
 * 
 * @param devbox - The devbox instance to clean
 * @param directories - List of directories to remove (default: common test directories)
 */
export async function cleanupTestFiles(
  devbox: DevboxInstance,
  directories: string[] = [
    './test',
    './test-directory',
    './batch',
    './large',
    './metadata',
    './meta',
    './concurrent',
    './perf',
    './many',
    './move',
    './move-dir',
    './move-overwrite',
    './move-no-overwrite',
    './rename',
    './rename-dir',
    './rename-conflict',
    './download',
    './download-multi',
    './download-tar',
    './download-targz',
    './download-multipart',
    './combo',
    './combo-ports',
  ]
): Promise<void> {
  try {
    await devbox.execSync({
      command: 'rm',
      args: ['-rf', ...directories],
    })
  } catch (error) {
    // Ignore cleanup errors - directories might not exist
  }
}

