/**
 * Devbox SDK Basic File Operations Test
 * Tests basic file operations: write, read, list, and delete files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG, getOrCreateSharedDevbox, cleanupTestFiles } from './setup'

describe('Devbox SDK Basic File Operations', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)
    devboxInstance = await getOrCreateSharedDevbox(sdk)
    console.log('devboxInstance', devboxInstance);
    
    await cleanupTestFiles(devboxInstance, ['.'])
  }, 30000)

  afterEach(async () => {
    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  it('should write, read, list, and delete files', async () => {
    // Write files
    const lsResult = await devboxInstance.execSync({
      command: 'ls',
      args: ['.'],
    })

    console.log('lsResult', lsResult);


    await devboxInstance.writeFile('./test.txt', 'Hello, Devbox SDK!')
    await devboxInstance.writeFile('./app.js', 'console.log("Hello World")')

    // List files
    const fileList = await devboxInstance.listFiles('.')
    expect(fileList.files).toBeDefined()
    expect(fileList.files.length).toBeGreaterThanOrEqual(2)

    // Read file
    const content = await devboxInstance.readFile('./test.txt')
    expect(content.toString()).toBe('Hello, Devbox SDK!')

    // Delete file
    await devboxInstance.deleteFile('./test.txt')

    // Verify file deleted
    const fileList2 = await devboxInstance.listFiles('.')
    const testFileExists = fileList2.files.some(f => f.name === 'test.txt')
    expect(testFileExists).toBe(false)
  }, 15000)
})

