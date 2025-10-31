# Task: SDK Phase 3 - Examples & Documentation

**Priority**: 🟡 Medium  
**Estimated Time**: 2 days  
**Status**: ⏳ Pending  
**Dependencies**: Phase 1 (0010) and Phase 2 (0011) completed

---

## Overview

创建完整的示例代码和文档，帮助开发者快速上手 Devbox SDK。包括基础用法、高级特性、最佳实践和 Vercel Sandbox 迁移指南。

**目标**:
- ✅ 基础示例（快速开始）
- ✅ 高级示例（完整工作流）
- ✅ Vercel Sandbox 替代示例
- ✅ API 文档和类型定义
- ✅ 最佳实践和常见问题

**成功标准**:
- 开发者能在 5 分钟内运行第一个示例
- 所有主要功能都有示例代码
- API 文档完整且易于查阅
- 提供 Vercel → Devbox 迁移指南

---

## Parent Task

本任务是 SDK 实现的第三阶段：
- [x] Phase 1: 核心实现
- [x] Phase 2: 高级功能
- [ ] **Phase 3**: 示例和文档 (本任务)
- [ ] Phase 4: 测试和优化

---

## Implementation Tasks

### ✅ **Task 1: 创建示例目录结构** (0.5 day)

#### 1.1 目录结构

```
packages/sdk/examples/
├── README.md                      # 示例索引
├── 01-basic/
│   ├── README.md                  # 基础用法说明
│   ├── create-devbox.ts           # 创建 Devbox
│   ├── file-operations.ts         # 文件操作
│   ├── execute-commands.ts        # 命令执行
│   └── lifecycle-management.ts    # 生命周期管理
├── 02-advanced/
│   ├── README.md                  # 高级特性说明
│   ├── session-workflow.ts        # Session 工作流
│   ├── batch-upload.ts            # 批量文件上传
│   ├── file-watching.ts           # 文件监控
│   └── monitoring.ts              # 监控数据
├── 03-workflows/
│   ├── README.md                  # 完整工作流说明
│   ├── vite-app.ts                # Vite 应用部署
│   ├── nodejs-api.ts              # Node.js API 开发
│   └── python-app.ts              # Python 应用开发
├── 04-vercel-migration/
│   ├── README.md                  # 迁移指南
│   ├── sandbox-provider.ts        # Vercel Sandbox 适配器
│   └── comparison.md              # 功能对比
└── package.json
```

#### 1.2 示例项目配置

**文件**: `packages/sdk/examples/package.json`

```json
{
  "name": "@devbox/sdk-examples",
  "version": "1.0.0",
  "description": "Devbox SDK Examples",
  "private": true,
  "scripts": {
    "basic:create": "tsx 01-basic/create-devbox.ts",
    "basic:files": "tsx 01-basic/file-operations.ts",
    "basic:commands": "tsx 01-basic/execute-commands.ts",
    "advanced:session": "tsx 02-advanced/session-workflow.ts",
    "advanced:upload": "tsx 02-advanced/batch-upload.ts",
    "workflow:vite": "tsx 03-workflows/vite-app.ts",
    "workflow:nodejs": "tsx 03-workflows/nodejs-api.ts"
  },
  "dependencies": {
    "@devbox/sdk": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

---

### ✅ **Task 2: 基础示例** (0.5 day)

#### 2.1 创建 Devbox

**文件**: `packages/sdk/examples/01-basic/create-devbox.ts`

```typescript
/**
 * 示例 1: 创建和管理 Devbox
 * 
 * 本示例演示如何：
 * - 初始化 SDK
 * - 创建 Devbox
 * - 等待就绪
 * - 获取信息
 * - 清理资源
 */

import { DevboxSDK } from '@devbox/sdk'

