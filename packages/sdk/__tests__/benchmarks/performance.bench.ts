/**
 * 性能基准测试
 * 测量关键操作的性能指标
 */

import { describe, bench, beforeAll, afterAll } from 'vitest'
import { TestHelper, skipIfNoKubeconfig } from '../setup'
import type { DevboxInstance } from '../../src/core/DevboxInstance'

describe.skipIf(skipIfNoKubeconfig())('性能基准测试', () => {
  let helper: TestHelper
  let devbox: DevboxInstance

  beforeAll(async () => {
    console.log('🏁 准备性能测试环境...')
    helper = new TestHelper()
    devbox = await helper.createTestDevbox()
    await helper.waitForDevboxReady(devbox)
    console.log('✓ 测试环境就绪')
  }, 180000)

  afterAll(async () => {
    if (helper) {
      await helper.cleanup()
    }
  })

  bench(
    '文件写入 - 小文件 (1KB)',
    async () => {
      const content = helper.generateRandomContent(1024) // 1KB
      await devbox.writeFile('/tmp/bench-small.txt', content)
    },
    { iterations: 10, time: 30000 }
  )

  bench(
    '文件写入 - 中等文件 (10KB)',
    async () => {
      const content = helper.generateRandomContent(10 * 1024) // 10KB
      await devbox.writeFile('/tmp/bench-medium.txt', content)
    },
    { iterations: 10, time: 30000 }
  )

  bench(
    '文件写入 - 大文件 (100KB)',
    async () => {
      const content = helper.generateRandomContent(100 * 1024) // 100KB
      await devbox.writeFile('/tmp/bench-large.txt', content)
    },
    { iterations: 5, time: 30000 }
  )

  bench(
    '文件写入 - 超大文件 (1MB)',
    async () => {
      const content = helper.generateRandomContent(1024 * 1024) // 1MB
      await devbox.writeFile('/tmp/bench-xlarge.txt', content)
    },
    { iterations: 3, time: 60000 }
  )

  bench(
    '文件读取 - 小文件 (1KB)',
    async () => {
      // 先写入
      const content = helper.generateRandomContent(1024)
      await devbox.writeFile('/tmp/bench-read-small.txt', content)
      // 基准测试读取
      await devbox.readFile('/tmp/bench-read-small.txt')
    },
    { iterations: 10, time: 30000 }
  )

  bench(
    '文件读取 - 大文件 (100KB)',
    async () => {
      // 先写入
      const content = helper.generateRandomContent(100 * 1024)
      await devbox.writeFile('/tmp/bench-read-large.txt', content)
      // 基准测试读取
      await devbox.readFile('/tmp/bench-read-large.txt')
    },
    { iterations: 5, time: 30000 }
  )

  bench(
    '批量文件上传 - 10个小文件',
    async () => {
      const files: Record<string, string> = {}
      for (let i = 0; i < 10; i++) {
        files[`/tmp/batch-bench-${i}.txt`] = helper.generateRandomContent(100)
      }
      await devbox.uploadFiles(files)
    },
    { iterations: 5, time: 60000 }
  )

  bench(
    '批量文件上传 - 5个中等文件',
    async () => {
      const files: Record<string, string> = {}
      for (let i = 0; i < 5; i++) {
        files[`/tmp/batch-medium-${i}.txt`] = helper.generateRandomContent(10 * 1024)
      }
      await devbox.uploadFiles(files)
    },
    { iterations: 3, time: 60000 }
  )

  bench(
    '命令执行 - 简单命令',
    async () => {
      await devbox.executeCommand('echo "test"')
    },
    { iterations: 20, time: 30000 }
  )

  bench(
    '命令执行 - 复杂命令',
    async () => {
      await devbox.executeCommand('ls -la /tmp | wc -l')
    },
    { iterations: 10, time: 30000 }
  )

  bench(
    '命令执行 - 耗时命令',
    async () => {
      await devbox.executeCommand('sleep 0.5')
    },
    { iterations: 5, time: 30000 }
  )

  bench(
    '列出文件',
    async () => {
      await devbox.listFiles('/tmp')
    },
    { iterations: 10, time: 30000 }
  )

  bench(
    '获取 Devbox 信息',
    async () => {
      await devbox.refreshInfo()
    },
    { iterations: 10, time: 30000 }
  )

  bench(
    '列出进程',
    async () => {
      await devbox.listProcesses()
    },
    { iterations: 5, time: 30000 }
  )

  bench(
    '获取资源状态',
    async () => {
      await devbox.getResourceStats()
    },
    { iterations: 5, time: 30000 }
  )

  bench(
    '并发操作 - 5个文件写入',
    async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        devbox.writeFile(`/tmp/concurrent-${i}.txt`, `content-${i}`)
      )
      await Promise.all(promises)
    },
    { iterations: 5, time: 60000 }
  )

  bench(
    '并发操作 - 5个命令执行',
    async () => {
      const promises = Array.from({ length: 5 }, () =>
        devbox.executeCommand('echo "test"')
      )
      await Promise.all(promises)
    },
    { iterations: 5, time: 60000 }
  )
})

/**
 * SDK 创建性能测试（独立的，因为需要创建多个实例）
 */
describe.skipIf(skipIfNoKubeconfig())('SDK 创建性能', () => {
  bench(
    '创建 Devbox 实例',
    async () => {
      const helper = new TestHelper()
      try {
        await helper.createTestDevbox()
      } finally {
        await helper.cleanup()
      }
    },
    { iterations: 3, time: 300000 } // 5 minutes per iteration
  )
})

/**
 * 连接池性能测试
 */
describe.skipIf(skipIfNoKubeconfig())('连接池性能', () => {
  let helper: TestHelper
  let devbox: DevboxInstance

  beforeAll(async () => {
    helper = new TestHelper()
    devbox = await helper.createTestDevbox()
    await helper.waitForDevboxReady(devbox)
  }, 180000)

  afterAll(async () => {
    if (helper) {
      await helper.cleanup()
    }
  })

  bench(
    '连接复用 - 10次请求',
    async () => {
      for (let i = 0; i < 10; i++) {
        await devbox.executeCommand('echo "test"')
      }
    },
    { iterations: 5, time: 60000 }
  )

  bench(
    '连接复用 - 并发请求',
    async () => {
      const promises = Array.from({ length: 10 }, () =>
        devbox.executeCommand('echo "test"')
      )
      await Promise.all(promises)
    },
    { iterations: 5, time: 60000 }
  )
})

