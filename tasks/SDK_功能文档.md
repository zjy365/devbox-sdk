# Devbox SDK 功能文档

## 概述

Devbox SDK 是一个企业级 TypeScript SDK，用于 Sealos Devbox 生命周期管理，采用 HTTP API + Bun 运行时架构。该 SDK 提供了完整的 Devbox 容器管理功能，包括创建、连接、文件操作、进程执行、监控等核心能力。

## 核心架构

### 1. 分层架构设计

SDK 采用清晰的分层架构，确保代码的可维护性和扩展性：

#### 核心层 (Core Layer)
- **DevboxSDK**: 主 SDK 类，作为 DevboxInstance 对象的工厂
- **DevboxInstance**: 代表单个 Devbox 容器，提供文件操作、命令执行、监控等功能
- **类型定义**: 完整的 TypeScript 类型系统支持

#### API 集成层 (API Integration Layer)
- **DevboxAPI**: Sealos Devbox API 的 REST 客户端，包含 17 个端点
- **KubeconfigAuthenticator**: 基于 Kubeconfig 的身份验证
- **端点定义**: 统一的 API 端点管理
- **SimpleHTTPClient**: 自定义 HTTP 客户端实现

#### HTTP 连接层 (HTTP Connection Layer)
- **ConnectionManager**: 连接池生命周期管理
- **ConnectionPool**: 智能连接复用，复用率 >98%
- **连接管理**: 每个 Devbox 实例 URL 的连接池管理

#### 传输引擎 (Transfer Engine)
- **自适应文件传输策略**: 根据文件特征选择最优传输方案
- **批量上传**: 支持批量文件操作
- **进度跟踪**: 实时传输进度监控

#### 安全模块 (Security)
- **SecurityAdapter**: 安全策略强制执行
- **路径验证**: 防止目录遍历攻击
- **访问控制**: 权限管理

#### 监控模块 (Monitoring)
- **指标收集**: 性能指标收集
- **连接池统计**: 连接使用情况监控
- **传输指标**: 文件传输性能监控

### 2. 双层通信架构

1. **SDK ↔ Sealos Devbox API (REST)**: 生命周期管理
   - 创建、删除、列出、SSH 信息、监控等操作