async function main() {
  // 1. 初始化 SDK
  const sdk = new DevboxSDK({
    kubeconfig: process.env.KUBECONFIG!,
    endpoint: process.env.DEVBOX_ENDPOINT || 'https://devbox.cloud.sealos.io',
  })

  console.log('✅ SDK initialized')

  try {
    // 2. 创建 Devbox
    console.log('Creating devbox...')
    
    const devbox = await sdk.createDevbox({
      name: 'my-nodejs-app',
      runtime: 'node.js',
      resource: {
        cpu: 1,      // 1 core
        memory: 2,   // 2 GB
      },
      ports: [
        {
          number: 3000,
          protocol: 'HTTP',
          exposesPublicDomain: true,
        }
      ],
      autostart: true,
    })

    console.log(`✅ Devbox "${devbox.getName()}" created`)

    // 3. 等待 Devbox 就绪
    console.log('Waiting for devbox to be ready...')
    
    await devbox.waitForReady({
      timeout: 300000,  // 5 minutes
      checkInterval: 2000,  // check every 2s
    })

    console.log('✅ Devbox is ready')

    // 4. 获取 Devbox 信息
    const info = await devbox.getInfo()
    
    console.log('\n📋 Devbox Information:')
    console.log(`  Name: ${info.name}`)
    console.log(`  Runtime: ${info.runtime}`)
    console.log(`  Status: ${info.status}`)
    console.log(`  Resources: ${info.resources.cpu}m CPU, ${info.resources.memory}Mi Memory`)
    
    if (info.ports.length > 0) {
      console.log(`  Public URL: ${info.ports[0].publicAddress}`)
    }

    // 5. 清理（可选）
    // await devbox.delete()
    // console.log('✅ Devbox deleted')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    // 6. 关闭 SDK
    await sdk.close()
    console.log('✅ SDK closed')
  }
}

// 运行示例
main().catch(console.error)
```

#### 2.2 文件操作

**文件**: `packages/sdk/examples/01-basic/file-operations.ts`

```typescript
/**
 * 示例 2: 文件操作
 * 
 * 本示例演示如何：
 * - 写入文件
 * - 读取文件
 * - 列出文件
 * - 批量上传
 */

import { DevboxSDK } from '@devbox/sdk'

async function main() {
  const sdk = new DevboxSDK({
    kubeconfig: process.env.KUBECONFIG!,
    endpoint: process.env.DEVBOX_ENDPOINT!,
  })

  const devbox = await sdk.getDevbox('my-nodejs-app')

  try {
    // 1. 写入单个文件
    console.log('Writing package.json...')
    
    await devbox.writeFile('/app/package.json', JSON.stringify({
      name: 'my-app',
      version: '1.0.0',
      scripts: {
        start: 'node index.js',
      },
      dependencies: {
        express: '^4.18.0',
      }
    }, null, 2))

    console.log('✅ File written')

    // 2. 读取文件
    console.log('Reading package.json...')
    
    const content = await devbox.readFile('/app/package.json', { encoding: 'utf-8' })
    console.log('✅ File content:', content.substring(0, 100) + '...')

    // 3. 列出文件
    console.log('Listing files in /app...')
    
    const files = await devbox.listFiles('/app')
    console.log(`✅ Found ${files.length} files:`, files)

    // 4. 批量上传文件
    console.log('Uploading multiple files...')
    
    const results = await devbox.uploadFiles([
      {
        path: '/app/index.js',
        content: `
const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.send('Hello from Devbox!')
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
        `.trim()
      },
      {
        path: '/app/.gitignore',
        content: 'node_modules/\n.env\n'
      }
    ], {
      onProgress: (progress) => {
        console.log(`  📦 ${progress.file}: ${progress.percentage}%`)
      }
    })

    console.log(`✅ Uploaded ${results.length} files`)

  } finally {
    await sdk.close()
  }
}

main().catch(console.error)
```

#### 2.3 命令执行

**文件**: `packages/sdk/examples/01-basic/execute-commands.ts`

```typescript
/**
 * 示例 3: 命令执行
 * 
 * 本示例演示如何：
 * - 执行简单命令
 * - 处理输出
 * - 设置工作目录
 * - 处理错误
 */

