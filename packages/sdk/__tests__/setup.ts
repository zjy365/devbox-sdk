/**
 * 测试环境配置和辅助工具
 */

import { beforeAll, afterAll } from 'vitest'
import { DevboxSDK } from '../src'
import type { DevboxInstance } from '../src/core/DevboxInstance'
import type { DevboxSDKConfig, DevboxCreateConfig } from '../src/core/types'

// 检查必需的环境变量
if (!process.env.DEVBOX_API_URL) {
  throw new Error('❌ 缺少环境变量: DEVBOX_API_URL - 请在 .env 文件中配置')
}

if (!process.env.KUBECONFIG) {
  throw new Error('❌ 缺少环境变量: KUBECONFIG - 请在 .env 文件中配置')
}

// 全局测试配置（直接使用真实环境）
export const TEST_CONFIG: DevboxSDKConfig = {
  baseUrl: process.env.DEVBOX_API_URL,
  kubeconfig: process.env.KUBECONFIG,  
  http: {
    timeout: 300000, // 5 分钟
    retries: 3,
  },
}

console.log('✅ 测试配置加载成功:')
console.log(`   - API URL: ${TEST_CONFIG.baseUrl}`)
console.log(`   - Kubeconfig: ${TEST_CONFIG.kubeconfig.substring(0, 50)}...`)

// 测试辅助类
export class TestHelper {
  private sdk: DevboxSDK
  private createdDevboxes: string[] = []

  constructor(config?: Partial<DevboxSDKConfig>) {
    this.sdk = new DevboxSDK({ ...TEST_CONFIG, ...config })
  }

  /**
   * 创建测试 Devbox
   */
  async createTestDevbox(overrides?: Partial<DevboxCreateConfig>): Promise<DevboxInstance> {
    const name = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const devbox = await this.sdk.createDevbox({
      name,
      runtime: 'node',
      resource: {
        cpu: 1000, // 1 core in millicores
        memory: 2048, // 2GB in MB
      },
      ...overrides,
    })

    this.createdDevboxes.push(name)

    return devbox
  }

  /**
   * 等待 Devbox 就绪
   */
  async waitForDevboxReady(devbox: DevboxInstance, timeout = 120000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      try {
        await devbox.refreshInfo()
        if (devbox.status === 'Running') {
          // 额外等待一点时间确保服务完全启动
          await new Promise(resolve => setTimeout(resolve, 3000))
          return
        }
      } catch (error) {
        // 忽略中间的错误
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    throw new Error(`Devbox ${devbox.name} did not become ready within ${timeout}ms`)
  }

  /**
   * 清理所有测试 Devbox
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = this.createdDevboxes.map(async (name) => {
      try {
        const devbox = await this.sdk.getDevbox(name)
        await devbox.delete()
        console.log(`✓ Cleaned up Devbox: ${name}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.warn(`⚠ Failed to cleanup ${name}:`, errorMessage)
      }
    })

    await Promise.allSettled(cleanupPromises)
    this.createdDevboxes = []
    await this.sdk.close()
  }

  /**
   * 获取 SDK 实例
   */
  getSDK(): DevboxSDK {
    return this.sdk
  }

  /**
   * 生成随机文件内容
   */
  generateRandomContent(size: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < size; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * 生成随机二进制数据
   */
  generateRandomBuffer(size: number): Buffer {
    const buffer = Buffer.alloc(size)
    for (let i = 0; i < size; i++) {
      buffer[i] = Math.floor(Math.random() * 256)
    }
    return buffer
  }
}

// 全局清理钩子
let globalHelper: TestHelper | null = null

beforeAll(() => {
  console.log('🧪 初始化测试环境...')
  globalHelper = new TestHelper()
})

afterAll(async () => {
  console.log('🧹 清理测试环境...')
  if (globalHelper) {
    await globalHelper.cleanup()
  }
})

export { globalHelper }

/**
 * 工具函数：等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 工具函数：重试操作
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt) // 指数退避
      }
    }
  }

  throw lastError || new Error('Operation failed')
}