2. **SDK ↔ Devbox Container Server (HTTP/WS)**: 文件操作和命令执行
   - 通过运行在容器的 Bun 服务器 (http://{podIP}:3000) 进行操作

## 主要功能模块

### 1. Devbox 生命周期管理

#### 创建和管理实例
```typescript
// 创建 SDK 实例
const sdk = new DevboxSDK({
  kubeconfig: '...',
  baseUrl: 'https://devbox.usw.sealos.io/v1'
})

// 创建新的 Devbox 实例
const devbox = await sdk.createDevbox({
  name: 'my-devbox',
  runtime: 'node.js',
  resource: { cpu: 2, memory: 4 },
  ports: [{ number: 3000, protocol: 'HTTP' }],
  env: { NODE_ENV: 'development' }
})

// 获取现有实例
const existingDevbox = await sdk.getDevbox('my-devbox')

// 列出所有实例
const allDevboxes = await sdk.listDevboxes()
```

#### 生命周期操作
```typescript
// 启动 Devbox
await devbox.start()

// 暂停 Devbox
await devbox.pause()

// 重启 Devbox
await devbox.restart()

// 删除 Devbox
await devbox.delete()

// 等待就绪状态
await devbox.waitForReady(300000, 2000) // 5分钟超时，2秒检查间隔

// 健康检查
const isHealthy = await devbox.isHealthy()
```

### 2. 文件操作系统

#### 基本文件操作
```typescript
// 写入文件
await sdk.writeFile('my-devbox', '/app/config.json', JSON.stringify(config), {
  encoding: 'utf8',
  mode: 0o644,
  createDirs: true
})

// 读取文件
const content = await sdk.readFile('my-devbox', '/app/config.json', {
  encoding: 'utf8'
})

// 删除文件
await sdk.deleteFile('my-devbox', '/app/temp.txt')

// 列出目录
const files = await sdk.listFiles('my-devbox', '/app')
```

#### 批量文件操作
```typescript
// 批量上传文件
const files = {
  '/app/package.json': '{"name": "my-app"}',
  '/app/src/index.js': 'console.log("Hello World")',
  '/app/README.md': '# My App'
}

const result = await sdk.uploadFiles('my-devbox', files, {
  concurrency: 5,
  chunkSize: 1024 * 1024, // 1MB
  onProgress: (progress) => {
    console.log(`Progress: ${progress.progress}%`)
  }
})

console.log(`上传完成: ${result.success}, 处理文件: ${result.processed}/${result.total}`)
```

#### 文件监控
```typescript
// 监控文件变化
const watcher = await sdk.watchFiles('my-devbox', '/app/src', (event) => {
  console.log(`文件 ${event.path} 发生 ${event.type} 变化`)
})

// 停止监控
watcher.close()
```

### 3. 进程和命令执行

#### 命令执行
```typescript
// 执行命令
const result = await devbox.executeCommand('ls -la /app')
console.log(`输出: ${result.stdout}`)
console.log(`错误: ${result.stderr}`)
console.log(`退出码: ${result.exitCode}`)
console.log(`执行时间: ${result.duration}ms`)

// 获取进程状态
const status = await devbox.getProcessStatus(result.pid)
console.log(`进程状态: ${status.state}`)
```

### 4. 连接池管理

#### 智能连接复用
```typescript
// 获取连接管理器
const connectionManager = sdk.getConnectionManager()

// 获取连接池统计
const stats = connectionManager.getConnectionStats()
console.log(`连接复用率: ${(stats.reuseRate * 100).toFixed(2)}%`)
console.log(`活跃连接数: ${stats.activeConnections}`)
console.log(`健康连接数: ${stats.healthyConnections}`)
```

#### 连接配置
```typescript
const sdk = new DevboxSDK({
  kubeconfig: '...',
  connectionPool: {
    maxSize: 15,                    // 最大连接数
    connectionTimeout: 30000,       // 连接超时 30 秒
    keepAliveInterval: 60000,       // 保活间隔 1 分钟
    healthCheckInterval: 60000,     // 健康检查间隔 1 分钟
  },
  http: {
    timeout: 30000,                 // 请求超时 30 秒
    retries: 3,                     // 重试次数
  }
})
```

### 5. 监控和指标

#### 获取监控数据
```typescript
// 获取 Devbox 监控数据
const monitorData = await devbox.getMonitorData({
  start: Date.now() - 3600000,  // 1 小时前
  end: Date.now(),
  step: '1m'
})

monitorData.forEach(data => {
  console.log(`CPU: ${data.cpu}%, 内存: ${data.memory}%`)
  console.log(`网络: 入 ${data.network.bytesIn} B, 出 ${data.network.bytesOut} B`)
  console.log(`磁盘: 已用 ${data.disk.used} B / 总计 ${data.disk.total} B`)
})
```

#### 性能指标收集
```typescript
import { metrics, track } from '@sealos/devbox-sdk/monitoring'

// 使用性能追踪器
const tracker = track('file_operation')
// ... 执行操作
const duration = tracker.success()

// 获取详细指标
const detailedMetrics = metrics.getDetailedMetrics()
console.log(metrics.getSummary())
```

### 6. 安全特性

#### 路径验证
```typescript
// 自动路径验证，防止目录遍历攻击
await devbox.writeFile('../etc/passwd', 'hack') // 抛出错误：Path traversal detected

// 实例方法内部自动验证路径
await devbox.readFile('/app/../etc/passwd') // 抛出错误：Invalid absolute path
```

#### 权限控制
```typescript
import { SecurityAdapter } from '@sealos/devbox-sdk/security'

const security = SecurityAdapter.getInstance()
const hasPermission = security.validatePermissions(
  ['devbox:write', 'devbox:read'],
  userPermissions
)
```

### 7. 错误处理

#### 类型化错误系统
```typescript
import {
  DevboxSDKError,
  AuthenticationError,
  ConnectionError,
  FileOperationError,
  DevboxNotFoundError,
  ERROR_CODES
} from '@sealos/devbox-sdk'

try {
  await sdk.getDevbox('non-existent')
} catch (error) {
  if (error instanceof DevboxNotFoundError) {
    console.log(`Devbox 不存在: ${error.message}`)
    console.log(`错误代码: ${error.code}`)
  }
}
```

## API 端点覆盖

### Devbox 管理 API (17 个端点)

1. **基础操作**
   - `GET /api/v1/devbox` - 列出所有 Devbox
   - `POST /api/v1/devbox` - 创建新 Devbox
   - `GET /api/v1/devbox/{name}` - 获取特定 Devbox
   - `PATCH /api/v1/devbox/{name}` - 更新 Devbox 配置
   - `DELETE /api/v1/devbox/{name}/delete` - 删除 Devbox

2. **生命周期控制**
   - `POST /api/v1/devbox/{name}/start` - 启动 Devbox
   - `POST /api/v1/devbox/{name}/pause` - 暂停 Devbox
   - `POST /api/v1/devbox/{name}/restart` - 重启 Devbox
   - `POST /api/v1/devbox/{name}/shutdown` - 关闭 Devbox

3. **配置管理**
   - `GET /api/v1/devbox/templates` - 获取可用模板
   - `PUT /api/v1/devbox/{name}/ports` - 更新端口配置
   - `POST /api/v1/devbox/{name}/autostart` - 配置自动启动

4. **发布管理**
   - `GET /api/v1/devbox/{name}/release` - 列出发布版本
   - `POST /api/v1/devbox/{name}/release` - 创建发布版本
   - `DELETE /api/v1/devbox/{name}/release/{tag}` - 删除发布版本
   - `POST /api/v1/devbox/{name}/release/{tag}/deploy` - 部署发布版本

5. **监控**
   - `GET /api/v1/devbox/{name}/monitor` - 获取监控数据

### 容器 HTTP 服务端点

1. **健康检查**
   - `GET /health` - 服务健康状态

2. **文件操作**
   - `POST /files/write` - 写入文件
   - `GET /files/read` - 读取文件
   - `POST /files/list` - 列出目录
   - `POST /files/delete` - 删除文件
   - `POST /files/batch-upload` - 批量上传
   - `GET /files/batch-download` - 批量下载

3. **进程管理**
   - `POST /process/exec` - 执行命令
   - `GET /process/status/{pid}` - 获取进程状态

4. **实时通信**
   - `WS /ws` - WebSocket 连接 (文件监控)

## 配置选项

### SDK 配置
```typescript
interface DevboxSDKConfig {
  kubeconfig: string                    // kubeconfig 内容
  baseUrl?: string                     // API 基础 URL
  mockServerUrl?: string               // 开发/测试模拟服务器 URL
  devboxServerUrl?: string             // 容器通信服务器 URL
  connectionPool?: ConnectionPoolConfig // 连接池配置
  http?: HttpClientConfig              // HTTP 客户端配置
}
```

### 连接池配置
```typescript
interface ConnectionPoolConfig {
  maxSize?: number          // 最大连接数 (默认: 15)
  connectionTimeout?: number // 连接超时 (默认: 30 秒)
  keepAliveInterval?: number // 保活间隔 (默认: 1 分钟)
  healthCheckInterval?: number // 健康检查间隔 (默认: 1 分钟)
}
```

### HTTP 客户端配置
```typescript
interface HttpClientConfig {
  timeout?: number    // 请求超时 (默认: 30 秒)
  retries?: number    // 重试次数 (默认: 3)
  proxy?: string      // 代理配置
}
```

## 性能特性

### 连接池性能
- **连接复用率**: >98%
- **最大连接数**: 15 (可配置)
- **健康检查**: 自动连接健康监控
- **智能清理**: 自动清理空闲连接

### 文件传输性能
- **小文件延迟**: <50ms (文件 <1MB)
- **大文件吞吐量**: >15MB/s
- **批量操作**: 支持并发上传
- **进度跟踪**: 实时传输进度

### 服务器性能
- **启动时间**: <100ms (Bun 服务器)
- **并发支持**: 高并发文件操作
- **内存效率**: 优化的内存使用

## 支持的运行时

SDK 支持以下运行时环境：
- **Node.js** - JavaScript/TypeScript 开发
- **Python** - Python 应用开发
- **Go** - Go 语言开发
- **Java** - Java 应用开发
- **React** - 前端开发
- **Vue** - 前端开发
- **Angular** - 前端开发
- **Docker** - 容器化应用
- **Bash** - 脚本和工具开发

## 错误代码

### 身份验证错误
- `AUTHENTICATION_FAILED` - 身份验证失败
- `INVALID_KUBECONFIG` - 无效的 kubeconfig

### 连接错误
- `CONNECTION_FAILED` - 连接失败
- `CONNECTION_TIMEOUT` - 连接超时
- `CONNECTION_POOL_EXHAUSTED` - 连接池耗尽

### Devbox 错误
- `DEVBOX_NOT_FOUND` - Devbox 不存在
- `DEVBOX_CREATION_FAILED` - Devbox 创建失败
- `DEVBOX_OPERATION_FAILED` - Devbox 操作失败

### 文件操作错误
- `FILE_NOT_FOUND` - 文件不存在
- `FILE_TOO_LARGE` - 文件过大
- `FILE_TRANSFER_FAILED` - 文件传输失败
- `PATH_TRAVERSAL_DETECTED` - 检测到路径遍历攻击

### 服务器错误
- `SERVER_UNAVAILABLE` - 服务器不可用
- `HEALTH_CHECK_FAILED` - 健康检查失败

### 通用错误
- `OPERATION_TIMEOUT` - 操作超时
- `VALIDATION_ERROR` - 验证错误
- `INTERNAL_ERROR` - 内部错误

## 最佳实践

### 1. 连接管理
- 复用 SDK 实例以利用连接池
- 适当配置连接池大小
- 监控连接池统计信息

### 2. 错误处理
- 使用类型化错误处理
- 实现适当的重试机制
- 记录错误上下文信息

### 3. 性能优化
- 使用批量文件操作
- 启用文件压缩
- 监控性能指标

### 4. 安全考虑
- 验证所有输入路径
- 使用最小权限原则
- 定期更新依赖项

### 5. 资源管理
- 及时释放资源
- 使用 `await sdk.close()` 清理连接
- 监控内存使用情况

## 示例用例

### 完整的 Devbox 工作流
```typescript
import { DevboxSDK } from '@sealos/devbox-sdk'

async function deployApplication() {
  const sdk = new DevboxSDK({
    kubeconfig: fs.readFileSync('kubeconfig', 'utf8'),
    connectionPool: { maxSize: 10 }
  })

  try {
    // 1. 创建 Devbox
    const devbox = await sdk.createDevbox({
      name: 'my-app-devbox',
      runtime: 'node.js',
      resource: { cpu: 2, memory: 4 },
      ports: [{ number: 3000, protocol: 'HTTP' }]
    })

    // 2. 等待就绪
    await devbox.waitForReady()

    // 3. 上传应用文件
    const appFiles = {
      '/app/package.json': await fs.readFile('package.json'),
      '/app/src/': await fs.readFile('src/index.js'),
      '/app/.env': 'NODE_ENV=production\nPORT=3000'
    }

    await devbox.uploadFiles(appFiles)

    // 4. 安装依赖并启动
    await devbox.executeCommand('cd /app && npm install')
    await devbox.executeCommand('cd /app && npm start')

    // 5. 监控状态
    const monitorData = await devbox.getMonitorData()
    console.log(`应用已部署，CPU: ${monitorData[0].cpu}%`)

    return devbox
  } catch (error) {
    console.error('部署失败:', error)
    throw error
  }
}
```

这个文档全面介绍了 Devbox SDK 的功能特性、架构设计、使用方法和最佳实践，为开发者提供了完整的参考指南。