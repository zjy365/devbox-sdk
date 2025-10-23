/**
 * Devbox SDK 使用示例集合
 *
 * 这个文件展示了如何使用 Devbox SDK 进行各种操作
 */

import { DevboxSDK } from '../src/index'

// 示例配置 - 在实际使用中，您需要提供真实的 kubeconfig
const SDK_CONFIG = {
  kubeconfig: process.env.KUBECONFIG || 'your-kubeconfig-content-here',
  baseUrl: process.env.DEVBOX_API_URL || 'https://api.sealos.io',
  connectionPool: {
    maxSize: 10,
    connectionTimeout: 30000,
    keepAliveInterval: 60000,
    healthCheckInterval: 60000
  },
  http: {
    timeout: 30000,
    retries: 3
  }
}

// 创建 SDK 实例
const sdk = new DevboxSDK(SDK_CONFIG)

/**
 * 示例 1: 创建和管理 Devbox 实例
 */
export async function createAndManageDevbox() {
  console.log('🚀 示例 1: 创建和管理 Devbox 实例')

  try {
    // 创建一个新的 Devbox 实例
    const devbox = await sdk.createDevbox({
      name: 'my-nodejs-app',
      runtime: 'node.js',
      resource: { cpu: 1, memory: 2 },
      ports: [{ number: 3000, protocol: 'HTTP' }],
      env: {
        NODE_ENV: 'production',
        DEBUG: 'true'
      }
    })

    console.log(`✅ 成功创建 Devbox: ${devbox.name}`)
    console.log(`📊 状态: ${devbox.status}`)
    console.log(`🔧 运行时: ${devbox.runtime}`)

    // 等待 Devbox 准备就绪
    console.log('⏳ 等待 Devbox 准备就绪...')
    await devbox.waitForReady(120000) // 等待最多 2 分钟
    console.log('✅ Devbox 已准备就绪')

    // 启动 Devbox
    console.log('🚀 启动 Devbox...')
    await devbox.start()
    console.log('✅ Devbox 已启动')

    // 获取详细信息
    const detailedInfo = await devbox.getDetailedInfo()
    console.log('📋 Devbox 详细信息:', detailedInfo)

    return devbox
  } catch (error) {
    console.error('❌ 创建 Devbox 失败:', error)
    throw error
  }
}

/**
 * 示例 2: 文件操作
 */
export async function fileOperations(devbox: any) {
  console.log('\n📁 示例 2: 文件操作')

  try {
    // 写入 package.json
    const packageJson = {
      name: 'my-nodejs-app',
      version: '1.0.0',
      description: '使用 Devbox SDK 创建的 Node.js 应用',
      main: 'index.js',
      scripts: {
        start: 'node index.js',
        dev: 'node index.js',
        test: 'echo "Error: no test specified" && exit 1'
      },
      dependencies: {
        express: '^4.18.2',
        cors: '^2.8.5'
      },
      engines: {
        node: '>=14.0.0'
      }
    }

    await devbox.writeFile('package.json', JSON.stringify(packageJson, null, 2))
    console.log('✅ 已创建 package.json')

    // 写入主应用文件
    const appCode = `
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API 路由
app.get('/api/info', (req, res) => {
  res.json({
    application: 'Devbox SDK Example',
    version: '1.0.0',
    runtime: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(\`🚀 服务器运行在端口 \${PORT}\`);
  console.log(\`📊 健康检查: http://localhost:\${PORT}/health\`);
  console.log(\`🔗 API 信息: http://localhost:\${PORT}/api/info\`);
});
`.trim()

    await devbox.writeFile('index.js', appCode)
    console.log('✅ 已创建 index.js')

    // 读取文件验证
    const readPackageJson = await devbox.readFile('package.json')
    console.log('📖 读取的 package.json:', readPackageJson.toString('utf8'))

    // 批量上传文件
    const files = {
      'README.md': '# Devbox SDK Example\n\n这是一个使用 Devbox SDK 创建的示例应用。',
      '.env': 'NODE_ENV=development\nPORT=3000\n',
      'config.json': JSON.stringify(
        {
          app: {
            name: 'Devbox SDK Example',
            version: '1.0.0'
          },
          server: {
            port: 3000,
            timeout: 30000
          }
        },
        null,
        2
      )
    }

    const uploadResult = await devbox.uploadFiles(files)
    console.log('📤 批量上传结果:', uploadResult)
  } catch (error) {
    console.error('❌ 文件操作失败:', error)
    throw error
  }
}

/**
 * 示例 3: 命令执行
 */
export async function executeCommands(devbox: any) {
  console.log('\n⚡ 示例 3: 命令执行')

  try {
    // 安装依赖
    console.log('📦 安装 npm 依赖...')
    const installResult = await devbox.executeCommand('npm install')
    console.log('安装结果:', installResult.stdout)

    if (installResult.stderr) {
      console.log('安装警告:', installResult.stderr)
    }

    // 启动应用
    console.log('🚀 启动应用...')
    const startResult = await devbox.executeCommand('npm start')
    console.log('启动结果:', startResult.stdout)

    // 创建一个测试文件并执行
    await devbox.writeFile(
      'test.js',
      `
console.log('🧪 运行测试文件');
console.log('✅ 测试成功完成');
`
    )

    const testResult = await devbox.executeCommand('node test.js')
    console.log('测试结果:', testResult.stdout)

    // 检查 Node.js 版本
    const nodeVersion = await devbox.executeCommand('node --version')
    console.log('Node.js 版本:', nodeVersion.stdout)

    // 检查当前目录内容
    const listFiles = await devbox.executeCommand('ls -la')
    console.log('文件列表:', listFiles.stdout)
  } catch (error) {
    console.error('❌ 命令执行失败:', error)
    throw error
  }
}