import { DevboxSDK } from '@devbox/sdk'

async function main() {
  const sdk = new DevboxSDK({
    kubeconfig: process.env.KUBECONFIG!,
    endpoint: process.env.DEVBOX_ENDPOINT!,
  })

  const devbox = await sdk.getDevbox('my-nodejs-app')

  try {
    // 1. 简单命令
    console.log('Executing: ls -la')
    
    const lsResult = await devbox.executeCommand('ls -la', {
      cwd: '/app'
    })
    
    console.log('Output:', lsResult.stdout)

    // 2. 安装依赖
    console.log('Installing dependencies...')
    
    const npmResult = await devbox.executeCommand('npm install', {
      cwd: '/app',
      timeout: 120000,  // 2 minutes
    })
    
    if (npmResult.exitCode === 0) {
      console.log('✅ Dependencies installed')
    } else {
      console.error('❌ Install failed:', npmResult.stderr)
    }

    // 3. 启动应用（后台）
    console.log('Starting application...')
    
    await devbox.executeCommand('nohup npm start > /tmp/app.log 2>&1 &', {
      cwd: '/app'
    })
    
    console.log('✅ Application started in background')

    // 4. 检查进程
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const psResult = await devbox.executeCommand('ps aux | grep node')
    console.log('Running processes:', psResult.stdout)

    // 5. 查看日志
    const logResult = await devbox.executeCommand('cat /tmp/app.log')
    console.log('Application logs:', logResult.stdout)

  } finally {
    await sdk.close()
  }
}

main().catch(console.error)
```

---

### ✅ **Task 3: 高级示例** (0.5 day)

#### 3.1 Session 工作流

**文件**: `packages/sdk/examples/02-advanced/session-workflow.ts`

```typescript
/**
 * 示例 4: Session 工作流
 * 
 * 本示例演示如何使用 Session 进行持久化操作
 */

import { DevboxSDK } from '@devbox/sdk'

async function main() {
  const sdk = new DevboxSDK({
    kubeconfig: process.env.KUBECONFIG!,
    endpoint: process.env.DEVBOX_ENDPOINT!,
  })

  const devbox = await sdk.getDevbox('my-nodejs-app')

  try {
    // 1. 创建 Session
    console.log('Creating session...')
    
    const session = await devbox.createSession({
      shell: '/bin/bash',
      workingDir: '/app',
      env: {
        NODE_ENV: 'development',
      }
    })

    console.log(`✅ Session ${session.getId()} created`)

    // 2. 在 Session 中执行多个命令（保持上下文）
    console.log('\nExecuting commands in session...')

    // 切换目录
    await session.execute('cd /app')
    console.log('✅ Changed to /app')

    // 检查当前目录
    const pwdResult = await session.execute('pwd')
    console.log('Current directory:', pwdResult.output)

    // 设置环境变量
    await session.execute('export DEBUG=true')
    console.log('✅ Set DEBUG=true')

    // 验证环境变量
    const envResult = await session.execute('echo $DEBUG')
    console.log('DEBUG value:', envResult.output)

    // 3. 执行复杂工作流
    console.log('\nRunning build workflow...')

    const steps = [
      { name: 'Install dependencies', cmd: 'npm install' },
      { name: 'Run tests', cmd: 'npm test' },
      { name: 'Build', cmd: 'npm run build' },
    ]

    for (const step of steps) {
      console.log(`\n📦 ${step.name}...`)
      
      const result = await session.execute(step.cmd)
      
      if (result.exitCode === 0) {
        console.log(`✅ ${step.name} succeeded`)
      } else {
        console.error(`❌ ${step.name} failed:`, result.error)
        break
      }
    }

    // 4. 获取 Session 信息
    const info = await session.getInfo()
    console.log('\n📋 Session Info:')
    console.log(`  Status: ${info.status}`)
    console.log(`  Working Dir: ${info.workingDir}`)
    console.log(`  Created: ${new Date(info.createdAt).toISOString()}`)

    // 5. 清理
    await session.terminate()
    console.log('\n✅ Session terminated')

  } finally {
    await sdk.close()
  }
}

