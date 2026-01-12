/**
 * Devbox Full Lifecycle Example
 * 
 * This example demonstrates a complete devbox lifecycle workflow:
 * 1. Create and start a devbox
 * 2. Fetch devbox information
 * 3. Git clone a repository
 * 4. Call analyze API to get entrypoint
 * 5. Write entrypoint.sh file
 * 6. Configure npm registry
 * 7. Start application server
 * 
 * Usage:
 *   # From project root:
 *   bun packages/sdk/examples/full-lifecycle.ts
 * 
 *   # From packages/sdk directory:
 *   bun examples/full-lifecycle.ts
 * 
 *   # From examples directory:
 *   bun full-lifecycle.ts
 * 
 * Requirements:
 *   - KUBECONFIG environment variable must be set (can be in .env file)
 */

import { config as loadEnv } from 'dotenv'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DevboxSDK } from '../src/core/devbox-sdk'
import { DevboxRuntime } from '../src/api/types'
import { parseKubeconfigServerUrl } from '../src/utils/kubeconfig'

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const envPaths = [
  resolve(__dirname, '.env'),
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../.env'),
  resolve(process.cwd(), '.env'),
]

let envLoaded = false
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false })
    console.log(`✅ Loaded environment variables from ${envPath}`)
    envLoaded = true
    break
  }
}

if (!envLoaded) {
  console.warn('⚠️  .env file not found, using system environment variables')
}

if (!process.env.KUBECONFIG) {
  console.error('❌ Missing required environment variable: KUBECONFIG')
  process.exit(1)
}

let kubeconfigContent = process.env.KUBECONFIG

if (!kubeconfigContent.includes('apiVersion') && existsSync(kubeconfigContent)) {
  kubeconfigContent = readFileSync(kubeconfigContent, 'utf-8')
} else if (kubeconfigContent.includes('\\n')) {
  kubeconfigContent = kubeconfigContent.replace(/\\n/g, '\n')
}

const kubeconfigUrl = parseKubeconfigServerUrl(kubeconfigContent)
if (!kubeconfigUrl) {
  console.error('❌ Failed to parse API server URL from kubeconfig')
  process.exit(1)
}

const SDK_CONFIG = {
  kubeconfig: kubeconfigContent,
  http: {
    timeout: 300000,
    retries: 3,
    rejectUnauthorized: false,
  },
}

const generateDevboxName = (prefix: string) => {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  const sanitizedPrefix = prefix.replace(/\./g, '-')
  return `example-${sanitizedPrefix}-${timestamp}-${random}`
}

// Helper function: wait for server startup with smart detection
async function waitForServerStartup(
  devbox: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  processId: string,
  port: number,
  maxWaitTime = 180000
): Promise<{ success: boolean; duration: number }> {
  const startTime = Date.now()
  const checkInterval = 3000 // Check every 3 seconds

  console.log('')
  console.log('⏳ Waiting for server to start...')
  console.log(`   Checking process ${processId} and port ${port}...`)
  console.log('')

  // Wait 10 seconds first to let package installation start
  await new Promise(resolve => setTimeout(resolve, 10000))

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check process status
      const processStatus = await devbox.getProcessStatus(processId)
      const isRunning = processStatus.status === 'running'

      // Check if port is listening
      const ports = await devbox.getPorts()
      const isPortListening = ports.ports?.includes(port) || false

      // Display progress
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      process.stdout.write(
        `\r   Process: ${processStatus.status} | Port ${port}: ${isPortListening ? 'listening' : 'not listening'} | Elapsed: ${elapsed}s`
      )

      if (isRunning && isPortListening) {
        const duration = Date.now() - startTime
        console.log('')
        console.log(`✅ Server is ready! (${(duration / 1000).toFixed(2)}s)`)
        return { success: true, duration }
      }

      // Check if process has failed
      if (processStatus.status === 'exited' && processStatus.exitCode !== 0) {
        const duration = Date.now() - startTime
        console.log('')
        console.error(`❌ Process exited with code ${processStatus.exitCode}`)
        return { success: false, duration }
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.log(`\n⚠️  Check failed: ${errorMessage}, retrying...`)
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }
  }

  const duration = Date.now() - startTime
  console.log('')
  console.warn(`⚠️  Server did not start within ${maxWaitTime / 1000}s`)
  return { success: false, duration }
}

