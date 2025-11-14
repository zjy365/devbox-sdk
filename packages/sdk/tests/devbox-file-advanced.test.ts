/**
 * Devbox SDK 高级文件操作和端口监控功能测试
 *
 * 测试目的：
 * 本测试文件用于验证 Devbox SDK 的高级文件操作功能，包括：
 * 1. 文件移动操作
 * 2. 文件重命名操作
 * 3. 文件下载操作（支持多种格式）
 * 4. 端口监控功能
 *
 * 测试覆盖范围：
 * - 移动文件和目录
 * - 重命名文件和目录
 * - 下载单个文件
 * - 下载多个文件（不同格式）
 * - 获取监听端口列表
 * - 错误处理和边界情况
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

describe('Devbox SDK 高级文件操作和端口监控功能测试', () => {
  let sdk: DevboxSDK
  let devboxInstance: DevboxInstance
  const TEST_DEVBOX_NAME = `test-file-advanced-${Date.now()}`

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
        args: ['-rf', './move', './move-dir', './move-overwrite', './move-no-overwrite', './rename', './rename-dir', './rename-conflict', './download', './download-multi', './download-tar', './download-targz', './download-multipart', './combo', './combo-ports'],
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

  describe('文件移动操作', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './move', './move-dir', './move-overwrite', './move-no-overwrite'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够移动文件', async () => {
      const sourcePath = './move/source.txt'
      const destinationPath = './move/destination.txt'
      const content = 'File to be moved'

      // 创建源文件
      await devboxInstance.writeFile(sourcePath, content)

      // 移动文件
      await devboxInstance.moveFile(sourcePath, destinationPath)

      // 验证文件已移动到新位置
      const movedContent = await devboxInstance.readFile(destinationPath)
      expect(movedContent.toString()).toBe(content)

      // 验证源文件已不存在
      await expect(devboxInstance.readFile(sourcePath)).rejects.toThrow()
    }, 10000)

    it('应该能够移动目录', async () => {
      const sourceDir = './move-dir/source'
      const destinationDir = './move-dir/dest'
      const filePath = `${sourceDir}/file.txt`
      const content = 'File in directory'

      // 创建源目录和文件
      await devboxInstance.writeFile(filePath, content)

      // 移动目录
      await devboxInstance.moveFile(sourceDir, destinationDir)

      // 验证文件在新目录中
      const movedFilePath = `${destinationDir}/file.txt`
      const movedContent = await devboxInstance.readFile(movedFilePath)
      expect(movedContent.toString()).toBe(content)

      // 验证源目录已不存在
      await expect(devboxInstance.listFiles(sourceDir)).rejects.toThrow()
    }, 10000)

    it('应该能够覆盖已存在的目标文件', async () => {
      const sourcePath = './move-overwrite/source.txt'
      const destinationPath = './move-overwrite/dest.txt'
      const sourceContent = 'New content'
      const destContent = 'Old content'

      // 创建源文件和目标文件
      await devboxInstance.writeFile(sourcePath, sourceContent)
      await devboxInstance.writeFile(destinationPath, destContent)

      // 移动并覆盖
      await devboxInstance.moveFile(sourcePath, destinationPath, true)

      // 验证目标文件内容已更新
      const content = await devboxInstance.readFile(destinationPath)
      expect(content.toString()).toBe(sourceContent)
    }, 10000)

    it('移动不存在的文件应该抛出错误', async () => {
      const nonExistentPath = './move/non-existent.txt'
      const destinationPath = './move/dest.txt'

      await expect(
        devboxInstance.moveFile(nonExistentPath, destinationPath)
      ).rejects.toThrow()
    }, 5000)

    it('移动文件到已存在的目标且不覆盖应该抛出错误', async () => {
      const sourcePath = './move-no-overwrite/source.txt'
      const destinationPath = './move-no-overwrite/dest.txt'

      await devboxInstance.writeFile(sourcePath, 'Source content')
      await devboxInstance.writeFile(destinationPath, 'Dest content')

      await expect(
        devboxInstance.moveFile(sourcePath, destinationPath, false)
      ).rejects.toThrow()
    }, 5000)
  })

  describe('文件重命名操作', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './rename', './rename-dir', './rename-conflict'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够重命名文件', async () => {
      const oldPath = './rename/old-name.txt'
      const newPath = './rename/new-name.txt'
      const content = 'File to be renamed'

      // 创建文件
      await devboxInstance.writeFile(oldPath, content)

      // 重命名文件
      await devboxInstance.renameFile(oldPath, newPath)

      // 验证文件已重命名
      const renamedContent = await devboxInstance.readFile(newPath)
      expect(renamedContent.toString()).toBe(content)

      // 验证旧文件名已不存在
      await expect(devboxInstance.readFile(oldPath)).rejects.toThrow()
    }, 10000)

    it('应该能够重命名目录', async () => {
      const oldDirPath = './rename-dir/old-dir'
      const newDirPath = './rename-dir/new-dir'
      const filePath = `${oldDirPath}/file.txt`
      const content = 'File in renamed directory'

      // 创建目录和文件
      await devboxInstance.writeFile(filePath, content)

      // 重命名目录
      await devboxInstance.renameFile(oldDirPath, newDirPath)

      // 验证文件在新目录中
      const newFilePath = `${newDirPath}/file.txt`
      const fileContent = await devboxInstance.readFile(newFilePath)
      expect(fileContent.toString()).toBe(content)

      // 验证旧目录已不存在
      await expect(devboxInstance.listFiles(oldDirPath)).rejects.toThrow()
    }, 10000)

    it('重命名不存在的文件应该抛出错误', async () => {
      const nonExistentPath = './rename/non-existent.txt'
      const newPath = './rename/new-name.txt'

      await expect(
        devboxInstance.renameFile(nonExistentPath, newPath)
      ).rejects.toThrow()
    }, 5000)

    it('重命名到已存在的路径应该抛出错误', async () => {
      const oldPath = './rename-conflict/old.txt'
      const existingPath = './rename-conflict/existing.txt'

      await devboxInstance.writeFile(oldPath, 'Old content')
      await devboxInstance.writeFile(existingPath, 'Existing content')

      await expect(
        devboxInstance.renameFile(oldPath, existingPath)
      ).rejects.toThrow()
    }, 5000)
  })

  describe('文件下载操作', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './download', './download-multi', './download-tar', './download-targz', './download-multipart'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够下载单个文件', async () => {
      const filePath = './download/single-file.txt'
      const content = 'File content to download'

      // 创建文件
      await devboxInstance.writeFile(filePath, content)

      // 下载文件
      const buffer = await devboxInstance.downloadFile(filePath)

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.toString()).toBe(content)
    }, 10000)

    it('应该能够下载多个文件（默认格式）', async () => {
      const files = [
        './download-multi/file1.txt',
        './download-multi/file2.txt',
        './download-multi/file3.txt',
      ]
      const contents = ['Content 1', 'Content 2', 'Content 3']

      // 创建多个文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // 下载多个文件（默认 tar.gz）
      const buffer = await devboxInstance.downloadFiles(files)

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
      // tar.gz 文件应该包含压缩数据
    }, 15000)

    it('应该能够下载多个文件（tar 格式）', async () => {
      const files = [
        './download-tar/file1.txt',
        './download-tar/file2.txt',
      ]
      const contents = ['Content 1', 'Content 2']

      // 创建文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // 下载为 tar 格式
      const buffer = await devboxInstance.downloadFiles(files, { format: 'tar' })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    }, 15000)

    it('应该能够下载多个文件（tar.gz 格式）', async () => {
      const files = [
        './download-targz/file1.txt',
        './download-targz/file2.txt',
      ]
      const contents = ['Content 1', 'Content 2']

      // 创建文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // 下载为 tar.gz 格式
      const buffer = await devboxInstance.downloadFiles(files, { format: 'tar.gz' })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    }, 15000)

    it('应该能够下载多个文件（multipart 格式）', async () => {
      const files = [
        './download-multipart/file1.txt',
        './download-multipart/file2.txt',
      ]
      const contents = ['Content 1', 'Content 2']

      // 创建文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as string
        const content = contents[i] as string
        await devboxInstance.writeFile(file, content)
      }

      // 下载为 multipart 格式
      const buffer = await devboxInstance.downloadFiles(files, { format: 'multipart' })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    }, 15000)

    it('下载不存在的文件应该抛出错误', async () => {
      const nonExistentPath = './download/non-existent.txt'

      await expect(
        devboxInstance.downloadFile(nonExistentPath)
      ).rejects.toThrow()
    }, 5000)

    it('应该能够处理空文件下载', async () => {
      const emptyFilePath = './download/empty-file.txt'

      // 创建空文件
      await devboxInstance.writeFile(emptyFilePath, '')

      // 下载空文件
      const buffer = await devboxInstance.downloadFile(emptyFilePath)

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBe(0)
    }, 10000)
  })

  describe('端口监控功能', () => {
    it('应该能够获取监听端口列表', async () => {
      const result = await devboxInstance.getPorts()

      expect(result.ports).toBeDefined()
      expect(Array.isArray(result.ports)).toBe(true)
      expect(result.lastUpdatedAt).toBeDefined()
      expect(typeof result.lastUpdatedAt).toBe('number')
    }, 10000)

    it('返回的端口应该在有效范围内', async () => {
      const result = await devboxInstance.getPorts()

      // 端口应该在 3000-9999 范围内（服务器端过滤）
      for (const port of result.ports) {
        expect(port).toBeGreaterThanOrEqual(3000)
        expect(port).toBeLessThanOrEqual(9999)
      }
    }, 10000)

    it('应该能够多次获取端口列表', async () => {
      const result1 = await devboxInstance.getPorts()
      await new Promise(resolve => setTimeout(resolve, 1000))
      const result2 = await devboxInstance.getPorts()

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result2.lastUpdatedAt).toBeGreaterThanOrEqual(result1.lastUpdatedAt)
    }, 15000)
  })

  describe('组合操作', () => {
    // 在每个测试后清理测试目录
    afterEach(async () => {
      try {
        await devboxInstance.execSync({
          command: 'rm',
          args: ['-rf', './combo', './combo-ports'],
        })
      } catch (error) {
        // 忽略清理错误
      }
    })

    it('应该能够移动、重命名和下载文件', async () => {
      const originalPath = './combo/original.txt'
      const movedPath = './combo/moved.txt'
      const renamedPath = './combo/final.txt'
      const content = 'Combined operations test'

      // 创建文件
      await devboxInstance.writeFile(originalPath, content)

      // 移动文件
      await devboxInstance.moveFile(originalPath, movedPath)

      // 重命名文件
      await devboxInstance.renameFile(movedPath, renamedPath)

      // 下载文件
      const buffer = await devboxInstance.downloadFile(renamedPath)
      expect(buffer.toString()).toBe(content)
    }, 15000)

    it('应该能够处理文件操作和端口监控的组合', async () => {
      const filePath = './combo-ports/test.txt'
      const content = 'Test content'

      // 创建文件
      await devboxInstance.writeFile(filePath, content)

      // 获取端口列表
      const portsResult = await devboxInstance.getPorts()
      expect(portsResult.success).toBe(true)

      // 下载文件
      const buffer = await devboxInstance.downloadFile(filePath)
      expect(buffer.toString()).toBe(content)

      // 再次获取端口列表
      const portsResult2 = await devboxInstance.getPorts()
      expect(portsResult2.success).toBe(true)
    }, 15000)
  })

  describe('错误处理和边界情况', () => {
    it('应该处理路径遍历攻击（移动操作）', async () => {
      const maliciousPaths = ['../../../etc/passwd', './../../../etc/hosts']

      for (const path of maliciousPaths) {
        await expect(
          devboxInstance.moveFile('./test/source.txt', path)
        ).rejects.toThrow()
      }
    }, 5000)

    it('应该处理路径遍历攻击（重命名操作）', async () => {
      const maliciousPaths = ['../../../etc/passwd', './../../../etc/hosts']

      for (const path of maliciousPaths) {
        await expect(
          devboxInstance.renameFile('./test/source.txt', path)
        ).rejects.toThrow()
      }
    }, 5000)

    it('应该处理路径遍历攻击（下载操作）', async () => {
      const maliciousPaths = ['../../../etc/passwd', './../../../etc/hosts']

      for (const path of maliciousPaths) {
        await expect(
          devboxInstance.downloadFile(path)
        ).rejects.toThrow()
      }
    }, 5000)

    it('应该处理空路径', async () => {
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

