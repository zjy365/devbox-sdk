/**
 * 并发操作集成测试
 */

import { describe, it, expect } from 'vitest'
import { TestHelper, skipIfNoKubeconfig } from '../setup'

describe('并发操作测试', () => {
  it.skipIf(skipIfNoKubeconfig())(
    '应该支持并发创建多个 Devbox',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 并发创建 3 个 Devbox...')

        const createPromises = Array.from({ length: 3 }, (_, i) =>
          helper.createTestDevbox({
            name: `concurrent-test-${Date.now()}-${i}`,
          })
        )

        const devboxes = await Promise.all(createPromises)

        expect(devboxes).toHaveLength(3)
        expect(devboxes.every(d => d.name)).toBeTruthy()

        console.log('✅ 成功创建:')
        devboxes.forEach((d, i) => {
          console.log(`  ${i + 1}. ${d.name}`)
        })
      } finally {
        await helper.cleanup()
      }
    },
    300000
  )

  it.skipIf(skipIfNoKubeconfig())(
    '应该支持并发文件操作',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        console.log('📝 并发写入 10 个文件...')
        const writePromises = Array.from({ length: 10 }, (_, i) =>
          devbox.writeFile(`/tmp/concurrent-file-${i}.txt`, `content-${i}`)
        )

        await Promise.all(writePromises)

        console.log('🔍 验证所有文件...')
        const readPromises = Array.from({ length: 10 }, (_, i) =>
          devbox.readFile(`/tmp/concurrent-file-${i}.txt`)
        )

        const contents = await Promise.all(readPromises)

        expect(contents).toHaveLength(10)
        contents.forEach((content, i) => {
          expect(content.toString()).toBe(`content-${i}`)
        })

        console.log('✅ 所有文件写入和读取成功')
      } finally {
        await helper.cleanup()
      }
    },
    180000
  )

  it.skipIf(skipIfNoKubeconfig())(
    '应该支持并发命令执行',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        console.log('⚡ 并发执行 5 个命令...')
        const commands = [
          'echo "command 1"',
          'echo "command 2"',
          'date',
          'whoami',
          'pwd',
        ]

        const results = await Promise.all(
          commands.map(cmd => devbox.executeCommand(cmd))
        )

        expect(results).toHaveLength(5)
        results.forEach((result, i) => {
          expect(result.exitCode).toBe(0)
          console.log(`  ✓ 命令 ${i + 1}: ${commands[i]}`)
        })

        console.log('✅ 所有命令执行成功')
      } finally {
        await helper.cleanup()
      }
    },
    180000
  )

  it.skipIf(skipIfNoKubeconfig())(
    '应该支持混合并发操作',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        console.log('🔀 执行混合并发操作...')
        
        const operations = [
          // 文件写入
          devbox.writeFile('/tmp/mix-1.txt', 'file 1'),
          devbox.writeFile('/tmp/mix-2.txt', 'file 2'),
          // 命令执行
          devbox.executeCommand('echo "test"'),
          devbox.executeCommand('date'),
          // 文件读写
          devbox.writeFile('/tmp/mix-3.txt', 'file 3').then(() => 
            devbox.readFile('/tmp/mix-3.txt')
          ),
        ]

        const results = await Promise.all(operations)

        console.log('✅ 所有混合操作完成')
        expect(results).toHaveLength(5)
      } finally {
        await helper.cleanup()
      }
    },
    180000
  )

  it.skipIf(skipIfNoKubeconfig())(
    '应该处理并发操作中的错误',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        console.log('⚡ 执行包含错误的并发操作...')
        
        const operations = [
          // 成功的操作
          devbox.writeFile('/tmp/success-1.txt', 'ok'),
          // 失败的操作
          devbox.readFile('/nonexistent/file.txt').catch(e => ({ error: true, message: e.message })),
          // 成功的操作
          devbox.executeCommand('echo "success"'),
          // 失败的操作
          devbox.executeCommand('nonexistent-command-xyz').catch(e => ({ error: true, message: e.message })),
        ]

        const results = await Promise.allSettled(operations)

        expect(results).toHaveLength(4)
        
        // 验证有成功和失败的操作
        const fulfilled = results.filter(r => r.status === 'fulfilled')
        const rejected = results.filter(r => r.status === 'rejected')

        console.log(`  ✓ 成功: ${fulfilled.length}`)
        console.log(`  ✗ 失败: ${rejected.length}`)

        expect(fulfilled.length).toBeGreaterThan(0)
        
        console.log('✅ 并发错误处理正确')
      } finally {
        await helper.cleanup()
      }
    },
    180000
  )

  it.skipIf(skipIfNoKubeconfig())(
    '应该支持大量并发文件上传',
    async () => {
      const helper = new TestHelper()

      try {
        console.log('📦 创建 Devbox...')
        const devbox = await helper.createTestDevbox()
        await helper.waitForDevboxReady(devbox)

        console.log('📝 生成 20 个文件...')
        const files: Record<string, string> = {}
        for (let i = 0; i < 20; i++) {
          files[`/tmp/bulk-${i}.txt`] = helper.generateRandomContent(100)
        }

        console.log('⚡ 批量上传...')
        const startTime = Date.now()
        const result = await devbox.uploadFiles(files)
        const duration = Date.now() - startTime

        expect(result.success).toBe(true)
        expect(result.transferred).toBe(20)

        console.log(`✅ 上传 20 个文件耗时: ${duration}ms`)
        console.log(`   平均速度: ${(duration / 20).toFixed(2)}ms/文件`)
      } finally {
        await helper.cleanup()
      }
    },
    180000
  )
})