async function main() {
  const sdk = new DevboxSDK(SDK_CONFIG)
  const name = generateDevboxName('full-lifecycle')
  const REPO_URL = 'https://github.com/zjy365/reddit-ai-assistant-extension'
  const REPO_DIR = '/home/devbox/project/reddit-ai-assistant-extension'
  const ANALYZE_API_URL = 'https://pgitgrfugqfk.usw.sealos.io/analyze'

  try {
    const overallStartTime = Date.now()
    console.log('🚀 Starting Devbox full lifecycle example...')
    console.log(`📦 Creating devbox: ${name}`)

    // 1. Create Devbox
    const createStartTime = Date.now()
    const devbox = await sdk.createDevbox({
      name,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: { cpu: 1, memory: 2 },
    })
    const createDuration = Date.now() - createStartTime
    console.log(`✅ Devbox created: ${devbox.name} (${(createDuration / 1000).toFixed(2)}s)`)

    // 2. Start devbox
    console.log('⏳ Starting devbox...')
    await devbox.start()
    let currentDevbox = await sdk.getDevbox(name)
    const startTime = Date.now()

    while (currentDevbox.status !== 'Running' && Date.now() - startTime < 60000) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      currentDevbox = await sdk.getDevbox(name)
      process.stdout.write('.')
    }

    const waitDuration = Date.now() - startTime
    const totalStartupTime = Date.now() - overallStartTime
    console.log('')
    console.log(`✅ Devbox is ${currentDevbox.status}`)
    console.log(`   ⏱️  Startup time: ${(waitDuration / 1000).toFixed(2)}s (wait) + ${(createDuration / 1000).toFixed(2)}s (create) = ${(totalStartupTime / 1000).toFixed(2)}s (total)`)

    // 3. Fetch devbox info to verify it's ready
    const fetchedDevbox = await sdk.getDevbox(name)
    console.log(`📋 Devbox info: ${fetchedDevbox.name} - ${fetchedDevbox.status}`)

    // 4. Clean up directory first to avoid clone conflicts and permission issues
    console.log('')
    console.log('🧹 Cleaning up directory...')
    try {
      await currentDevbox.execSync({
        command: 'rm',
        args: ['-rf', REPO_DIR],
      })
    } catch {
      // Ignore errors if directory doesn't exist
    }

    // 5. Git clone repository
    console.log('')
    console.log(`📥 Cloning repository: ${REPO_URL}`)
    const cloneStartTime = Date.now()
    await currentDevbox.git.clone({
      url: REPO_URL,
      targetDir: REPO_DIR,
    })
    const cloneDuration = Date.now() - cloneStartTime
    console.log(`✅ Repository cloned successfully (${(cloneDuration / 1000).toFixed(2)}s)`)

    // Verify repository was cloned by checking if directory exists
    const repoFiles = await currentDevbox.listFiles(REPO_DIR)
    console.log(`📁 Found ${repoFiles.files.length} files in repository`)

    // List directory contents using ls command
    console.log('📋 Listing directory contents:')
    const lsResult = await currentDevbox.execSync({
      command: 'ls',
      args: ['-la', REPO_DIR],
    })
    console.log(lsResult.stdout)

    // 6. Call analyze API using fetch with retry logic
    console.log('')
    console.log('🔍 Calling analyze API...')
    const analyzeStartTime = Date.now()

    const callAnalyzeAPI = async (retries = 3, timeout = 60000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Create abort controller for timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          const response = await fetch(ANALYZE_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              repo_url: REPO_URL,
            }),
            signal: controller.signal,
            keepalive: true,
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            throw new Error(`Analyze API failed: ${response.statusText}`)
          }

          return await response.json()
        } catch (error) {
          const isLastAttempt = attempt === retries
          const errorMessage = error instanceof Error ? error.message : String(error)

          if (isLastAttempt) {
            throw new Error(`Analyze API failed after ${retries} attempts: ${errorMessage}`)
          }

          console.log(`⚠️  Attempt ${attempt} failed: ${errorMessage}`)
          console.log(`🔄 Retrying (${attempt + 1}/${retries})...`)

          // Exponential backoff: wait 2s, 4s, 8s...
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
        }
      }
    }

    const analyzeData = await callAnalyzeAPI()
    const analyzeDuration = Date.now() - analyzeStartTime
    console.log(`✅ Analyze API response received (${(analyzeDuration / 1000).toFixed(2)}s)`)
    console.log('analyzeData:', analyzeData);
    console.log(`📝 Entrypoint length: ${analyzeData.entrypoint?.length || 0} characters`)

    // Extract port from analyze API response
    const appPort = analyzeData.port || 3000 // Default to 3000 if not specified
    console.log(`🔌 Application port: ${appPort}`)

    // 7. Check Node.js and npm versions
    console.log('')
    console.log('🔍 Checking Node.js and npm versions...')
    const versionCheckStartTime = Date.now()
    const nodeVersionResult = await currentDevbox.execSync({
      command: 'node',
      args: ['-v'],
    })
    console.log(`📦 Node.js version: ${nodeVersionResult.stdout.trim() || 'N/A'}`)

    const npmVersionResult = await currentDevbox.execSync({
      command: 'npm',
      args: ['-v'],
    })
    console.log(`📦 npm version: ${npmVersionResult.stdout.trim() || 'N/A'}`)

    // 8. Check package manager requirements
    console.log('')
    console.log('🔧 Checking package manager requirements...')

    const usesPnpm = analyzeData.entrypoint?.includes('pnpm') || false

    if (usesPnpm) {
      console.log('📦 Detected pnpm usage...')
      try {
        const pnpmVersionResult = await currentDevbox.execSync({
          command: 'pnpm',
          args: ['-v'],
        })
        console.log(`📦 pnpm version: ${pnpmVersionResult.stdout.trim() || 'N/A'}`)
      } catch (error) {
        console.warn('⚠️  pnpm not available:', error instanceof Error ? error.message : String(error))
        console.log('📦 Enabling pnpm via corepack...')
        await currentDevbox.execSync({
          command: 'corepack',
          args: ['enable'],
        })
        await currentDevbox.execSync({
          command: 'corepack',
          args: ['prepare', 'pnpm@latest', '--activate'],
        })
      }
    }
    const versionCheckDuration = Date.now() - versionCheckStartTime

    // 9. Prepare entrypoint.sh with command fixes
    const entrypointPath = `${REPO_DIR}/entrypoint.sh`
    console.log('')
    console.log(`💾 Preparing entrypoint.sh...`)
    const entrypointStartTime = Date.now()

    const entrypointScript = analyzeData.entrypoint
      .replace(/pnpm\s+(dev|start|build)\s+--\s+-/g, 'pnpm $1 -')
      .replace(/npm\s+(dev|start|build)\s+--\s+-/g, 'npm run $1 -')

    await currentDevbox.writeFile(entrypointPath, entrypointScript, { mode: 0o755 })
    const entrypointDuration = Date.now() - entrypointStartTime
    console.log(`✅ entrypoint.sh written successfully (${(entrypointDuration / 1000).toFixed(2)}s)`)

    // 10. Configure npm registry
    console.log('')
    console.log('🔧 Configuring npm registry...')
    const registryStartTime = Date.now()

    const expectedRegistry = 'https://registry.npmmirror.com'

    const registryResult = await currentDevbox.execSync({
      command: 'npm',
      args: ['config', 'set', 'registry', expectedRegistry],
    })
    const registryDuration = Date.now() - registryStartTime
    if (registryResult.exitCode !== 0) {
      console.warn(`⚠️  Failed to set npm registry: ${registryResult.stderr}`)
    } else {
      console.log(`✅ npm registry set to: ${expectedRegistry} (${(registryDuration / 1000).toFixed(2)}s)`)
    }

    // 11. Start entrypoint.sh (run asynchronously in background)
    console.log('')
    console.log('🚀 Starting application via entrypoint.sh...')
    const devStartStartTime = Date.now()

    const serverProcess = await currentDevbox.executeCommand({
      command: `bash ${entrypointPath} development`,
      cwd: REPO_DIR,
    })
    console.log(`✅ Application started!`)
    console.log(`   Process ID: ${serverProcess.processId}`)

    // Wait for server startup (this is the slowest part - dev server startup)
    const startupResult = await waitForServerStartup(currentDevbox, serverProcess.processId, appPort, 180000)
    const devStartDuration = Date.now() - devStartStartTime

    if (!startupResult.success) {
      console.warn('⚠️  Server may not have started within timeout, but continuing...')
    }

    // Get preview URL for the application port
    console.log('')
    console.log(`🔗 Getting preview URL for port ${appPort}...`)
    try {
      const previewLink = await currentDevbox.getPreviewLink(appPort)
      console.log(`✅ Preview URL: ${previewLink.url}`)
    } catch (error) {
      console.warn('⚠️  Failed to get preview URL:', error instanceof Error ? error.message : String(error))
      console.warn(`   This might be because the devbox does not have port ${appPort} configured`)
    }

    const totalDuration = Date.now() - overallStartTime

    console.log('')
    console.log('🎉 Devbox full lifecycle example completed successfully!')
    console.log('')
    console.log('📋 Summary:')
    console.log(`   Devbox: ${name}`)
    console.log(`   Repository: ${REPO_URL}`)
    console.log(`   Project Dir: ${REPO_DIR}`)
    console.log(`   Server: npm run dev`)
    console.log('')
    console.log('⏱️  Time Statistics:')
    console.log(`   • Devbox creation: ${(createDuration / 1000).toFixed(2)}s`)
    console.log(`   • Devbox startup: ${(waitDuration / 1000).toFixed(2)}s`)
    console.log(`   • Git clone: ${(cloneDuration / 1000).toFixed(2)}s`)
    console.log(`   • Analyze API: ${(analyzeDuration / 1000).toFixed(2)}s`)
    console.log(`   • Version check: ${(versionCheckDuration / 1000).toFixed(2)}s`)
    console.log(`   • Entrypoint prep: ${(entrypointDuration / 1000).toFixed(2)}s`)
    console.log(`   • Registry config: ${(registryDuration / 1000).toFixed(2)}s`)
    console.log(`   • Dev server startup: ${(devStartDuration / 1000).toFixed(2)}s ⏳ (slowest step)`)
    console.log(`   ─────────────────────────────`)
    console.log(`   • Total time: ${(totalDuration / 1000).toFixed(2)}s`)
    console.log('')

  } catch (error) {
    console.error('❌ Error occurred:', error)
    throw error
  } finally {
    await sdk.close()
  }
}

main().catch((error) => {
  console.error('Failed to run example:', error)
  process.exit(1)
})
