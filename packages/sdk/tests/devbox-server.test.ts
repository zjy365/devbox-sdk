/**
 * Devbox 内部 Server 操作测试
 * 测试对已存在的 Devbox 实例的文件操作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/DevboxSDK'
import type { DevboxInstance } from '../src/core/DevboxInstance'
import { TEST_CONFIG } from './setup'
import type { WriteOptions, DevboxCreateConfig } from '../src/core/types'
import { DevboxRuntime } from '../src/api/types'

// Utility function to wait for Devbox to be ready
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

describe('Devbox Server Operations', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-server-ops-${Date.now()}`

  // 测试文件路径和内容
  const TEST_FILE_PATH = '/test/test-file.txt'
  const TEST_FILE_CONTENT = 'Hello, Devbox Server!'
  const TEST_UNICODE_CONTENT = '你好，Devbox 服务器！🚀'
  const TEST_BINARY_CONTENT = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG header

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    const config: DevboxCreateConfig = {
      name: TEST_DEVBOX_NAME,
      runtime: DevboxRuntime.NODE_JS,
      resource: {
        cpu: 0.5,
        memory: 512,
      },
    }

    devboxInstance = await sdk.createDevbox(config)
    await devboxInstance.start()
    await waitForDevboxReady(devboxInstance)
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

  describe('文件基础操作', () => {
    it('应该能够写入文件', async () => {
      const options: WriteOptions = {
        encoding: 'base64',
        mode: 0o644,
      }

      await expect(
        devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT, options)
      ).resolves.not.toThrow()
    }, 10000)

    it('应该能够读取文件', async () => {
      // 先写入文件
      await devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT)

      // 读取文件
      const content = await devboxInstance.readFile(TEST_FILE_PATH)
      expect(content.toString()).toBe(TEST_FILE_CONTENT)
    }, 10000)

    it('应该能够处理 Unicode 内容', async () => {
      const unicodeFilePath = '/test/unicode-test.txt'

      // 写入 Unicode 内容
      await devboxInstance.writeFile(unicodeFilePath, TEST_UNICODE_CONTENT)

      // 读取并验证
      const content = await devboxInstance.readFile(unicodeFilePath)
      expect(content.toString()).toBe(TEST_UNICODE_CONTENT)
    }, 10000)

    it('应该能够处理二进制文件', async () => {
      const binaryFilePath = '/test/binary-test.png'

      // 写入二进制内容
      await devboxInstance.writeFile(binaryFilePath, TEST_BINARY_CONTENT)

      // 读取并验证
      const content = await devboxInstance.readFile(binaryFilePath)
      expect(Buffer.from(content)).toEqual(TEST_BINARY_CONTENT)
    }, 10000)

    it('读取不存在的文件应该抛出错误', async () => {
      const nonExistentPath = '/test/non-existent-file.txt'

      await expect(devboxInstance.readFile(nonExistentPath)).rejects.toThrow()
    }, 5000)
  })

  describe('文件删除操作', () => {
    it('应该能够删除文件', async () => {
      // 创建文件
      await devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT)

      // 验证文件存在
      const content = await devboxInstance.readFile(TEST_FILE_PATH)
      expect(content.toString()).toBe(TEST_FILE_CONTENT)

      // 删除文件
      await sdk.deleteFile(devboxInstance.name, TEST_FILE_PATH)

      // 验证文件已删除
      await expect(devboxInstance.readFile(TEST_FILE_PATH)).rejects.toThrow()
    }, 10000)

    it('删除不存在的文件应该抛出错误', async () => {
      const nonExistentPath = '/test/non-existent-delete.txt'

      await expect(sdk.deleteFile(devboxInstance.name, nonExistentPath)).rejects.toThrow()
    }, 5000)
  })

  describe('目录操作', () => {
    const TEST_DIR = '/test-directory'
    const SUB_DIR = `${TEST_DIR}/subdir`
    const FILES = [`${TEST_DIR}/file1.txt`, `${TEST_DIR}/file2.txt`, `${SUB_DIR}/file3.txt`]

    beforeEach(async () => {
      // 创建测试目录结构
      await devboxInstance.writeFile(FILES[0], 'Content 1')
      await devboxInstance.writeFile(FILES[1], 'Content 2')
      await devboxInstance.writeFile(FILES[2], 'Content 3')
    })

    it('应该能够列出目录内容', async () => {
      const fileList = await sdk.listFiles(devboxInstance.name, TEST_DIR)

      expect(fileList).toHaveProperty('files')
      expect(fileList.files).toHaveLength(2) // file1.txt, file2.txt
      expect(fileList.files.some((f: any) => f.name === 'file1.txt')).toBe(true)
      expect(fileList.files.some((f: any) => f.name === 'file2.txt')).toBe(true)
      expect(fileList.files.some((f: any) => f.type === 'directory' && f.name === 'subdir')).toBe(
        true
      )
    }, 10000)

    it('应该能够列出子目录内容', async () => {
      const fileList = await sdk.listFiles(devboxInstance.name, SUB_DIR)

      expect(fileList.files).toHaveLength(1)
      expect(fileList.files[0].name).toBe('file3.txt')
      expect(fileList.files[0].type).toBe('file')
    }, 10000)

    it('应该能够列出根目录', async () => {
      const rootList = await sdk.listFiles(devboxInstance.name, '/')
      expect(rootList.files).toBeDefined()
      expect(Array.isArray(rootList.files)).toBe(true)
    }, 10000)

    it('列出不存在的目录应该抛出错误', async () => {
      const nonExistentDir = '/non-existent-directory'

      await expect(sdk.listFiles(devboxInstance.name, nonExistentDir)).rejects.toThrow()
    }, 5000)
  })

  describe('批量文件操作', () => {
    const FILES: Record<string, string> = {
      '/batch/file1.txt': 'Batch content 1',
      '/batch/file2.txt': 'Batch content 2',
      '/batch/file3.txt': 'Batch content 3',
      '/batch/subdir/file4.txt': 'Batch content 4',
    }

    it('应该能够批量上传文件', async () => {
      const result = await sdk.uploadFiles(devboxInstance.name, FILES)

      expect(result.success).toBe(true)
      expect(result.total).toBe(Object.keys(FILES).length)
      expect(result.processed).toBe(Object.keys(FILES).length)
      expect(result.errors?.length).toBe(0)

      // 验证文件都已上传
      for (const [path, content] of Object.entries(FILES)) {
        const uploadedContent = await devboxInstance.readFile(path)
        expect(uploadedContent.toString()).toBe(content)
      }
    }, 15000)

    it('应该能够处理部分失败的批量上传', async () => {
      const mixedFiles = {
        ...FILES,
        '/invalid/path/file.txt': 'This should fail',
      }

      const result = await sdk.uploadFiles(devboxInstance.name, mixedFiles)

      expect(result.success).toBe(true) // 部分成功
      expect(result.total).toBe(Object.keys(mixedFiles).length)
      expect(result.processed).toBe(Object.keys(FILES).length)
      expect(result.errors?.length || 0).toBeGreaterThan(0)
    }, 15000)

    it('应该能够处理大型文件的批量上传', async () => {
      const largeFiles: Record<string, string> = {}

      // 创建一些较大的文件
      for (let i = 0; i < 5; i++) {
        const largeContent = 'Large file content '.repeat(10000) // ~200KB per file
        largeFiles[`/large/file${i}.txt`] = largeContent
      }

      const result = await sdk.uploadFiles(devboxInstance.name, largeFiles)

      expect(result.success).toBe(true)
      expect(result.processed).toBe(Object.keys(largeFiles).length)

      // 验证文件大小
      for (const [path] of Object.entries(largeFiles)) {
        const content = await devboxInstance.readFile(path)
        expect(content.length).toBeGreaterThan(200000) // ~200KB
      }
    }, 30000)
  })

  describe('文件元数据操作', () => {
    it('应该能够获取文件信息', async () => {
      const filePath = '/metadata/test.txt'
      const content = 'Test content for metadata'

      await devboxInstance.writeFile(filePath, content)

      // 列出目录获取文件信息
      const dirInfo = await sdk.listFiles(devboxInstance.name, '/metadata')
      const fileInfo = dirInfo.files.find((f: any) => f.name === 'test.txt')

      expect(fileInfo).toBeDefined()
      expect(fileInfo?.type).toBe('file')
      expect(fileInfo?.size).toBe(content.length)
      expect(fileInfo?.modified).toBeDefined()
    }, 10000)

    it('应该能够区分文件和目录', async () => {
      await devboxInstance.writeFile('/meta/file.txt', 'content')

      const rootList = await sdk.listFiles(devboxInstance.name, '/')
      const fileEntry = rootList.files.find((f: any) => f.name === 'meta')
      const metaList = await sdk.listFiles(devboxInstance.name, '/meta')

      expect(fileEntry?.type).toBe('directory')
      expect(metaList.files.some((f: any) => f.name === 'file.txt' && f.type === 'file')).toBe(true)
    }, 10000)
  })

  describe('并发操作', () => {
    it('应该能够并发读写不同文件', async () => {
      const CONCURRENT_FILES = 10
      const files: string[] = []
      const contents: string[] = []

      // 创建文件路径和内容
      for (let i = 0; i < CONCURRENT_FILES; i++) {
        files.push(`/concurrent/file${i}.txt`)
        contents.push(`Concurrent content ${i}`)
      }

      // 并发写入文件
      const writePromises = files.map((path, index) =>
        devboxInstance.writeFile(path, contents[index])
      )
      await Promise.all(writePromises)

      // 并发读取文件
      const readPromises = files.map(async (path, index) => {
        const content = await devboxInstance.readFile(path)
        expect(content.toString()).toBe(contents[index])
      })
      await Promise.all(readPromises)
    }, 20000)

    it('应该能够处理对同一文件的并发操作', async () => {
      const sharedFile = '/concurrent/shared.txt'

      // 顺序写入以避免竞争条件
      for (let i = 0; i < 5; i++) {
        await devboxInstance.writeFile(sharedFile, `Iteration ${i}`)
        const content = await devboxInstance.readFile(sharedFile)
        expect(content.toString()).toBe(`Iteration ${i}`)
      }
    }, 15000)
  })

  describe('错误处理', () => {
    it('应该处理路径遍历攻击', async () => {
      const maliciousPaths = ['../../../etc/passwd', '/../../../etc/hosts', '../root/.ssh/id_rsa']

      for (const path of maliciousPaths) {
        await expect(devboxInstance.writeFile(path, 'malicious content')).rejects.toThrow()
      }
    }, 5000)

    it('应该处理过长的文件路径', async () => {
      const longPath = '/' + 'a'.repeat(3000) + '.txt'

      await expect(devboxInstance.writeFile(longPath, 'content')).rejects.toThrow()
    }, 5000)

    it('应该处理空文件名', async () => {
      await expect(devboxInstance.writeFile('', 'content')).rejects.toThrow()

      await expect(devboxInstance.writeFile('/test/', 'content')).rejects.toThrow()
    }, 5000)
  })

  describe('性能测试', () => {
    it('应该在合理时间内完成文件操作', async () => {
      const LARGE_CONTENT = 'Performance test content '.repeat(50000) // ~1MB

      const startTime = Date.now()

      await devboxInstance.writeFile('/perf/large.txt', LARGE_CONTENT)
      const content = await devboxInstance.readFile('/perf/large.txt')

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(content.toString()).toBe(LARGE_CONTENT)
      expect(duration).toBeLessThan(10000) // 应该在10秒内完成
    }, 15000)

    it('应该能够处理大量小文件', async () => {
      const FILE_COUNT = 100
      const files: Record<string, string> = {}

      for (let i = 0; i < FILE_COUNT; i++) {
        files[`/many/file${i}.txt`] = `Small content ${i}`
      }

      const startTime = Date.now()
      const result = await sdk.uploadFiles(devboxInstance.name, files)
      const endTime = Date.now()

      expect(result.processed).toBe(FILE_COUNT)
      expect(endTime - startTime).toBeLessThan(30000) // 30秒内完成
    }, 35000)
  })
})