main().catch(console.error)
```

#### 3.2 文件监控

**文件**: `packages/sdk/examples/02-advanced/file-watching.ts`

```typescript
/**
 * 示例 5: 实时文件监控
 * 
 * 本示例演示如何监控文件变更
 */

import { DevboxSDK } from '@devbox/sdk'

async function main() {
  const sdk = new DevboxSDK({
    kubeconfig: process.env.KUBECONFIG!,
    endpoint: process.env.DEVBOX_ENDPOINT!,
  })

  const devbox = await sdk.getDevbox('my-nodejs-app')

  try {
    console.log('Starting file watcher...')

    // 监控 /app 目录
    const watcher = await devbox.watchFiles('/app', (event) => {
      const timestamp = new Date(event.timestamp).toISOString()
      console.log(`[${timestamp}] ${event.type.toUpperCase()}: ${event.path}`)
      
      if (event.type === 'rename' && event.oldPath) {
        console.log(`  Renamed from: ${event.oldPath}`)
      }
    }, {
      recursive: true,
      reconnect: true,
    })

    console.log('✅ Watcher started')

    // 模拟文件操作
    console.log('\nCreating test files...')
    
    await devbox.writeFile('/app/test1.txt', 'Hello')
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await devbox.writeFile('/app/test2.txt', 'World')
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await devbox.writeFile('/app/test1.txt', 'Hello Updated')
    await new Promise(resolve => setTimeout(resolve, 500))

    // 运行 30 秒后停止
    console.log('\nWatching for 30 seconds...\n')
    await new Promise(resolve => setTimeout(resolve, 30000))

    // 停止监控
    watcher.close()
    console.log('\n✅ Watcher stopped')

  } finally {
    await sdk.close()
  }
}

main().catch(console.error)
```

---

### ✅ **Task 4: 完整工作流示例** (0.5 day)

#### 4.1 Vite 应用部署

**文件**: `packages/sdk/examples/03-workflows/vite-app.ts`

```typescript
/**
 * 示例 6: Vite + React 应用完整工作流
 * 
 * 本示例演示如何：
 * - 创建 Devbox
 * - 上传应用代码
 * - 安装依赖
 * - 启动开发服务器
 * - 获取访问 URL
 */

import { DevboxSDK } from '@devbox/sdk'
import * as fs from 'fs/promises'
import * as path from 'path'

