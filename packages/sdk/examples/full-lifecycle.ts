/**
 * Devbox Full Lifecycle Example
 * 
 * This example demonstrates a complete devbox lifecycle workflow:
 * 1. Create and start a devbox
 * 2. Fetch devbox information
 * 3. Git clone a repository
 * 4. Call analyze API to get entrypoint
 * 5. Write entrypoint.sh file
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
 *   # With environment variable:
 *   export KUBECONFIG=/path/to/kubeconfig
 *   bun full-lifecycle.ts
 * 
 *   # Or inline:
 *   KUBECONFIG=/path/to/kubeconfig bun full-lifecycle.ts
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
// Try multiple locations: current directory, examples directory, project root
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const envPaths = [
  resolve(__dirname, '.env'), // examples/.env
  resolve(__dirname, '../.env'), // packages/sdk/.env
  resolve(__dirname, '../../.env'), // project root .env
  resolve(process.cwd(), '.env'), // current working directory .env
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
  console.warn('⚠️  .env file not found in any of these locations:')
  for (const path of envPaths) {
    console.warn(`   - ${path}`)
  }
  console.warn('   Using system environment variables (export KUBECONFIG=...)')
}

// Check for KUBECONFIG - support both .env file and export command
if (!process.env.KUBECONFIG) {
  console.error('')
  console.error('❌ Missing required environment variable: KUBECONFIG')
  console.error('')
  console.error('Please set it using one of these methods:')
  console.error('')
  console.error('1. Export file path in shell:')
  console.error('   export KUBECONFIG=/path/to/kubeconfig')
  console.error('   bun full-lifecycle.ts')
  console.error('')
  console.error('2. Export kubeconfig content (use $\' for multiline):')
  console.error('   export KUBECONFIG=$\'apiVersion: v1\\n...')
  console.error('')
  console.error('3. Create .env file in project root:')
  console.error('   echo "KUBECONFIG=/path/to/kubeconfig" > .env')
  console.error('')
  console.error('4. Pass inline:')
  console.error('   KUBECONFIG=/path/to/kubeconfig bun full-lifecycle.ts')
  console.error('')
  process.exit(1)
}

// Handle KUBECONFIG - could be a file path or content
let kubeconfigContent = process.env.KUBECONFIG

// If it looks like a file path (doesn't contain 'apiVersion' and exists as file), read it
if (!kubeconfigContent.includes('apiVersion') && existsSync(kubeconfigContent)) {
  console.log(`📄 Reading kubeconfig from file: ${kubeconfigContent}`)
  kubeconfigContent = readFileSync(kubeconfigContent, 'utf-8')
} else if (kubeconfigContent.includes('\\n')) {
  // If it contains escaped newlines, convert them to actual newlines
  console.log('🔄 Converting escaped newlines in kubeconfig...')
  kubeconfigContent = kubeconfigContent.replace(/\\n/g, '\n')
}

// Parse API URL from kubeconfig
const kubeconfigUrl = parseKubeconfigServerUrl(kubeconfigContent)
if (!kubeconfigUrl) {
  console.error('')
  console.error('❌ Failed to parse API server URL from kubeconfig')
  console.error('')
  console.error('Please ensure:')
  console.error('  1. KUBECONFIG is a valid kubeconfig file path or YAML content')
  console.error('  2. The kubeconfig contains a valid server URL')
  console.error('  3. If using multiline content, use $\' syntax in shell')
  console.error('')
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

// Helper function: generate unique name
const generateDevboxName = (prefix: string) => {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  const sanitizedPrefix = prefix.replace(/\./g, '-')
  return `example-${sanitizedPrefix}-${timestamp}-${random}`
}

async function main() {
  const sdk = new DevboxSDK(SDK_CONFIG)
  const name = generateDevboxName('full-lifecycle')
  const REPO_URL = 'https://github.com/steven-tey/precedent.git'
  const REPO_DIR = '/home/devbox/project/reddit-ai-assistant-extension'
  const ANALYZE_API_URL = 'https://pgitgrfugqfk.usw.sealos.io/analyze'

  try {
    console.log('🚀 Starting full lifecycle example...')
    console.log(`📦 Creating devbox: ${name}`)

    // 1. Create Devbox
    const devbox = await sdk.createDevbox({
      name,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: { cpu: 1, memory: 2 },
    })

    console.log(`✅ Devbox created: ${devbox.name}`)

    // 2. Start Devbox and wait for Running status
    console.log('⏳ Starting devbox...')
    await devbox.start()
    let currentDevbox = await sdk.getDevbox(name)
    const startTime = Date.now()
    while (currentDevbox.status !== 'Running' && Date.now() - startTime < 30000) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      currentDevbox = await sdk.getDevbox(name)
      process.stdout.write('.')
    }
    console.log('')
    console.log(`✅ Devbox is ${currentDevbox.status}`)

    // 3. Fetch devbox info to verify it's ready
    const fetchedDevbox = await sdk.getDevbox(name)
    console.log(`📋 Devbox info: ${fetchedDevbox.name} - ${fetchedDevbox.status}`)

    // 4. Clean up directory first to avoid clone conflicts and permission issues
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
    console.log(`📥 Cloning repository: ${REPO_URL}`)
    await currentDevbox.git.clone({
      url: REPO_URL,
      targetDir: REPO_DIR,
    })
    console.log('✅ Repository cloned successfully')

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
    console.log('🔍 Calling analyze API...')

    // Helper function to call analyze API with timeout and retry
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
            // Add keep-alive for better connection handling
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
    console.log('✅ Analyze API response received')
    console.log(`📝 Entrypoint length: ${analyzeData.entrypoint?.length || 0} characters`)

    // 7. Check Node.js and npm versions
    console.log('')
    console.log('🔍 Checking Node.js and npm versions...')
    const nodeVersionResult = await currentDevbox.execSync({
      command: 'node',
      args: ['-v'],
    })
    console.log(`📦 Node.js version: ${nodeVersionResult.stdout.trim()}`)

    const npmVersionResult = await currentDevbox.execSync({
      command: 'npm',
      args: ['-v'],
    })
    console.log(`📦 npm version: ${npmVersionResult.stdout.trim()}`)

    // 8. Enable pnpm via corepack (if needed)
    console.log('')
    console.log('🔧 Checking package manager requirements...')

    const usesPnpm = analyzeData.entrypoint.includes('pnpm')

    if (usesPnpm) {
      console.log('📦 Detected pnpm usage, enabling via corepack...')
      try {
        await currentDevbox.execSync({
          command: 'corepack',
          args: ['enable'],
        })
        console.log('✅ pnpm enabled via corepack')

        const pnpmVersionResult = await currentDevbox.execSync({
          command: 'pnpm',
          args: ['-v'],
        })
        console.log(`📦 pnpm version: ${pnpmVersionResult.stdout.trim()}`)
      } catch (error) {
        console.warn('⚠️  Failed to enable pnpm via corepack:', error instanceof Error ? error.message : String(error))
      }
    }

    // 9. Prepare entrypoint.sh with command fixes
    const entrypointPath = `${REPO_DIR}/entrypoint.sh`
    console.log('')
    console.log(`💾 Preparing entrypoint.sh...`)

    let entrypointScript = analyzeData.entrypoint
      .replace(/pnpm\s+(dev|start|build)\s+--\s+-/g, 'pnpm $1 -')
      .replace(/npm\s+(dev|start|build)\s+--\s+-/g, 'npm run $1 -')

    await currentDevbox.writeFile(entrypointPath, entrypointScript, {
      mode: 0o755,
    })
    console.log('✅ entrypoint.sh written successfully')

    // 10. Configure npm registry
    console.log('')
    console.log('🔧 Configuring npm registry...')

    const homeDir = '/home/devbox'
    const expectedRegistry = 'https://registry.npmmirror.com'

    await currentDevbox.execSync({
      command: 'npm',
      args: ['config', 'set', 'registry', expectedRegistry],
      cwd: REPO_DIR,
      env: { HOME: homeDir },
    })
    console.log(`✅ npm registry set to: ${expectedRegistry}`)

    // 11. 启动 entrypoint.sh（后台异步运行，避免超时）
    console.log('')
    console.log('🚀 Starting application via entrypoint.sh...')

    const serverProcess = await currentDevbox.executeCommand({
      command: 'bash',
      args: [entrypointPath, 'development'],
      cwd: REPO_DIR,
      env: {
        HOME: homeDir,
        NPM_CONFIG_USERCONFIG: `${homeDir}/.npmrc`,
        NPM_CONFIG_CACHE: `${homeDir}/.npm`,
      },
      timeout: 600,
    })

    console.log(`✅ Application started!`)
    console.log(`   Process ID: ${serverProcess.processId}`)
    console.log(`   PID: ${serverProcess.pid}`)

    // 等待服务器启动（pnpm install + pnpm dev 需要时间）
    console.log('')
    console.log('⏳ Waiting for dependencies installation and server startup...')
    console.log('   This may take 1-2 minutes...')
    await new Promise(resolve => setTimeout(resolve, 60000)) // 等待 60 秒

    // 检查进程状态
    try {
      const status = await currentDevbox.getProcessStatus(serverProcess.processId)
      console.log(`📊 Server status: ${status.processStatus}`)

      if (status.processStatus !== 'running') {
        console.warn('⚠️  Process may have stopped, checking logs...')
        const logs = await currentDevbox.getProcessLogs(serverProcess.processId)
        console.log('📋 Process logs:')
        console.log(logs.logs.join('\n'))
      }
    } catch (error) {
      console.warn('⚠️  Could not check process status')
    }

    // Get preview URL for port 3000
    console.log('')
    console.log('🔗 Getting preview URL for port 3000...')
    try {
      const previewLink = await currentDevbox.getPreviewLink(3000)
      console.log(`✅ Preview URL: ${previewLink.url}`)
      console.log(`   Protocol: ${previewLink.protocol}`)
      console.log(`   Port: ${previewLink.port}`)
    } catch (error) {
      console.warn('⚠️  Failed to get preview URL:', error instanceof Error ? error.message : String(error))
      console.warn('   This might be because the devbox does not have port 3000 configured or agentServer is not available')
    }

    console.log('')
    console.log('🎉 Full lifecycle example completed successfully!')
    console.log('')
    console.log('📋 Summary:')
    console.log(`   Devbox: ${name}`)
    console.log(`   Repository: ${REPO_URL}`)
    console.log(`   Project Dir: ${REPO_DIR}`)
    console.log(`   Server: npm run dev`)
    console.log('')
    console.log('💡 Cleanup: Delete devbox when done')
    console.log(`   sdk.getDevbox('${name}').then(d => d.delete())`)

  } catch (error) {
    console.error('❌ Error occurred:', error)
    throw error
  } finally {
    await sdk.close()
  }
}

// Run the example
main().catch((error) => {
  console.error('Failed to run example:', error)
  process.exit(1)
})

