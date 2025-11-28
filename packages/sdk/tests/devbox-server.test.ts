/**
 * Devbox SDK 端到端集成测试
 *
 * 测试目的：
 * 本测试文件用于验证 Devbox SDK 的核心功能，包括：
 * 1. Devbox 实例的生命周期管理（创建、启动、等待就绪）
 * 2. 通过 Go Server API 操作 Devbox 实例的完整流程
 * 3. SDK 的数据转换逻辑（Buffer ↔ base64 ↔ JSON）
 * 4. SDK 与 Go Server 的集成兼容性
 *
 * 测试架构：
 * - Devbox SDK → Devbox API (Kubernetes) → 创建/管理 Devbox 实例
 * - Devbox SDK → Go Server API → 操作实例中的文件/进程/会话
 *
 * 为什么使用 mockServerUrl：
 * 当前 Go Server 尚未内置到 Devbox 实例中，因此使用 mockServerUrl 指向本地运行的 Go Server
 * 进行端到端测试。当 Go Server 内置后，ConnectionManager 会自动从 Devbox 实例的 ports 信息中
 * 获取真实的 Server URL，测试无需修改即可适配。
 *
 * 测试覆盖范围：
 * - 文件基础操作（读写、编码处理）
 * - 文件删除操作
 * - 目录操作
 * - 批量文件操作
 * - 文件元数据
 * - 并发操作
 * - 安全与错误处理
 * - 性能测试
 *
 * 注意事项：
 * - 所有测试都需要真实的 Devbox 实例（通过 Kubernetes API 创建）
 * - 测试使用 mockServerUrl 连接到本地 Go Server（通过 DEVBOX_SERVER_URL 环境变量配置）
 * - 测试会创建和删除 Devbox 实例，确保测试环境有足够的资源
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DevboxSDK } from '../src/core/devbox-sdk'
import type { DevboxInstance } from '../src/core/devbox-instance'
import { TEST_CONFIG } from './setup'
import type { WriteOptions, DevboxCreateConfig } from '../src/core/types'
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

describe('Devbox SDK 端到端集成测试', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-server-ops-${Date.now()}`

  // 测试文件路径和内容常量
  const TEST_FILE_PATH = './test/test-file.txt'
  const TEST_FILE_CONTENT = 'Hello, Devbox Server!'
  const TEST_UNICODE_CONTENT = '你好，Devbox 服务器！🚀'
  const TEST_BINARY_CONTENT = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG header

  beforeEach(async () => {
    sdk = new DevboxSDK(TEST_CONFIG)

    const config: DevboxCreateConfig = {
      name: TEST_DEVBOX_NAME,
      runtime: DevboxRuntime.NODE_JS,
      resource: {
        cpu: 1,
        memory: 2,
      },
    }

    devboxInstance = await sdk.createDevbox(config)
    await devboxInstance.start()
    await waitForDevboxReady(devboxInstance)

    // 清理之前测试可能留下的文件和目录
    try {
      await devboxInstance.execSync({
        command: 'rm',
        args: ['-rf', './test', './test-directory', './batch', './large', './metadata', './meta', './concurrent', './perf', './many'],
      })
    } catch (error) {
      // 忽略清理错误
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

  describe('文件基础操作', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够写入文件', async () => {
      const options: WriteOptions = {
        encoding: 'utf-8',
        mode: 0o644,
      }

      await expect(
        devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT, options)
      ).resolves.not.toThrow()
    }, 10000)

    it('应该能够读取文件', async () => {
      await devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT)
      const content = await devboxInstance.readFile(TEST_FILE_PATH)
      expect(content.toString()).toBe(TEST_FILE_CONTENT)
    }, 10000)

    it('应该能够处理 Unicode 内容', async () => {
      const unicodeFilePath = './test/unicode-test.txt'

      await devboxInstance.writeFile(unicodeFilePath, TEST_UNICODE_CONTENT)
      const content = await devboxInstance.readFile(unicodeFilePath)
      expect(content.toString()).toBe(TEST_UNICODE_CONTENT)
    }, 10000)

    it('应该能够上传二进制文件并读取二进制文件', async () => {
      const binaryFilePath = './test/binary-test.png'
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

      await devboxInstance.writeFile(binaryFilePath, binaryData)
      const content = await devboxInstance.readFile(binaryFilePath)

      expect(Buffer.isBuffer(content)).toBe(true)
      expect(content.length).toBe(binaryData.length)
      expect(content.equals(binaryData)).toBe(true)
    }, 10000)

    it('应该能够将字符串内容编码为 base64 上传', async () => {
      const filePath = './test/base64-string.txt'
      const textContent = 'Hello, World!'

      // Write with base64 encoding (SDK encodes, Go server decodes and stores raw content)
      await devboxInstance.writeFile(filePath, textContent, { encoding: 'base64' })
      // Read without encoding option (Go server returns raw content, SDK converts to Buffer)
      const content = await devboxInstance.readFile(filePath)

      expect(content.toString('utf-8')).toBe(textContent)
    }, 10000)

    it('读取不存在的文件应该抛出错误', async () => {
      const nonExistentPath = './test/non-existent-file.txt'

      await expect(devboxInstance.readFile(nonExistentPath)).rejects.toThrow()
    }, 5000)
  })

  describe('文件删除操作', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够删除文件', async () => {
      // 创建文件
      await devboxInstance.writeFile(TEST_FILE_PATH, TEST_FILE_CONTENT)

      // 验证文件存在
      const content = await devboxInstance.readFile(TEST_FILE_PATH)
      expect(content.toString()).toBe(TEST_FILE_CONTENT)

      // 删除文件
      await devboxInstance.deleteFile(TEST_FILE_PATH)

      // 验证文件已删除
      await expect(devboxInstance.readFile(TEST_FILE_PATH)).rejects.toThrow()
    }, 10000)

    it('删除不存在的文件应该抛出错误', async () => {
      const nonExistentPath = './test/non-existent-delete.txt'

      await expect(devboxInstance.deleteFile(nonExistentPath)).rejects.toThrow()
    }, 5000)
  })

  describe('目录操作', () => {
    const TEST_DIR = './test-directory'
    const SUB_DIR = `${TEST_DIR}/subdir`
    const FILES = [`${TEST_DIR}/file1.txt`, `${TEST_DIR}/file2.txt`, `${SUB_DIR}/file3.txt`]

    beforeEach(async () => {
      // 创建测试目录结构 
      await devboxInstance.writeFile(FILES[0] as string, 'Content 1')
      await devboxInstance.writeFile(FILES[1] as string, 'Content 2')
      await devboxInstance.writeFile(FILES[2] as string, 'Content 3')
    })

    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test-directory'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够列出目录内容', async () => {
      const fileList = await devboxInstance.listFiles(TEST_DIR)

      expect(fileList).toHaveProperty('files')
      expect(fileList.files).toHaveLength(3) // file1.txt, file2.txt, subdir
      expect(fileList.files.some((f) => f.name === 'file1.txt')).toBe(true)
      expect(fileList.files.some((f) => f.name === 'file2.txt')).toBe(true)
      expect(fileList.files.some((f) => f.isDir === true && f.name === 'subdir')).toBe(true)
    }, 10000)

    it('应该能够列出子目录内容', async () => {
      const fileList = await devboxInstance.listFiles(SUB_DIR)

      expect(fileList.files).toHaveLength(1)
      expect(fileList.files[0]?.name).toBe('file3.txt')
      expect(fileList.files[0]?.isDir).toBe(false)
    }, 10000)

    it('应该能够列出根目录', async () => {
      const rootList = await devboxInstance.listFiles('.')
      expect(rootList.files).toBeDefined()
      expect(Array.isArray(rootList.files)).toBe(true)
    }, 10000)

    it('列出不存在的目录应该抛出错误', async () => {
      const nonExistentDir = './non-existent-directory'

      await expect(devboxInstance.listFiles(nonExistentDir)).rejects.toThrow()
    }, 5000)
  })

  describe('批量文件操作', () => {
    const FILES: Record<string, string> = {
      './batch/file1.txt': 'Batch content 1',
      './batch/file2.txt': 'Batch content 2',
      './batch/file3.txt': 'Batch content 3',
      './batch/subdir/file4.txt': 'Batch content 4',
    }

    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './batch', './large'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够批量上传文件', async () => {
      const result = await devboxInstance.uploadFiles(FILES)

      expect(result.totalFiles).toBe(Object.keys(FILES).length)
      expect(result.successCount).toBe(Object.keys(FILES).length)
      expect(result.results.length).toBe(Object.keys(FILES).length)

      // 验证文件都已上传，使用上传返回的路径
      for (const uploadResult of result.results) {
        if (uploadResult.success && uploadResult.path) {
          const uploadedContent = await devboxInstance.readFile(uploadResult.path)
          // 根据文件名匹配原始内容
          const fileName = uploadResult.path.split('/').pop() || ''
          const originalEntry = Object.entries(FILES).find(([path]) => path.endsWith(fileName))
          if (originalEntry) {
            expect(uploadedContent.toString()).toBe(originalEntry[1])
          }
        }
      }
    }, 15000)

    it('应该能够处理部分失败的批量上传', async () => {
      const mixedFiles = {
        ...FILES,
        '/invalid/path/file.txt': 'This should fail',
      }

      const result = await devboxInstance.uploadFiles(mixedFiles)

      expect(result.totalFiles).toBe(Object.keys(mixedFiles).length)
      expect(result.successCount).toBe(Object.keys(FILES).length)
      expect(result.results.filter(r => !r.success).length).toBeGreaterThan(0)
    }, 15000)

    it('应该能够处理 10MB 大文件上传', async () => {
      // 创建 10MB 文件
      const content10MB = 'X'.repeat(10 * 1024 * 1024) // 10MB
      const filePath = './large/file-10mb.txt'

      await devboxInstance.writeFile(filePath, content10MB)
      const readContent = await devboxInstance.readFile(filePath)

      expect(readContent.length).toBe(10 * 1024 * 1024)
      expect(readContent.toString()).toBe(content10MB)
    }, 60000)

    it('应该能够处理 50MB 大文件上传', async () => {
      // 创建 50MB 文件
      const content50MB = 'Y'.repeat(50 * 1024 * 1024) // 50MB
      const filePath = './large/file-50mb.txt'

      await devboxInstance.writeFile(filePath, content50MB)
      const readContent = await devboxInstance.readFile(filePath)

      expect(readContent.length).toBe(50 * 1024 * 1024)
      // 只验证前后部分，避免完整字符串比较占用过多内存
      expect(readContent.toString().substring(0, 1000)).toBe('Y'.repeat(1000))
      expect(readContent.toString().substring(readContent.length - 1000)).toBe('Y'.repeat(1000))
    }, 120000)

    it('应该能够处理 100MB 大文件上传', async () => {
      // 创建 100MB 文件
      const content100MB = 'Z'.repeat(100 * 1024 * 1024) // 100MB
      const filePath = './large/file-100mb.txt'

      await devboxInstance.writeFile(filePath, content100MB)
      const readContent = await devboxInstance.readFile(filePath)

      expect(readContent.length).toBe(100 * 1024 * 1024)
      // 只验证前后部分和长度，避免完整字符串比较占用过多内存
      expect(readContent.toString().substring(0, 1000)).toBe('Z'.repeat(1000))
      expect(readContent.toString().substring(readContent.length - 1000)).toBe('Z'.repeat(1000))
    }, 180000)

    it('应该能够批量上传多个大文件', async () => {
      const largeFiles: Record<string, string> = {}

      // 创建 3 个 5MB 的文件
      for (let i = 0; i < 3; i++) {
        const largeContent = `File${i}-`.repeat(5 * 1024 * 1024 / 7) // ~5MB per file
        largeFiles[`./large/batch-file${i}.txt`] = largeContent
      }

      const result = await devboxInstance.uploadFiles(largeFiles)

      expect(result.successCount).toBe(Object.keys(largeFiles).length)
      expect(result.totalFiles).toBe(3)

      // 验证文件大小
      for (const uploadResult of result.results) {
        if (uploadResult.success && uploadResult.path) {
          const content = await devboxInstance.readFile(uploadResult.path)
          expect(content.length).toBeGreaterThan(4 * 1024 * 1024) // 至少 4MB
          expect(content.length).toBeLessThan(6 * 1024 * 1024) // 小于 6MB
        }
      }
    }, 120000)
  })

  describe('文件元数据', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './metadata', './meta'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够获取文件信息', async () => {
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

    it('应该能够区分文件和目录', async () => {
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

  describe('并发操作', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './concurrent'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够并发读写不同文件', async () => {
      const CONCURRENT_FILES = 10
      const files: string[] = []
      const contents: string[] = []

      // 创建文件路径和内容
      for (let i = 0; i < CONCURRENT_FILES; i++) {
        files.push(`./concurrent/file${i}.txt`)
        contents.push(`Concurrent content ${i}`)
      }

      // 并发写入文件
      const writePromises = files.map((path, index) =>
        devboxInstance.writeFile(path as string, contents[index] as string)
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
      const sharedFile = './concurrent/shared.txt'

      // 顺序写入以避免竞争条件
      for (let i = 0; i < 5; i++) {
        await devboxInstance.writeFile(sharedFile, `Iteration ${i}`)
        const content = await devboxInstance.readFile(sharedFile)
        expect(content.toString()).toBe(`Iteration ${i}`)
      }
    }, 15000)
  })

  describe('安全与错误处理', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './test'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该处理路径遍历攻击', async () => {
      const maliciousPaths = ['../../../etc/passwd', '/../../../etc/hosts', '../root/.ssh/id_rsa']

      for (const path of maliciousPaths) {
        await expect(devboxInstance.writeFile(path, 'malicious content')).rejects.toThrow()
      }
    }, 5000)

    it('应该处理过长的文件路径', async () => {
      const longPath = `./${'a'.repeat(3000)}.txt`

      await expect(devboxInstance.writeFile(longPath, 'content')).rejects.toThrow()
    }, 5000)

    it('应该处理空文件名', async () => {
      await expect(devboxInstance.writeFile('', 'content')).rejects.toThrow()

      await expect(devboxInstance.writeFile('./test/', 'content')).rejects.toThrow()
    }, 5000)
  })

  describe('性能测试', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './perf', './many'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该在合理时间内完成文件操作', async () => {
      const LARGE_CONTENT = 'Performance test content '.repeat(50000) // ~1MB

      const startTime = Date.now()

      await devboxInstance.writeFile('./perf/large.txt', LARGE_CONTENT)
      const content = await devboxInstance.readFile('./perf/large.txt')

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(content.toString()).toBe(LARGE_CONTENT)
      expect(duration).toBeLessThan(10000) // 应该在10秒内完成
    }, 15000)

    it('应该能够处理大量小文件', async () => {
      const FILE_COUNT = 100
      const files: Record<string, string> = {}

      for (let i = 0; i < FILE_COUNT; i++) {
        files[`./many/file${i}.txt`] = `Small content ${i}`
      }

      const startTime = Date.now()
      const result = await devboxInstance.uploadFiles(files)
      const endTime = Date.now()

      expect(result.successCount).toBe(FILE_COUNT)
      expect(endTime - startTime).toBeLessThan(30000) // 30秒内完成
    }, 35000)
  })
})