async function main() {
  const sdk = new DevboxSDK({
    kubeconfig: process.env.KUBECONFIG!,
    endpoint: process.env.DEVBOX_ENDPOINT!,
  })

  try {
    // 1. 创建 Devbox
    console.log('📦 Creating Devbox for Vite app...')
    
    const devbox = await sdk.createDevbox({
      name: 'my-vite-app',
      runtime: 'node.js',
      resource: {
        cpu: 2,
        memory: 4,
      },
      ports: [
        {
          number: 5173,  // Vite 默认端口
          protocol: 'HTTP',
          exposesPublicDomain: true,
        }
      ],
      env: [
        { name: 'NODE_ENV', value: 'development' }
      ],
      autostart: true,
    })

    await devbox.waitForReady()
    console.log('✅ Devbox ready')

    // 2. 创建 Vite 项目
    console.log('\n🏗️ Setting up Vite project...')
    
    const session = await devbox.createSession({ workingDir: '/app' })
    
    // 创建 package.json
    await devbox.writeFile('/app/package.json', JSON.stringify({
      name: 'vite-app',
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite --host 0.0.0.0',
        build: 'vite build',
      },
      dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.2.0',
        'vite': '^5.0.0',
      }
    }, null, 2))

    // 创建 vite.config.js
    await devbox.writeFile('/app/vite.config.js', `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  }
})
    `.trim())

    // 创建基础 React 应用
    await devbox.writeFile('/app/index.html', `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
    `.trim())

    await devbox.writeFile('/app/src/main.jsx', `
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
    `.trim())

    await devbox.writeFile('/app/src/App.jsx', `
import React from 'react'

function App() {
  return (
    <div>
      <h1>Hello from Devbox!</h1>
      <p>Vite + React running in Devbox</p>
    </div>
  )
}

export default App
    `.trim())

    console.log('✅ Project files created')

    // 3. 安装依赖
    console.log('\n📥 Installing dependencies...')
    
    const installResult = await session.execute('npm install', {
      timeout: 180000,  // 3 minutes
    })
    
    if (installResult.exitCode !== 0) {
      throw new Error(`Install failed: ${installResult.error}`)
    }
    
    console.log('✅ Dependencies installed')

    // 4. 启动开发服务器
    console.log('\n🚀 Starting dev server...')
    
    await session.execute('nohup npm run dev > /tmp/vite.log 2>&1 &')
    
    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    console.log('✅ Dev server started')

    // 5. 获取访问 URL
    const info = await devbox.getInfo()
    const publicUrl = info.ports[0]?.publicAddress
    
    console.log('\n🌐 Application URLs:')
    console.log(`  Public: ${publicUrl}`)
    console.log(`  Private: ${info.ports[0]?.privateAddress}`)

    console.log('\n✅ Vite app is ready!')
    console.log('\n💡 Tip: Keep the devbox running and access it via the URL above')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await sdk.close()
  }
}

main().catch(console.error)
```

---

### ✅ **Task 5: Vercel Sandbox 迁移指南** (0.5 day)

#### 5.1 适配器实现

**文件**: `packages/sdk/examples/04-vercel-migration/sandbox-provider.ts`

```typescript
/**
 * Vercel Sandbox Provider 适配器
 * 
 * 这个适配器让你可以用 Devbox SDK 替代 Vercel Sandbox
 * 并保持接口兼容
 */

import { DevboxSDK, type DevboxInstance } from '@devbox/sdk'
import type { Session } from '@devbox/sdk'

export interface SandboxInfo {
  sandboxId: string
  url: string | null
  provider: 'devbox'
  createdAt: Date
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  success: boolean
}

export class DevboxSandboxProvider {
  private sdk: DevboxSDK
  private devbox: DevboxInstance | null = null
  private session: Session | null = null

  constructor(config: {
    kubeconfig: string
    endpoint?: string
    timeout?: number
    runtime?: string
    port?: number
  }) {
    this.sdk = new DevboxSDK({
      kubeconfig: config.kubeconfig,
      endpoint: config.endpoint || 'https://devbox.cloud.sealos.io',
    })
  }

  /**
   * 创建 Sandbox
   */
  async createSandbox(): Promise<SandboxInfo> {
    const name = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    this.devbox = await this.sdk.createDevbox({
      name,
      runtime: 'node.js',
      resource: {
        cpu: 2,
        memory: 4,
      },
      ports: [
        {
          number: 5173,
          protocol: 'HTTP',
          exposesPublicDomain: true,
        }
      ],
      autostart: true,
    })

    await this.devbox.waitForReady()

    // 创建默认 Session
    this.session = await this.devbox.createSession({
      workingDir: '/app',
    })

    const info = await this.devbox.getInfo()

    return {
      sandboxId: name,
      url: info.ports[0]?.publicAddress || null,
      provider: 'devbox',
      createdAt: new Date(),
    }
  }

  /**
   * 获取 Sandbox URL
   */
  getSandboxUrl(): string | null {
    if (!this.devbox) return null
    // URL 会在 getInfo() 中获取
    return null  // 需要异步获取
  }

  /**
   * 获取 Sandbox 信息
   */
  async getSandboxInfo(): Promise<SandboxInfo | null> {
    if (!this.devbox) return null

    const info = await this.devbox.getInfo()

    return {
      sandboxId: info.name,
      url: info.ports[0]?.publicAddress || null,
      provider: 'devbox',
      createdAt: new Date(info.createdAt || Date.now()),
    }
  }

