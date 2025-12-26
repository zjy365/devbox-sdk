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
  const REPO_URL = 'https://github.com/pdsuwwz/nextjs-nextra-starter'
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

    // Configure npm to use Taobao mirror
    console.log('')
    console.log('🔧 Configuring npm to use Taobao mirror...')
    await currentDevbox.execSync({
      command: 'npm',
      args: ['config', 'set', 'registry', 'https://registry.npmmirror.com'],
    })
    console.log('✅ npm registry configured')
    
    // Verify npm registry configuration
    const npmRegistryCheck = await currentDevbox.execSync({
      command: 'npm',
      args: ['config', 'get', 'registry'],
    })
    console.log(`📦 Current npm registry: ${npmRegistryCheck.stdout.trim()}`)

    // 6. Call analyze API using fetch
    console.log('🔍 Calling analyze API...')
    const analyzeResponse = await fetch(ANALYZE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo_url: REPO_URL,
      }),
    })

    if (!analyzeResponse.ok) {
      throw new Error(`Analyze API failed: ${analyzeResponse.statusText}`)
    }

    const analyzeData = await analyzeResponse.json()
    console.log('✅ Analyze API response received')
    console.log(`📝 Entrypoint length: ${analyzeData.entrypoint?.length || 0} characters`)

    // Check Node.js and npm versions before writing entrypoint
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

    // 7. Write entrypoint.sh file
    const entrypointPath = `${REPO_DIR}/entrypoint.sh`
    console.log('')
    console.log(`💾 Writing entrypoint.sh to ${entrypointPath}...`)
    
    // Replace pnpm with npm in entrypoint script
    const entrypointScript = analyzeData.entrypoint.replace(/pnpm/g, 'npm')
    
    await currentDevbox.writeFile(entrypointPath, entrypointScript, {
      mode: 0o755,
    })
    console.log('✅ entrypoint.sh written successfully (converted pnpm to npm)')

    // 8. Verify entrypoint.sh was created with correct content
    const entrypointContent = await currentDevbox.readFile(entrypointPath)
    if (entrypointContent.toString() === entrypointScript) {
      console.log('✅ entrypoint.sh content verified')
    } else {
      console.warn('⚠️  entrypoint.sh content mismatch')
    }

    // Verify file permissions (if supported)
    const entrypointInfo = await currentDevbox.listFiles(REPO_DIR)
    const entrypointFile = entrypointInfo.files.find(f => f.name === 'entrypoint.sh')
    if (entrypointFile) {
      console.log('✅ entrypoint.sh found in directory listing')
    }

    // Cat the entrypoint.sh file to view its content
    console.log('')
    console.log('📄 Viewing entrypoint.sh file content:')
    const catResult = await currentDevbox.execSync({
      command: 'cat',
      args: [entrypointPath],
    })
    console.log(catResult.stdout)
    console.log('')

    // Add execute permission to entrypoint.sh
    console.log('')
    console.log('🔧 Adding execute permission to entrypoint.sh...')
    await currentDevbox.execSync({
      command: 'chmod',
      args: ['+x', entrypointPath],
    })
    console.log('✅ Execute permission added')

    // List directory contents again after adding execute permission
    console.log('')
    console.log('📋 Final directory contents after adding execute permission:')
    const finalLsResult = await currentDevbox.execSync({
      command: 'ls',
      args: ['-la', entrypointPath],
    })
    console.log(finalLsResult.stdout)

    // Execute the entrypoint.sh script
    console.log('')
    console.log('🚀 Executing entrypoint.sh script...')
    console.log(`📂 Changing directory to ${REPO_DIR}`)
    const execResult = await currentDevbox.execSync({
      command: 'bash',
      args: [entrypointPath, 'development'],
      cwd: REPO_DIR,
    })
    console.log('📤 Script output:')
    console.log(execResult.stdout)
    if (execResult.stderr) {
      console.log('⚠️  Script errors:')
      console.log(execResult.stderr)
    }
    console.log(`✅ Script executed with exit code: ${execResult.exitCode}`)

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
    console.log(`📦 Devbox name: ${name}`)
    console.log(`📁 Repository: ${REPO_DIR}`)
    console.log(`📄 Entrypoint: ${entrypointPath}`)

    // Cleanup option
    console.log('')
    console.log('💡 Note: Devbox will be cleaned up automatically or you can delete it manually:')
    console.log(`   await sdk.getDevbox('${name}').delete()`)

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

