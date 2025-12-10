/**
 * Devbox SDK Advanced File Operations and Port Monitoring Tests
 *
 * Test Purpose:
 * This test file validates Devbox SDK advanced file operation functionality, including:
 * 1. File move operations
 * 2. File rename operations
 * 3. File download operations (multiple format support)
 * 4. Port monitoring functionality
 *
 * Test Coverage:
 * - Move files and directories
 * - Rename files and directories
 * - Download single file
 * - Download multiple files (different formats)
 * - Get listening port list
 * - Error handling and edge cases
 *
 * Notes:
 * - All tests require a real Devbox instance (created via Kubernetes API)
 * - Tests use mockServerUrl to connect to local Go Server (configured via DEVBOX_SERVER_URL environment variable)
 * - Tests create and delete Devbox instances, ensure test environment has sufficient resources
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'
import type { DevboxCreateConfig } from '../src/core/types'
import { DevboxRuntime } from '../src/api/types'

async function waitForDevboxReady(devbox: DevboxInstance, timeout = 120000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      await devbox.refreshInfo()
      if (devbox.status === 'Running') {
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

describe('Devbox SDK Advanced File Operations and Port Monitoring Tests', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-file-advanced-${Date.now()}`

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    const config: DevboxCreateConfig = {
      name: TEST_DEVBOX_NAME,
      runtime: DevboxRuntime.TEST_AGENT,
      resource: {
        cpu: 1,
        memory: 2,
      },
      ports: [{ number: 8080, protocol: 'HTTP' }],
    }

    devboxInstance = await sdk.createDevbox(config)
    await devboxInstance.start()
    await waitForDevboxReady(devboxInstance)

    // Clean up files and directories that may have been left by previous tests
    try {
      await devboxInstance.execSync({
        command: 'rm',
        args: ['-rf', './move', './move-dir', './move-overwrite', './move-no-overwrite', './rename', './rename-dir', './rename-conflict', './download', './download-multi', './download-tar', './download-targz', './download-multipart', './combo', './combo-ports'],
      })
    } catch (error) {
      // Ignore cleanup errors
    }
  }, 30000)

  afterEach(async () => {
    if (devboxInstance) {
      try {
        await devboxInstance.delete()
      } catch (error) {
        console.warn('Failed to cleanup devbox:', error)
      }
    }

    if (sdk) {
      await sdk.close()
    }
  }, 10000)

  describe('File Move Operations', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './move', './move-dir', './move-overwrite', './move-no-overwrite'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to move files', async () => {
      const sourcePath = './move/source.txt'
      const destinationPath = './move/destination.txt'
      const content = 'File to be moved'

      // Create source file
      await devboxInstance.writeFile(sourcePath, content)

      // Move file
      await devboxInstance.moveFile(sourcePath, destinationPath)

      // Verify file has been moved to new location
      const movedContent = await devboxInstance.readFile(destinationPath)
      expect(movedContent.toString()).toBe(content)

      // Verify source file no longer exists
      await expect(devboxInstance.readFile(sourcePath)).rejects.toThrow()
    }, 10000)

    it('should be able to move directories', async () => {
      const sourceDir = './move-dir/source'
      const destinationDir = './move-dir/dest'
      const filePath = `${sourceDir}/file.txt`
      const content = 'File in directory'

      // Create source directory and file
      await devboxInstance.writeFile(filePath, content)

      // Move directory
      await devboxInstance.moveFile(sourceDir, destinationDir)

      // Verify file is in new directory
      const movedFilePath = `${destinationDir}/file.txt`
      const movedContent = await devboxInstance.readFile(movedFilePath)
      expect(movedContent.toString()).toBe(content)

      // Verify source directory no longer exists
      await expect(devboxInstance.listFiles(sourceDir)).rejects.toThrow()
    }, 10000)

    it('should be able to overwrite existing destination file', async () => {
      const sourcePath = './move-overwrite/source.txt'
      const destinationPath = './move-overwrite/dest.txt'
      const sourceContent = 'New content'
      const destContent = 'Old content'

      // Create source and destination files
      await devboxInstance.writeFile(sourcePath, sourceContent)
      await devboxInstance.writeFile(destinationPath, destContent)

      // Move and overwrite
      await devboxInstance.moveFile(sourcePath, destinationPath, true)

      // Verify destination file content has been updated
      const content = await devboxInstance.readFile(destinationPath)
      expect(content.toString()).toBe(sourceContent)
    }, 10000)

    it('should throw error when moving non-existent file', async () => {
      const nonExistentPath = './move/non-existent.txt'
      const destinationPath = './move/dest.txt'

      await expect(
        devboxInstance.moveFile(nonExistentPath, destinationPath)
      ).rejects.toThrow()
    }, 5000)

    it('should throw error when moving file to existing destination without overwrite', async () => {
      const sourcePath = './move-no-overwrite/source.txt'
      const destinationPath = './move-no-overwrite/dest.txt'

      await devboxInstance.writeFile(sourcePath, 'Source content')
      await devboxInstance.writeFile(destinationPath, 'Dest content')

      await expect(
        devboxInstance.moveFile(sourcePath, destinationPath, false)
      ).rejects.toThrow()
    }, 5000)
  })

  describe('File Rename Operations', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './rename', './rename-dir', './rename-conflict'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to rename files', async () => {
      const oldPath = './rename/old-name.txt'
      const newPath = './rename/new-name.txt'
      const content = 'File to be renamed'

      // Create file
      await devboxInstance.writeFile(oldPath, content)

      // Rename file
      await devboxInstance.renameFile(oldPath, newPath)

      // Verify file has been renamed
      const renamedContent = await devboxInstance.readFile(newPath)
      expect(renamedContent.toString()).toBe(content)

      // Verify old filename no longer exists
      await expect(devboxInstance.readFile(oldPath)).rejects.toThrow()
    }, 10000)

    it('should be able to rename directories', async () => {
      const oldDirPath = './rename-dir/old-dir'
      const newDirPath = './rename-dir/new-dir'
      const filePath = `${oldDirPath}/file.txt`
      const content = 'File in renamed directory'

      // Create directory and file
      await devboxInstance.writeFile(filePath, content)

      // Rename directory
      await devboxInstance.renameFile(oldDirPath, newDirPath)

      // Verify file is in new directory
      const newFilePath = `${newDirPath}/file.txt`
      const fileContent = await devboxInstance.readFile(newFilePath)
      expect(fileContent.toString()).toBe(content)

      // Verify old directory no longer exists
      await expect(devboxInstance.listFiles(oldDirPath)).rejects.toThrow()
    }, 10000)

    it('should throw error when renaming non-existent file', async () => {
      const nonExistentPath = './rename/non-existent.txt'
      const newPath = './rename/new-name.txt'

      await expect(
        devboxInstance.renameFile(nonExistentPath, newPath)
      ).rejects.toThrow()
    }, 5000)

    it('should throw error when renaming to existing path', async () => {
      const oldPath = './rename-conflict/old.txt'
      const existingPath = './rename-conflict/existing.txt'

      await devboxInstance.writeFile(oldPath, 'Old content')
      await devboxInstance.writeFile(existingPath, 'Existing content')

      await expect(
        devboxInstance.renameFile(oldPath, existingPath)
      ).rejects.toThrow()
    }, 5000)
  })

  describe('File Download Operations', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './download', './download-multi', './download-tar', './download-targz', './download-multipart'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to download single file', async () => {
      const filePath = './download/single-file.txt'
      const content = 'File content to download'

      // Create file
      await devboxInstance.writeFile(filePath, content)

      // Download file
      const buffer = await devboxInstance.downloadFile(filePath)

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.toString()).toBe(content)
    }, 10000)

    it('should be able to download multiple files (default format)', async () => {
      const files = [
        './download-multi/file1.txt',
        './download-multi/file2.txt',
        './download-multi/file3.txt',
      ]
      const contents = ['Content 1', 'Content 2', 'Content 3']

      // Create multiple files
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // Download multiple files (default tar.gz)
      const buffer = await devboxInstance.downloadFiles(files)

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
      // tar.gz file should contain compressed data
    }, 15000)

    it('should be able to download multiple files (tar format)', async () => {
      const files = [
        './download-tar/file1.txt',
        './download-tar/file2.txt',
      ]
      const contents = ['Content 1', 'Content 2']

      // Create files
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // Download as tar format
      const buffer = await devboxInstance.downloadFiles(files, { format: 'tar' })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    }, 15000)

    it('should be able to download multiple files (tar.gz format)', async () => {
      const files = [
        './download-targz/file1.txt',
        './download-targz/file2.txt',
      ]
      const contents = ['Content 1', 'Content 2']

      // Create files
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // Download as tar.gz format
      const buffer = await devboxInstance.downloadFiles(files, { format: 'tar.gz' })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    }, 15000)

    it('should be able to download multiple files (multipart format)', async () => {
      const files = [
        './download-multipart/file1.txt',
        './download-multipart/file2.txt',
      ]
      const contents = ['Content 1', 'Content 2']

      // Create files
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // Download as multipart format
      const buffer = await devboxInstance.downloadFiles(files, { format: 'multipart' })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    }, 15000)

    it('should throw error when downloading non-existent file', async () => {
      const nonExistentPath = './download/non-existent.txt'

      await expect(
        devboxInstance.downloadFile(nonExistentPath)
      ).rejects.toThrow()
    }, 5000)

    it('should be able to handle empty file download', async () => {
      const emptyFilePath = './download/empty-file.txt'

      // Create empty file
      await devboxInstance.writeFile(emptyFilePath, '')

      // Download empty file
      const buffer = await devboxInstance.downloadFile(emptyFilePath)

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBe(0)
    }, 10000)
  })

  describe('Port Monitoring', () => {
    it('should be able to get listening ports list', async () => {
      const result = await devboxInstance.getPorts()

      expect(result.ports).toBeDefined()
      expect(Array.isArray(result.ports)).toBe(true)
      expect(result.lastUpdatedAt).toBeDefined()
      expect(typeof result.lastUpdatedAt).toBe('number')
    }, 10000)

    it('returned ports should be in valid range', async () => {
      const result = await devboxInstance.getPorts()

      // Ports should be in 3000-9999 range (server-side filtered)
      for (const port of result.ports) {
        expect(port).toBeGreaterThanOrEqual(3000)
        expect(port).toBeLessThanOrEqual(9999)
      }
    }, 10000)
  })

  describe('Combined Operations', () => {
    // Clean up test directories after each test
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './combo', './combo-ports'],
        })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should be able to move, rename and download files', async () => {
      const originalPath = './combo/original.txt'
      const movedPath = './combo/moved.txt'
      const renamedPath = './combo/final.txt'
      const content = 'Combined operations test'

      // Create file
      await devboxInstance.writeFile(originalPath, content)

      // Move file
      await devboxInstance.moveFile(originalPath, movedPath)

      // Rename file
      await devboxInstance.renameFile(movedPath, renamedPath)

      // Download file
      const buffer = await devboxInstance.downloadFile(renamedPath)
      expect(buffer.toString()).toBe(content)
    }, 15000)

    it('should be able to handle combination of file operations and port monitoring', async () => {
      const filePath = './combo-ports/test.txt'
      const content = 'Test content'

      // Create file
      await devboxInstance.writeFile(filePath, content)

      // Get ports list
      const portsResult = await devboxInstance.getPorts()
      expect(portsResult.ports).toBeDefined()
      expect(Array.isArray(portsResult.ports)).toBe(true)
      expect(portsResult.lastUpdatedAt).toBeDefined()

      // Download file
      const buffer = await devboxInstance.downloadFile(filePath)
      expect(buffer.toString()).toBe(content)

      // Get ports list again
      const portsResult2 = await devboxInstance.getPorts()
      expect(portsResult2.ports).toBeDefined()
      expect(Array.isArray(portsResult2.ports)).toBe(true)
      expect(portsResult2.lastUpdatedAt).toBeDefined()
    }, 15000)
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle path traversal attacks (move operation)', async () => {
      const maliciousPaths = ['../../../etc/passwd', './../../../etc/hosts']

      for (const path of maliciousPaths) {
        await expect(
          devboxInstance.moveFile('./test/source.txt', path)
        ).rejects.toThrow()
      }
    }, 5000)

    it('should handle path traversal attacks (rename operation)', async () => {
      const maliciousPaths = ['../../../etc/passwd', './../../../etc/hosts']

      for (const path of maliciousPaths) {
        await expect(
          devboxInstance.renameFile('./test/source.txt', path)
        ).rejects.toThrow()
      }
    }, 5000)

    it('should handle path traversal attacks (download operation)', async () => {
      const maliciousPaths = ['../../../etc/passwd', './../../../etc/hosts']

      for (const path of maliciousPaths) {
        await expect(
          devboxInstance.downloadFile(path)
        ).rejects.toThrow()
      }
    }, 5000)

    it('should handle empty paths', async () => {
      await expect(
        devboxInstance.moveFile('', './test/dest.txt')
      ).rejects.toThrow()

      await expect(
        devboxInstance.renameFile('', './test/new.txt')
      ).rejects.toThrow()

      await expect(
        devboxInstance.downloadFile('')
      ).rejects.toThrow()
    }, 5000)
  })
})