  /**
   * 检查是否存活
   */
  async isAlive(): Promise<boolean> {
    if (!this.devbox) return false
    return await this.devbox.isHealthy()
  }

  /**
   * 执行命令
   */
  async runCommand(command: string, options?: {
    cwd?: string
  }): Promise<CommandResult> {
    if (!this.session) {
      throw new Error('No active session')
    }

    const result = await this.session.execute(command)

    return {
      stdout: result.output,
      stderr: result.error,
      exitCode: result.exitCode,
      success: result.exitCode === 0,
    }
  }

  /**
   * 写入文件
   */
  async writeFile(path: string, content: string): Promise<void> {
    if (!this.devbox) {
      throw new Error('No active devbox')
    }

    await this.devbox.writeFile(path, content)
  }

  /**
   * 读取文件
   */
  async readFile(path: string): Promise<string> {
    if (!this.devbox) {
      throw new Error('No active devbox')
    }

    const content = await this.devbox.readFile(path, { encoding: 'utf-8' })
    return content as string
  }

  /**
   * 列出文件
   */
  async listFiles(directory: string = '/'): Promise<string[]> {
    if (!this.devbox) {
      throw new Error('No active devbox')
    }

    return await this.devbox.listFiles(directory)
  }

  /**
   * 安装包
   */
  async installPackages(packages: string[], flags?: string[]): Promise<CommandResult> {
    const flagsStr = flags ? ` ${flags.join(' ')}` : ''
    const cmd = `npm install ${packages.join(' ')}${flagsStr}`

    return await this.runCommand(cmd, { cwd: '/app' })
  }

  /**
   * 重启 Vite 服务器
   */
  async restartViteServer(): Promise<void> {
    if (!this.session) {
      throw new Error('No active session')
    }

    // 杀掉现有进程
    await this.session.execute('pkill -f vite').catch(() => {})

    // 等待进程退出
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 启动新进程
    await this.session.execute('nohup npm run dev > /tmp/vite.log 2>&1 &')
  }

  /**
   * 终止 Sandbox
   */
  async terminate(): Promise<void> {
    if (this.session) {
      await this.session.terminate()
      this.session = null
    }

    if (this.devbox) {
      await this.devbox.delete()
      this.devbox = null
    }

    await this.sdk.close()
  }
}

// 使用示例
async function example() {
  const provider = new DevboxSandboxProvider({
    kubeconfig: process.env.KUBECONFIG!,
    endpoint: process.env.DEVBOX_ENDPOINT,
  })

  // 创建 Sandbox（类似 Vercel Sandbox.create()）
  const info = await provider.createSandbox()
  console.log('Sandbox created:', info.sandboxId)
  console.log('URL:', info.url)

  // 写入文件
  await provider.writeFile('/app/package.json', JSON.stringify({
    name: 'my-app',
    scripts: { dev: 'vite' },
  }))

  // 安装依赖
  await provider.installPackages(['vite', 'react'])

  // 启动服务器
  await provider.restartViteServer()

  // 清理
  await provider.terminate()
}
```

#### 5.2 迁移对比文档

**文件**: `packages/sdk/examples/04-vercel-migration/README.md`

```markdown
# Vercel Sandbox → Devbox SDK 迁移指南

## 功能对比

| 功能 | Vercel Sandbox | Devbox SDK | 迁移难度 |
|------|---------------|------------|---------|
| 创建实例 | `Sandbox.create()` | `sdk.createDevbox()` | ✅ 简单 |
| 文件操作 | `sandbox.writeFiles()` | `devbox.writeFile()` | ✅ 简单 |
| 命令执行 | `sandbox.runCommand()` | `devbox.executeCommand()` | ✅ 简单 |
| 文件列表 | `sandbox.runCommand('find ...')` | `devbox.listFiles()` | ✅ 更简单 |
| Dev Server | 自行管理 | 自行管理 | ✅ 相同 |
| 终止 | `sandbox.stop()` | `devbox.delete()` | ✅ 简单 |

