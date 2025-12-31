/**
 * Daytona Full Lifecycle Example
 * 
 * This example demonstrates a complete sandbox lifecycle workflow using Daytona SDK:
 * 1. Create and start a sandbox
 * 2. Fetch sandbox information
 * 3. Git clone a repository
 * 4. Call analyze API to get entrypoint
 * 5. Write entrypoint.sh file
 * 6. Configure npm registry
 * 7. Start application server
 * 
 * Usage:
 *   # From project root:
 *   bun packages/sdk/examples/daytona-full-lifecycle.ts
 * 
 *   # From packages/sdk directory:
 *   bun examples/daytona-full-lifecycle.ts
 * 
 *   # From examples directory:
 *   bun daytona-full-lifecycle.ts
 * 
 *   # With environment variable:
 *   export DAYTONA_API_KEY=your-api-key
 *   bun daytona-full-lifecycle.ts
 * 
 *   # Or inline:
 *   DAYTONA_API_KEY=your-api-key bun daytona-full-lifecycle.ts
 * 
 * Requirements:
 *   - DAYTONA_API_KEY environment variable must be set (can be in .env file)
 *   - @daytonaio/sdk package must be installed: npm install @daytonaio/sdk
 */

import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Daytona } from '@daytonaio/sdk'

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
  console.warn('   Using system environment variables (export DAYTONA_API_KEY=...)')
}

// Check for DAYTONA_API_KEY
if (!process.env.DAYTONA_API_KEY) {
  console.error('')
  console.error('❌ Missing required environment variable: DAYTONA_API_KEY')
  console.error('')
  console.error('Please set it using one of these methods:')
  console.error('')
  console.error('1. Export in shell:')
  console.error('   export DAYTONA_API_KEY=your-api-key')
  console.error('   bun daytona-full-lifecycle.ts')
  console.error('')
  console.error('2. Create .env file in project root:')
  console.error('   echo "DAYTONA_API_KEY=your-api-key" > .env')
  console.error('')
  console.error('3. Pass inline:')
  console.error('   DAYTONA_API_KEY=your-api-key bun daytona-full-lifecycle.ts')
  console.error('')
  console.error('To get your API key:')
  console.error('   1. Go to https://www.daytona.io/dashboard')
  console.error('   2. Create a new API key')
  console.error('')
  process.exit(1)
}

// Helper function: generate unique name
const generateSandboxName = (prefix: string) => {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  const sanitizedPrefix = prefix.replace(/\./g, '-')
  return `example-${sanitizedPrefix}-${timestamp}-${random}`
}

// Helper function: wait for server startup with smart detection
async function waitForServerStartup(
  sandbox: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  maxWaitTime = 180000
): Promise<boolean> {
  const startTime = Date.now()
  const checkInterval = 3000 // Check every 3 seconds

  console.log('')
  console.log('⏳ Waiting for server to start...')
  console.log('   Checking logs and process status...')
  console.log('')

  // Wait 10 seconds first to let package installation start
  await new Promise(resolve => setTimeout(resolve, 10000))

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check sandbox state (Daytona uses 'state' property)
      // States: 'STARTED', 'STOPPED', 'DELETED', 'ARCHIVED'
      const state = (sandbox as any).state || 'STARTED'
      
      if (state === 'STOPPED' || state === 'DELETED' || state === 'ARCHIVED') {
        console.log('')
        console.error(`❌ Sandbox stopped with state: ${state}`)
        return false
      }

      // Display progress
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      process.stdout.write(`\r   State: ${state} | Elapsed: ${elapsed}s`)

      await new Promise(resolve => setTimeout(resolve, checkInterval))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.log(`\n⚠️  Check failed: ${errorMessage}, retrying...`)
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }
  }

  console.log('')
  console.warn(`⚠️  Server did not start within ${maxWaitTime / 1000}s`)
  return false
}