/**
 * 示例 4: 监控和健康检查
 */
export async function monitoringAndHealthCheck(devbox: any) {
  console.log('\n📊 示例 4: 监控和健康检查')

  try {
    // 检查 Devbox 健康状态
    const isHealthy = await devbox.isHealthy()
    console.log('💚 健康状态:', isHealthy ? '健康' : '不健康')

    if (isHealthy) {
      // 获取监控数据
      const monitorData = await devbox.getMonitorData({
        start: Date.now() - 3600000, // 1小时前
        end: Date.now(),
        step: '5m' // 5分钟间隔
      })

      console.log('📈 监控数据:')
      monitorData.forEach((data, index) => {
        console.log(`  数据点 ${index + 1}:`)
        console.log(`    CPU 使用率: ${data.cpu}%`)
        console.log(`    内存使用率: ${data.memory}%`)
        console.log(`    网络输入: ${data.network.bytesIn} bytes`)
        console.log(`    网络输出: ${data.network.bytesOut} bytes`)
        console.log(`    时间戳: ${new Date(data.timestamp).toISOString()}`)
      })
    }

    // 获取连接统计信息
    const connectionStats = sdk.getConnectionManager().getConnectionStats()
    console.log('🔗 连接统计:', connectionStats)
  } catch (error) {
    console.error('❌ 监控检查失败:', error)
    throw error
  }
}

/**
 * 示例 5: 列出和管理多个 Devbox 实例
 */
export async function listAndManageMultipleDevboxes() {
  console.log('\n📋 示例 5: 列出和管理多个 Devbox 实例')

  try {
    // 列出所有 Devbox 实例
    const devboxes = await sdk.listDevboxes()
    console.log(`📦 找到 ${devboxes.length} 个 Devbox 实例:`)

    devboxes.forEach((devbox, index) => {
      console.log(`  ${index + 1}. ${devbox.name} (${devbox.status})`)
      console.log(`     运行时: ${devbox.runtime}`)
      console.log(`     资源: CPU=${devbox.resources?.cpu}核, 内存=${devbox.resources?.memory}GB`)
    })

    // 对每个实例执行健康检查
    console.log('\n🔍 执行健康检查...')
    for (const devbox of devboxes) {
      try {
        const isHealthy = await devbox.isHealthy()
        console.log(`${devbox.name}: ${isHealthy ? '✅ 健康' : '❌ 不健康'}`)
      } catch (error) {
        console.log(`${devbox.name}: ❌ 检查失败 - ${error}`)
      }
    }
  } catch (error) {
    console.error('❌ 列出 Devbox 失败:', error)
    throw error
  }
}

/**
 * 示例 6: 错误处理
 */
export async function errorHandlingExample() {
  console.log('\n⚠️  示例 6: 错误处理')

  try {
    // 尝试创建一个不存在的 Devbox
    const devbox = await sdk.getDevbox('non-existent-devbox')
    console.log('这个消息不应该出现')
  } catch (error) {
    console.log('✅ 成功捕获错误:', error.message)
    console.log('错误类型:', error.constructor.name)
    console.log('错误代码:', (error as any).code)
  }

  try {
    // 尝试写入到无效路径
    const sdk = new DevboxSDK(SDK_CONFIG)
    const devbox = await sdk.createDevbox({
      name: 'test-devbox',
      runtime: 'node.js',
      resource: { cpu: 0.5, memory: 1 }
    })

    // 这个会失败，因为需要先启动容器
    await devbox.writeFile('../../../etc/passwd', 'test')
    console.log('这个消息不应该出现')
  } catch (error) {
    console.log('✅ 成功捕获文件写入错误:', error.message)
  }
}

/**
 * 主函数 - 运行所有示例
 */
export async function runAllExamples() {
  console.log('🎯 Devbox SDK 使用示例\n')
  console.log('配置:', {
    baseUrl: SDK_CONFIG.baseUrl,
    connectionPool: SDK_CONFIG.connectionPool,
    http: SDK_CONFIG.http
  })
  console.log('')

  let createdDevbox: any = null

  try {
    // 运行错误处理示例
    await errorHandlingExample()

    // 运行多实例管理示例
    await listAndManageMultipleDevboxes()

    // 创建并管理新 Devbox
    createdDevbox = await createAndManageDevbox()

    // 文件操作
    await fileOperations(createdDevbox)

    // 命令执行
    await executeCommands(createdDevbox)

    // 监控和健康检查
    await monitoringAndHealthCheck(createdDevbox)

    console.log('\n🎉 所有示例执行完成!')

    // 清理：删除创建的 Devbox
    if (createdDevbox) {
      console.log('\n🧹 清理资源...')
      await createdDevbox.delete()
      console.log('✅ 已删除测试 Devbox')
    }
  } catch (error) {
    console.error('\n❌ 示例执行失败:', error)

    // 如果有创建的 Devbox，尝试清理
    if (createdDevbox) {
      try {
        await createdDevbox.delete()
        console.log('✅ 已清理测试 Devbox')
      } catch (cleanupError) {
        console.error('⚠️ 清理失败:', cleanupError)
      }
    }

    throw error
  } finally {
    // 关闭 SDK 连接
    await sdk.close()
    console.log('🔌 SDK 连接已关闭')
  }
}

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
  runAllExamples().catch((error) => {
    console.error('\n💥 示例执行失败:', error)
    process.exit(1)
  })
}