## 代码迁移示例

### Before (Vercel Sandbox)

\`\`\`typescript
import { Sandbox } from '@vercel/sandbox'

const sandbox = await Sandbox.create({
  timeout: 900000,
  runtime: 'node22',
  ports: [5173],
  token: process.env.VERCEL_TOKEN,
})

await sandbox.writeFiles([
  { path: '/app/package.json', content: Buffer.from('...') }
])

const result = await sandbox.runCommand({
  cmd: 'npm',
  args: ['install'],
  cwd: '/app',
})

await sandbox.stop()
\`\`\`

### After (Devbox SDK)

\`\`\`typescript
import { DevboxSDK } from '@devbox/sdk'

const sdk = new DevboxSDK({
  kubeconfig: process.env.KUBECONFIG!,
  endpoint: process.env.DEVBOX_ENDPOINT!,
})

const devbox = await sdk.createDevbox({
  name: 'my-sandbox',
  runtime: 'node.js',
  resource: { cpu: 2, memory: 4 },
  ports: [{ number: 5173, protocol: 'HTTP' }],
})

await devbox.waitForReady()

await devbox.writeFile('/app/package.json', '...')

const result = await devbox.executeCommand('npm install', {
  cwd: '/app'
})

await devbox.delete()
await sdk.close()
\`\`\`

## 使用适配器（零改动迁移）

如果你想保持代码不变，可以使用我们提供的适配器：

\`\`\`typescript
import { DevboxSandboxProvider } from './sandbox-provider'

// 替换 Vercel Sandbox
const sandbox = new DevboxSandboxProvider({
  kubeconfig: process.env.KUBECONFIG!,
})

// 其余代码保持不变！
await sandbox.createSandbox()
await sandbox.writeFile('/app/test.txt', 'hello')
await sandbox.runCommand('npm install')
await sandbox.terminate()
\`\`\`

## 优势对比

### Devbox SDK 的优势

1. ✅ **成本更低** - 按实际使用计费
2. ✅ **更灵活** - 完全控制生命周期
3. ✅ **更强大** - 持久化 Session、文件监控
4. ✅ **自托管** - 数据完全掌控
5. ✅ **Kubernetes 原生** - 与现有基础设施集成

### 迁移建议

1. 先使用**适配器**快速验证功能
2. 逐步迁移到**原生 API**以获得更好性能
3. 利用 **Session** 提升复杂工作流效率
4. 使用**文件监控**实现实时反馈
```

---

## Documentation Files

### ✅ **主 README**

**文件**: `packages/sdk/README.md`

更新主 README，添加：
- 快速开始
- 核心概念
- API 概览
- 示例链接
- 最佳实践

### ✅ **API 文档**

**文件**: `packages/sdk/docs/API.md`

生成完整的 API 文档（可使用 TypeDoc）

### ✅ **最佳实践**

**文件**: `packages/sdk/docs/BEST_PRACTICES.md`

包含：
- 错误处理
- 资源清理
- 性能优化
- 安全建议

---

## Success Criteria

### ✅ **示例完整性**
- [ ] ✅ 所有基础功能有示例
- [ ] ✅ 高级功能有示例
- [ ] ✅ 完整工作流有示例
- [ ] ✅ Vercel 迁移指南

### ✅ **文档质量**
- [ ] ✅ API 文档完整
- [ ] ✅ 类型定义导出
- [ ] ✅ 注释清晰
- [ ] ✅ 示例可运行

### ✅ **易用性**
- [ ] ✅ 5 分钟快速开始
- [ ] ✅ 复制粘贴即可运行
- [ ] ✅ 清晰的错误提示

---

**Estimated Completion**: 2 days  
**Dependencies**: Phase 1 and Phase 2 completed  
**Blocks**: Phase 4

