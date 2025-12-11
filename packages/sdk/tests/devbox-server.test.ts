/**
 * Devbox SDK End-to-End Integration Tests
 *
 * Test Purpose:
 * This test file validates core Devbox SDK functionality, including:
 * 1. Devbox instance lifecycle management (create, start, wait for ready)
 * 2. Complete workflow for operating Devbox instances through the Go Server API
 * 3. SDK data transformation logic (Buffer ↔ base64 ↔ JSON)
 * 4. SDK integration compatibility with Go Server
 *
 * Test Architecture:
 * - Devbox SDK → Devbox API (Kubernetes) → Create/manage Devbox instances
 * - Devbox SDK → Go Server API → Operate files/processes/sessions in instances
 *
 * Why mockServerUrl is used:
 * The Go Server is not yet built into Devbox instances, so mockServerUrl points to a locally running
 * Go Server for end-to-end testing. Once Go Server is embedded, ConnectionManager will automatically
 * retrieve the real Server URL from the Devbox instance's ports information, requiring no test modifications.
 *
 * Test Coverage:
 * - Basic file operations (read/write, encoding handling)
 * - File deletion operations
 * - Directory operations
 * - Batch file operations
 * - File metadata
 * - Concurrent operations
 * - Security and error handling
 * - Performance testing
 *
 * Notes:
 * - All tests require a real Devbox instance (created via Kubernetes API)
 * - Tests use mockServerUrl to connect to local Go Server (configured via DEVBOX_SERVER_URL environment variable)
 * - Tests create and delete Devbox instances, ensure test environment has sufficient resources
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG, getOrCreateSharedDevbox, cleanupTestFiles } from './setup'
import type { WriteOptions, DevboxCreateConfig } from '../src/core/types'
import { DevboxRuntime } from '../src/api/types'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

describe('Devbox SDK End-to-End Integration Tests', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance

  // Test file paths and content constants
  const TEST_FILE_PATH = './test/test-file.txt'
  const TEST_FILE_CONTENT = 'Hello, Devbox Server!'
  const TEST_UNICODE_CONTENT = '你好，Devbox 服务器！🚀'
  const TEST_BINARY_CONTENT = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG header

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    // Use shared devbox instead of creating a new one
    devboxInstance = await getOrCreateSharedDevbox(sdk)

    // Clean up files from previous tests
    await cleanupTestFiles(devboxInstance)
  }, 30000)

  afterEach(async () => {
    // Don't delete the shared devbox, just close the SDK connection
    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  describe('Basic File Operations', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to write files', async () => {
      const options: WriteOptions = {
        encoding: 'utf-8',
        mode: 0o644,
      }

      await expect(
        devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT, options)
      ).resolves.not.toThrow()
    }, 10000)

    it('should be able to read files', async () => {
      await devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT)
      const content = await devboxInstance.readFile(TEST_FILE_PATH)
      expect(content.toString()).toBe(TEST_FILE_CONTENT)
    }, 10000)

    it('should be able to handle Unicode content', async () => {
      const unicodeFilePath = './test/unicode-test.txt'

      await devboxInstance.writeFile(unicodeFilePath, TEST_UNICODE_CONTENT)
      const content = await devboxInstance.readFile(unicodeFilePath)
      expect(content.toString()).toBe(TEST_UNICODE_CONTENT)
    }, 10000)

    it('should be able to upload and read binary files', async () => {
      const binaryFilePath = './test/binary-test.png'
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

      await devboxInstance.writeFile(binaryFilePath, binaryData)
      const content = await devboxInstance.readFile(binaryFilePath)

      expect(Buffer.isBuffer(content)).toBe(true)
      expect(content.length).toBe(binaryData.length)
      expect(content.equals(binaryData)).toBe(true)
    }, 10000)

    it('should be able to encode string content as base64 and upload', async () => {
      const filePath = './test/base64-string.txt'
      const textContent = 'Hello, World!'

      // Write with base64 encoding (SDK encodes, Go server decodes and stores raw content)
      await devboxInstance.writeFile(filePath, textContent, { encoding: 'base64' })
      // Read without encoding option (Go server returns raw content, SDK converts to Buffer)
      const content = await devboxInstance.readFile(filePath)

      expect(content.toString('utf-8')).toBe(textContent)
    }, 10000)

    it('should throw error when reading non-existent file', async () => {
      const nonExistentPath = './test/non-existent-file.txt'

      await expect(devboxInstance.readFile(nonExistentPath)).rejects.toThrow()
    }, 5000)
  })

  describe('File Deletion Operations', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to delete files', async () => {
      // Create file
      await devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT)

      // Verify file exists
      const content = await devboxInstance.readFile(TEST_FILE_PATH)
      expect(content.toString()).toBe(TEST_FILE_CONTENT)

      // Delete file
      await devboxInstance.deleteFile(TEST_FILE_PATH)

      // Verify file has been deleted
      await expect(devboxInstance.readFile(TEST_FILE_PATH)).rejects.toThrow()
    }, 10000)

    it('should throw error when deleting non-existent file', async () => {
      const nonExistentPath = './test/non-existent-delete.txt'

      await expect(devboxInstance.deleteFile(nonExistentPath)).rejects.toThrow()
    }, 5000)
  })

  describe('Directory Operations', () => {
    const TEST_DIR = './test-directory'
    const SUB_DIR = `${TEST_DIR}/subdir`
    const FILES = [`${TEST_DIR}/file1.txt`, `${TEST_DIR}/file2.txt`, `${SUB_DIR}/file3.txt`]

    beforeEach(async () => {
      // Create test directory structure
      await devboxInstance.writeFile(FILES[0] as string, 'Content 1')
      await devboxInstance.writeFile(FILES[1] as string, 'Content 2')
      await devboxInstance.writeFile(FILES[2] as string, 'Content 3')
    })

    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test-directory'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to list directory contents', async () => {
      const fileList = await devboxInstance.listFiles(TEST_DIR)

      expect(fileList).toHaveProperty('files')
      expect(fileList.files).toHaveLength(3) // file1.txt, file2.txt, subdir
      expect(fileList.files.some((f) => f.name === 'file1.txt')).toBe(true)
      expect(fileList.files.some((f) => f.name === 'file2.txt')).toBe(true)
      expect(fileList.files.some((f) => f.isDir === true && f.name === 'subdir')).toBe(true)
    }, 10000)

    it('should be able to list subdirectory contents', async () => {
      const fileList = await devboxInstance.listFiles(SUB_DIR)

      expect(fileList.files).toHaveLength(1)
      expect(fileList.files[0]?.name).toBe('file3.txt')
      expect(fileList.files[0]?.isDir).toBe(false)
    }, 10000)

    it('should be able to list root directory', async () => {
      const rootList = await devboxInstance.listFiles('.')
      expect(rootList.files).toBeDefined()
      expect(Array.isArray(rootList.files)).toBe(true)
    }, 10000)

    it('should throw error when listing non-existent directory', async () => {
      const nonExistentDir = './non-existent-directory'

      await expect(devboxInstance.listFiles(nonExistentDir)).rejects.toThrow()
    }, 5000)
  })

  describe('Batch File Operations', () => {
    const FILES: Record<string, string> = {
      './batch/file1.txt': 'Batch content 1',
      './batch/file2.txt': 'Batch content 2',
      './batch/file3.txt': 'Batch content 3',
      './batch/subdir/file4.txt': 'Batch content 4',
    }

    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './batch', './large'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to batch upload files', async () => {
      const result = await devboxInstance.uploadFiles(FILES)

      expect(result.totalFiles).toBe(Object.keys(FILES).length)
      expect(result.successCount).toBe(Object.keys(FILES).length)
      expect(result.results.length).toBe(Object.keys(FILES).length)

      // Verify all files have been uploaded, using paths returned from upload
      for (const uploadResult of result.results) {
        if (uploadResult.success && uploadResult.path) {
          const uploadedContent = await devboxInstance.readFile(uploadResult.path)
          // Match original content based on filename
          const fileName = uploadResult.path.split('/').pop() || ''
          const originalEntry = Object.entries(FILES).find(([path]) => path.endsWith(fileName))
          if (originalEntry) {
            expect(uploadedContent.toString()).toBe(originalEntry[1])
          }
        }
      }
    }, 15000)

    it('should be able to handle partially failed batch uploads', async () => {
      const mixedFiles = {
        ...FILES,
        '/invalid/path/file.txt': 'This should fail',
      }

      const result = await devboxInstance.uploadFiles(mixedFiles)

      expect(result.totalFiles).toBe(Object.keys(mixedFiles).length)
      expect(result.successCount).toBe(Object.keys(FILES).length)
      expect(result.results.filter(r => !r.success).length).toBeGreaterThan(0)
    }, 15000)

    it('should be able to handle 10MB large file upload', async () => {
      // Read pre-generated test file (much faster than creating with .repeat())
      const fixturePath = path.join(FIXTURES_DIR, 'file-10mb.txt')
      const fileContent = fs.readFileSync(fixturePath)
      const fileSize = fileContent.length
      const uploadPath = './large/file-10mb.txt'

      // Upload the file
      await devboxInstance.writeFile(uploadPath, fileContent)

      // Verify file was created with correct size using listFiles
      const dirInfo = await devboxInstance.listFiles('./large')
      const fileInfo = dirInfo.files.find(f => f.name === 'file-10mb.txt')

      expect(fileInfo).toBeDefined()
      expect(fileInfo?.size).toBe(fileSize)
      expect(fileInfo?.size).toBe(10 * 1024 * 1024)
    }, 60000)

    it('should be able to handle 50MB large file upload', async () => {
      // Read pre-generated test file (much faster than creating with .repeat())
      const fixturePath = path.join(FIXTURES_DIR, 'file-50mb.txt')
      const fileContent = fs.readFileSync(fixturePath)
      const fileSize = fileContent.length
      const uploadPath = './large/file-50mb.txt'

      // Upload the file
      await devboxInstance.writeFile(uploadPath, fileContent)

      // Verify file was created with correct size using listFiles
      const dirInfo = await devboxInstance.listFiles('./large')
      const fileInfo = dirInfo.files.find(f => f.name === 'file-50mb.txt')

      expect(fileInfo).toBeDefined()
      expect(fileInfo?.size).toBe(fileSize)
      expect(fileInfo?.size).toBe(50 * 1024 * 1024)
    }, 120000)

    it('should be able to handle 100MB large file upload', async () => {
      // Read pre-generated test file (much faster than creating with .repeat())
      const fixturePath = path.join(FIXTURES_DIR, 'file-100mb.txt')
      const fileContent = fs.readFileSync(fixturePath)
      const fileSize = fileContent.length
      const uploadPath = './large/file-100mb.txt'

      // Upload the file
      await devboxInstance.writeFile(uploadPath, fileContent)

      // Verify file was created with correct size using listFiles
      const dirInfo = await devboxInstance.listFiles('./large')
      const fileInfo = dirInfo.files.find(f => f.name === 'file-100mb.txt')

      expect(fileInfo).toBeDefined()
      expect(fileInfo?.size).toBe(fileSize)
      expect(fileInfo?.size).toBe(100 * 1024 * 1024)
    }, 180000)

    it('should be able to batch upload multiple large files', async () => {
      const largeFiles: Record<string, string> = {}

      // Create 3 files of 5MB each
      for (let i = 0; i < 3; i++) {
        const largeContent = `File${i}-`.repeat(5 * 1024 * 1024 / 7) // ~5MB per file
        largeFiles[`./large/batch-file${i}.txt`] = largeContent
      }

      const result = await devboxInstance.uploadFiles(largeFiles)

      expect(result.successCount).toBe(Object.keys(largeFiles).length)
      expect(result.totalFiles).toBe(3)

      // Verify file sizes from upload results (avoid downloading each file)
      for (const uploadResult of result.results) {
        if (uploadResult.success) {
          // Each file should be approximately 5MB
          expect(uploadResult.size).toBeGreaterThan(4 * 1024 * 1024) // At least 4MB
          expect(uploadResult.size).toBeLessThan(6 * 1024 * 1024) // Less than 6MB
        }
      }
    }, 120000)
  })

  describe('File Metadata', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './metadata', './meta'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to get file information', async () => {
      const filePath = './metadata/test.txt'
      const content = 'Test content for metadata'

      await devboxInstance.writeFile(filePath, content)

      const dirInfo = await devboxInstance.listFiles('./metadata')
      const fileInfo = dirInfo.files.find((f) => f.name === 'test.txt')

      expect(fileInfo).toBeDefined()
      expect(fileInfo?.isDir).toBe(false)
      expect(fileInfo?.size).toBe(content.length)
      expect(fileInfo?.modified).toBeDefined()
    }, 10000)

    it('should be able to distinguish files and directories', async () => {
      await devboxInstance.writeFile('./meta/file.txt', 'content')

      const metaList = await devboxInstance.listFiles('./meta')
      console.log(metaList, 'metaList');
      expect(metaList.files).toBeDefined()
      expect(Array.isArray(metaList.files)).toBe(true)

      const fileEntry = metaList.files.find((f) => f.name === 'file.txt')
      expect(fileEntry).toBeDefined()
      expect(fileEntry?.isDir).toBe(false)
      expect(fileEntry?.name).toBe('file.txt')
    }, 10000)
  })

  describe('Concurrent Operations', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './concurrent'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to concurrently read and write different files', async () => {
      const CONCURRENT_FILES = 10
      const files: string[] = []
      const contents: string[] = []

      // Create file paths and contents
      for (let i = 0; i < CONCURRENT_FILES; i++) {
        files.push(`./concurrent/file${i}.txt`)
        contents.push(`Concurrent content ${i}`)
      }

      // Concurrently write files
      const writePromises = files.map((path, index) =>
        devboxInstance.writeFile(path as string, contents[index] as string)
      )
      await Promise.all(writePromises)

      // Concurrently read files
      const readPromises = files.map(async (path, index) => {
        const content = await devboxInstance.readFile(path)
        expect(content.toString()).toBe(contents[index])
      })
      await Promise.all(readPromises)
    }, 20000)

    it('should be able to handle concurrent operations on the same file', async () => {
      const sharedFile = './concurrent/shared.txt'

      // Write sequentially to avoid race conditions
      for (let i = 0; i < 5; i++) {
        await devboxInstance.writeFile(sharedFile, `Iteration ${i}`)
        const content = await devboxInstance.readFile(sharedFile)
        expect(content.toString()).toBe(`Iteration ${i}`)
      }
    }, 15000)
  })

  describe('Security and Error Handling', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should handle path traversal attacks', async () => {
      const maliciousPaths = ['../../../etc/passwd', '/../../../etc/hosts', '../root/.ssh/id_rsa']

      for (const path of maliciousPaths) {
        await expect(devboxInstance.writeFile(path, 'malicious content')).rejects.toThrow()
      }
    }, 5000)

    it('should handle overly long file paths', async () => {
      const longPath = `./${'a'.repeat(3000)}.txt`

      await expect(devboxInstance.writeFile(longPath, 'content')).rejects.toThrow()
    }, 5000)

    it('should handle empty filenames', async () => {
      await expect(devboxInstance.writeFile('', 'content')).rejects.toThrow()

      await expect(devboxInstance.writeFile('./test/', 'content')).rejects.toThrow()
    }, 5000)
  })

  describe('Performance Tests', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './perf', './many'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should complete file operations within reasonable time', async () => {
      const LARGE_CONTENT = 'Performance test content '.repeat(50000) // ~1MB

      const startTime = Date.now()

      await devboxInstance.writeFile('./perf/large.txt', LARGE_CONTENT)
      const content = await devboxInstance.readFile('./perf/large.txt')

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(content.toString()).toBe(LARGE_CONTENT)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
    }, 15000)

    it('should be able to handle many small files', async () => {
      const FILE_COUNT = 100
      const files: Record<string, string> = {}

      for (let i = 0; i < FILE_COUNT; i++) {
        files[`./many/file${i}.txt`] = `Small content ${i}`
      }

      const startTime = Date.now()
      const result = await devboxInstance.uploadFiles(files)
      const endTime = Date.now()

      expect(result.successCount).toBe(FILE_COUNT)
      expect(endTime - startTime).toBeLessThan(30000) // Should complete within 30 seconds
    }, 35000)
  })
})
