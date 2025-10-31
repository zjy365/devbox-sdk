/**
 * Basic usage example for Devbox SDK
 * This demonstrates the core Phase 1 functionality
 */

import { DevboxSDK } from '../src/index'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  // 1. Initialize SDK with kubeconfig
  const kubeconfigPath = process.env.KUBECONFIG || path.join(process.env.HOME || '', '.kube', 'config')
  const kubeconfig = fs.readFileSync(kubeconfigPath, 'utf-8')

  const sdk = new DevboxSDK({
    kubeconfig,
    baseUrl: process.env.DEVBOX_API_URL || 'https://cloud.sealos.io',
    timeout: 30000,
    retries: 3,
  })

  console.log('✅ SDK initialized')

  try {
    // 2. List existing devboxes
    console.log('\n📋 Listing devboxes...')
    const devboxes = await sdk.listDevboxes()
    console.log(`Found ${devboxes.length} devbox(es)`)

    // 3. Create a new devbox (if needed)
    const devboxName = `test-devbox-${Date.now()}`
    console.log(`\n🚀 Creating devbox: ${devboxName}`)
    
    const devbox = await sdk.createDevbox({
      name: devboxName,
      runtime: 'node.js',
      resource: {
        cpu: 1,
        memory: 2,
      },
      ports: [
        {
          number: 3000,
          protocol: 'HTTP',
        },
      ],
    })

    console.log(`✅ Devbox created: ${devbox.name}`)

    // 4. Wait for devbox to be ready
    console.log('\n⏳ Waiting for devbox to be ready...')
    await devbox.waitForReady(300000, 2000) // 5 minutes timeout, check every 2 seconds
    console.log('✅ Devbox is ready and healthy')

    // 5. Write a file
    console.log('\n📝 Writing file...')
    await devbox.writeFile('/workspace/hello.txt', 'Hello from Devbox SDK!', {
      encoding: 'utf-8',
      createDirs: true,
    })
    console.log('✅ File written')

    // 6. Read the file back
    console.log('\n📖 Reading file...')
    const content = await devbox.readFile('/workspace/hello.txt', {
      encoding: 'utf-8',
    })
    console.log(`✅ File content: ${content.toString()}`)

    // 7. Execute a command
    console.log('\n⚡ Executing command...')
    const result = await devbox.executeCommand('echo "Hello from command execution"')
    console.log(`✅ Command output: ${result.stdout}`)
    console.log(`   Exit code: ${result.exitCode}`)

    // 8. Check health status
    console.log('\n🏥 Checking health...')
    const isHealthy = await devbox.isHealthy()
    console.log(`✅ Health status: ${isHealthy ? 'Healthy' : 'Unhealthy'}`)

    // 9. Get detailed info
    console.log('\n📊 Getting detailed info...')
    const info = await devbox.getDetailedInfo()
    console.log(`✅ Status: ${info.status}`)
    console.log(`   Runtime: ${info.runtime}`)
    console.log(`   Resources: ${JSON.stringify(info.resources)}`)

    // 10. List files
    console.log('\n📂 Listing files...')
    const files = await devbox.listFiles('/workspace')
    console.log(`✅ Found ${files.length} file(s) in /workspace`)

    // 11. Lifecycle operations
    console.log('\n🔄 Testing lifecycle operations...')
    
    console.log('   Pausing devbox...')
    await devbox.pause()
    console.log('   ✅ Devbox paused')
    
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    console.log('   Restarting devbox...')
    await devbox.restart()
    console.log('   ✅ Devbox restarted')
    
    await devbox.waitForReady(60000)
    console.log('   ✅ Devbox ready after restart')

    // 12. Cleanup
    console.log('\n🧹 Cleaning up...')
    await devbox.delete()
    console.log('✅ Devbox deleted')

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    throw error
  } finally {
    // 13. Close SDK
    console.log('\n👋 Closing SDK...')
    await sdk.close()
    console.log('✅ SDK closed')
  }
}

// Run the example
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { main }

