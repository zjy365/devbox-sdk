/**
 * Devbox Full Lifecycle Example - TEST VERSION
 * Testing echo $HOME only
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

async function main() {
  const sdk = new DevboxSDK(SDK_CONFIG)
  const name = generateDevboxName('test-home')

  try {
    console.log('🚀 Starting test...')
    console.log(`📦 Creating devbox: ${name}`)

    const devbox = await sdk.createDevbox({
      name,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: { cpu: 1, memory: 2 },
    })

    console.log(`✅ Devbox created: ${devbox.name}`)
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

    // TEST: Check HOME environment variable
    // Now both methods work because all commands are wrapped with sh -c by default
    console.log('')
    console.log('🔍 Testing echo $HOME...')

    // Method 1: Direct command (now automatically wrapped with sh -c)
    const homeResult1 = await currentDevbox.execSync({
      command: 'echo',
      args: ['$HOME'],
    })
    console.log('Method 1 (echo $HOME):', homeResult1)
    console.log(`📁 HOME: ${homeResult1.stdout.trim()}`)

    // Method 2: Using environment variable in command
    const homeResult2 = await currentDevbox.execSync({
      command: 'echo',
      args: ['My home is $HOME'],
    })
    console.log('Method 2 (echo My home is $HOME):', homeResult2)
    console.log(`📁 Result: ${homeResult2.stdout.trim()}`)

    // Method 3: Using pipes (shell feature)
    const homeResult3 = await currentDevbox.execSync({
      command: 'echo $HOME | wc -c',
    })
    console.log('Method 3 (pipe test):', homeResult3)
    console.log(`📁 HOME length: ${homeResult3.stdout.trim()} characters`)

/*
    // 原有的其他操作都已注释
    // const REPO_URL = 'https://github.com/zjy365/reddit-ai-assistant-extension'
    // const REPO_DIR = '/home/devbox/project/reddit-ai-assistant-extension'
    // const ANALYZE_API_URL = 'https://pgitgrfugqfk.usw.sealos.io/analyze'

    // 3. Fetch devbox info to verify it's ready
    // const fetchedDevbox = await sdk.getDevbox(name)
    // console.log(`📋 Devbox info: ${fetchedDevbox.name} - ${fetchedDevbox.status}`)

    // 4. Clean up directory first to avoid clone conflicts and permission issues
    // console.log('🧹 Cleaning up directory...')
    // try {
    //   await currentDevbox.execSync({
    //     command: 'rm',
    //     args: ['-rf', REPO_DIR],
    //   })
    // } catch {
    //   // Ignore errors if directory doesn't exist
    // }

    // 5. Git clone repository
    // console.log(`📥 Cloning repository: ${REPO_URL}`)
    // await currentDevbox.git.clone({
    //   url: REPO_URL,
    //   targetDir: REPO_DIR,
    // })
    // console.log('✅ Repository cloned successfully')

    // Verify repository was cloned by checking if directory exists
    // const repoFiles = await currentDevbox.listFiles(REPO_DIR)
    // console.log(`📁 Found ${repoFiles.files.length} files in repository`)

    // List directory contents using ls command
    // console.log('📋 Listing directory contents:')
    // const lsResult = await currentDevbox.execSync({
    //   command: 'ls',
    //   args: ['-la', REPO_DIR],
    // })
    // console.log(lsResult.stdout)

    // 6. Call analyze API using fetch with retry logic
    // console.log('🔍 Calling analyze API...')
    // const callAnalyzeAPI = async (retries = 3, timeout = 60000) => { ... }
    // const analyzeData = await callAnalyzeAPI()

    // 7. Check Node.js and npm versions
    // const nodeVersionResult = await currentDevbox.execSync({ ... })
    // const npmVersionResult = await currentDevbox.execSync({ ... })

    // 8. Enable pnpm via corepack (if needed)
    // if (usesPnpm) { ... }

    // 9. Prepare entrypoint.sh with command fixes
    // const entrypointPath = `${REPO_DIR}/entrypoint.sh`
    // await currentDevbox.writeFile(entrypointPath, entrypointScript, { mode: 0o755 })

    // 11. Configure npm registry
    // await currentDevbox.execSync({ command: 'npm', args: ['config', 'set', 'registry', expectedRegistry] })

    // 12. Start entrypoint.sh
    // const serverProcess = await currentDevbox.executeCommand({ ... })
    // const isReady = await waitForServerStartup(currentDevbox, serverProcess.processId, 3000, 180000)

    // Get preview URL for port 3000
    // const previewLink = await currentDevbox.getPreviewLink(3000)
*/

    console.log('')
    console.log('🎉 Test completed!')

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