async function main() {
  // Initialize Daytona client
  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY! })
  const name = generateSandboxName('daytona-full-lifecycle')
  const REPO_URL = 'https://github.com/zjy365/reddit-ai-assistant-extension'
  const REPO_NAME = 'reddit-ai-assistant-extension'
  const ANALYZE_API_URL = 'https://pgitgrfugqfk.usw.sealos.io/analyze'

  try {
    const overallStartTime = Date.now()
    console.log('🚀 Starting Daytona full lifecycle example...')
    console.log(`📦 Creating sandbox: ${name}`)

    // 1. Create Sandbox
    const createStartTime = Date.now()
    const sandbox = await daytona.create({
      name,
      language: 'typescript', // or 'node', 'python', etc.
    }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const createDuration = Date.now() - createStartTime
    console.log(`✅ Sandbox created: ${sandbox.name || name} (${(createDuration / 1000).toFixed(2)}s)`)

    // 2. Wait for sandbox to be ready
    console.log('⏳ Waiting for sandbox to be ready...')
    const waitStartTime = Date.now()
    // Daytona sandbox states: 'STARTED', 'STOPPED', 'DELETED', 'ARCHIVED'
    let state = (sandbox as any).state || 'UNKNOWN'
    const startTime = Date.now()
    
    while (state !== 'STARTED' && Date.now() - startTime < 60000) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      state = (sandbox as any).state || 'STARTED'
      process.stdout.write('.')
    }
    const waitDuration = Date.now() - waitStartTime
    const totalStartupTime = Date.now() - overallStartTime
    console.log('')
    console.log(`✅ Sandbox is ${state}`)
    console.log(`   Sandbox ID: ${(sandbox as any).id || 'N/A'}`)
    console.log(`   ⏱️  Startup time: ${(waitDuration / 1000).toFixed(2)}s (wait) + ${(createDuration / 1000).toFixed(2)}s (create) = ${(totalStartupTime / 1000).toFixed(2)}s (total)`)

    // 3. Get user root directory and check HOME
    console.log('')
    console.log('🔍 Checking user root directory and HOME...')
    let userRootDir = '/home/daytona' // Default fallback
    try {
      // Get user root directory using Daytona SDK method
      if (typeof (sandbox as any).getUserRootDir === 'function') {
        userRootDir = await (sandbox as any).getUserRootDir()
        console.log(`📁 User root directory: ${userRootDir}`)
      }
      
      // Check HOME using executeCommand for shell commands
      const homeResult = await sandbox.process.executeCommand('echo $HOME')
      const homeDir = homeResult.result?.trim() || userRootDir
      console.log(`📁 HOME: ${homeDir}`)
      if (homeDir !== userRootDir) {
        userRootDir = homeDir
      }
    } catch (error) {
      console.warn('⚠️  Could not check directories:', error instanceof Error ? error.message : String(error))
      console.log(`📁 Using default root directory: ${userRootDir}`)
    }
    
    // Build absolute path for repository directory
    const REPO_DIR = `${userRootDir}/${REPO_NAME}`
    console.log(`📁 Repository will be cloned to: ${REPO_DIR}`)

    // 4. Clean up directory first to avoid clone conflicts
    // console.log('')
    // console.log('🧹 Cleaning up directory...')
    // try {
    //   // Use fs module to delete directory if it exists
    //   const deleteCode = `
    //     const fs = require('fs');
    //     const path = require('path');
    //     try {
    //       if (fs.existsSync('${REPO_DIR}')) {
    //         fs.rmSync('${REPO_DIR}', { recursive: true, force: true });
    //         console.log('Directory deleted');
    //       } else {
    //         console.log('Directory does not exist');
    //       }
    //     } catch (e) {
    //       console.log('Cleanup skipped:', e.message);
    //     }
    //   `
    //   await sandbox.process.codeRun(deleteCode)
    // } catch {
    //   // Ignore errors if directory doesn't exist
    // }

    // 5. Git clone repository
    console.log('')
    console.log(`📥 Cloning repository: ${REPO_URL}`)
    let cloneSuccess = false
    const maxRetries = 3
    
    // Try using Daytona SDK git.clone first
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   Attempt ${attempt}/${maxRetries} using git.clone...`)
        // Use Daytona SDK git.clone(url, targetDir)
        // targetDir is relative to workspace, or absolute path starting with /
        await sandbox.git.clone(REPO_URL, REPO_DIR)
        console.log('✅ Repository cloned successfully')
        cloneSuccess = true
        break
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isLastAttempt = attempt === maxRetries
        
        if (errorMessage.includes('connection refused') || errorMessage.includes('dial tcp')) {
          console.warn(`⚠️  Network error (attempt ${attempt}/${maxRetries}): ${errorMessage}`)
          if (!isLastAttempt) {
            console.log('   Retrying in 3 seconds...')
            await new Promise(resolve => setTimeout(resolve, 3000))
            continue
          }
        }
        
        if (isLastAttempt) {
          // Fallback: try using git command directly
          console.log('')
          console.log('📝 Trying fallback: using git command directly...')
          try {
            const gitCloneResult = await sandbox.process.executeCommand(
              `git clone ${REPO_URL} ${REPO_DIR}`,
              '.'
            )
            if (gitCloneResult.exitCode === 0) {
              console.log('✅ Repository cloned successfully (using git command)')
              cloneSuccess = true
              break
            }
            throw new Error(`Git clone failed: ${gitCloneResult.result}`)
          } catch (fallbackError) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            throw new Error(`Failed to clone repository after ${maxRetries} attempts and fallback: ${errorMessage}. Fallback error: ${fallbackMessage}`)
          }
        }
      }
    }
    
    if (!cloneSuccess) {
      throw new Error('Failed to clone repository: All attempts failed')
    }

    // Verify repository was cloned using fs.listFiles
    console.log('📋 Verifying repository contents...')
    try {
      const files = await sandbox.fs.listFiles(REPO_DIR)
      console.log(`📁 Found ${files.length} items in repository`)
      for (const file of files.slice(0, 10)) {
        console.log(`   ${(file as any).isDir ? '📁' : '📄'} ${(file as any).name}${(file as any).size ? ` (${(file as any).size} bytes)` : ''}`)
      }
      if (files.length > 10) {
        console.log(`   ... and ${files.length - 10} more items`)
      }
    } catch (error) {
      console.warn('⚠️  Could not list files:', error instanceof Error ? error.message : String(error))
    }

    // 6. Call analyze API using fetch with retry logic
    console.log('')
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
    const nodeVersionResult = await sandbox.process.executeCommand('node -v')
    console.log(`📦 Node.js version: ${nodeVersionResult.result?.trim() || 'N/A'}`)

    const npmVersionResult = await sandbox.process.executeCommand('npm -v')
    console.log(`📦 npm version: ${npmVersionResult.result?.trim() || 'N/A'}`)

    // 8. Check package manager requirements
    console.log('')
    console.log('🔧 Checking package manager requirements...')

    const usesPnpm = analyzeData.entrypoint?.includes('pnpm') || false

    if (usesPnpm) {
      console.log('📦 Detected pnpm usage...')
      try {
        const pnpmVersionResult = await sandbox.process.executeCommand('pnpm -v')
        console.log(`📦 pnpm version: ${pnpmVersionResult.result?.trim() || 'N/A'}`)
      } catch (error) {
        console.warn('⚠️  pnpm not available:', error instanceof Error ? error.message : String(error))
      }
    }

    // 9. Prepare entrypoint.sh with command fixes
    const entrypointPath = `${REPO_DIR}/entrypoint.sh`
    console.log('')
    console.log(`💾 Preparing entrypoint.sh...`)

    const entrypointScript = analyzeData.entrypoint
      .replace(/pnpm\s+(dev|start|build)\s+--\s+-/g, 'pnpm $1 -')
      .replace(/npm\s+(dev|start|build)\s+--\s+-/g, 'npm run $1 -')

    // Write entrypoint.sh file using fs.uploadFile
    try {
      // Convert script to Buffer
      const fileContent = Buffer.from(entrypointScript, 'utf-8')
      
      // Upload file using Daytona SDK fs.uploadFile
      await sandbox.fs.uploadFile(fileContent, entrypointPath)
      
      // Set file permissions to executable (755)
      await sandbox.fs.setFilePermissions(entrypointPath, { mode: '755' })
      
      console.log('✅ entrypoint.sh written successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to write entrypoint.sh: ${errorMessage}`)
    }

    // 10. Configure npm registry
    console.log('')
    console.log('🔧 Configuring npm registry...')

    const expectedRegistry = 'https://registry.npmmirror.com'

    const registryResult = await sandbox.process.executeCommand(
      `npm config set registry ${expectedRegistry}`,
      REPO_DIR
    )
    if (registryResult.exitCode !== 0) {
      console.warn(`⚠️  Failed to set npm registry: ${registryResult.result}`)
    } else {
      console.log(`✅ npm registry set to: ${expectedRegistry}`)
    }

    // 11. Start entrypoint.sh (run asynchronously in background)
    console.log('')
    console.log('🚀 Starting application via entrypoint.sh...')

    // Start the server process
    let serverProcess: any
    try {
      // Try using process.start if available
      if (sandbox.process && typeof (sandbox.process as any).start === 'function') {
        serverProcess = await (sandbox.process as any).start({
          command: `bash ${entrypointPath} development`,
          cwd: REPO_DIR,
        })
        console.log(`✅ Application started!`)
        console.log(`   Process ID: ${serverProcess.id || 'N/A'}`)
      } else {
        // Fallback: use executeCommand for background execution
        console.log('📝 Starting server in background...')
        // Use executeCommand with nohup to run in background
        serverProcess = await sandbox.process.executeCommand(
          `nohup bash ${entrypointPath} development > /tmp/server.log 2>&1 & echo $!`,
          REPO_DIR
        )
        console.log(`✅ Application started!`)
        console.log(`   Process output: ${serverProcess.result?.trim() || 'N/A'}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to start server: ${errorMessage}`)
    }

    // Wait for server startup
    const isReady = await waitForServerStartup(sandbox, 180000)

    if (!isReady) {
      console.warn('⚠️  Server may not have started within timeout, but continuing...')
    }

    // Get preview URL for port 3000
    console.log('')
    console.log('🔗 Getting preview URL for port 3000...')
    try {
      // Try different methods to get preview URL
      let previewUrl: string
      if (typeof (sandbox as any).getPreviewLink === 'function') {
        const previewLink = await (sandbox as any).getPreviewLink(3000)
        previewUrl = typeof previewLink === 'string' ? previewLink : (previewLink?.url || String(previewLink))
      } else if ((sandbox as any).preview && typeof (sandbox as any).preview.getUrl === 'function') {
        previewUrl = await (sandbox as any).preview.getUrl(3000)
      } else {
        // Fallback: construct URL from sandbox info
        const sandboxInfo = (sandbox as any).getInfo ? await (sandbox as any).getInfo() : {}
        previewUrl = sandboxInfo.previewUrl || `https://${sandboxInfo.id || name || 'sandbox'}.daytona.io:3000`
      }
      console.log(`✅ Preview URL: ${previewUrl}`)
    } catch (error) {
      console.warn('⚠️  Failed to get preview URL:', error instanceof Error ? error.message : String(error))
      console.warn('   This might be because the sandbox does not have port 3000 configured')
    }

    console.log('')
    console.log('🎉 Daytona full lifecycle example completed successfully!')
    console.log('')
    console.log('📋 Summary:')
    console.log(`   Sandbox: ${name}`)
    console.log(`   Repository: ${REPO_URL}`)
    console.log(`   Project Dir: ${REPO_DIR}`)
    console.log(`   Server: npm run dev`)
    console.log('')
    console.log('💡 Cleanup: Delete sandbox when done')
    console.log(`   await sandbox.delete()`)

  } catch (error) {
    console.error('❌ Error occurred:', error)
    throw error
  }
}

// Run the example
main().catch((error) => {
  console.error('Failed to run example:', error)
  process.exit(1)
})

