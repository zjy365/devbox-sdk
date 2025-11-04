# SDK 性能优化指南

本文档记录 Devbox SDK 的性能优化策略、基准测试结果和最佳实践。

## 性能目标

| 操作 | 目标延迟 | 当前状态 |
|------|---------|---------|
| 创建 Devbox | < 60s | ⏳ 待测试 |
| 小文件写入 (< 1KB) | < 500ms | ⏳ 待测试 |
| 中等文件写入 (10KB) | < 1s | ⏳ 待测试 |
| 大文件写入 (1MB) | < 5s | ⏳ 待测试 |
| 命令执行 | < 1s | ⏳ 待测试 |
| 列出文件 | < 2s | ⏳ 待测试 |
| 批量上传 (10 文件) | < 3s | ⏳ 待测试 |

## 优化策略

### 1. 连接池优化

#### ✅ 已实现
- **连接复用**: 通过连接池避免重复建立连接
- **健康检查**: 定期检查连接健康状态
- **自动重连**: 连接失败时自动重试

#### ⏳ 计划中
- **预热连接**: 提前建立连接减少首次请求延迟
- **动态池大小**: 根据负载自动调整连接池大小
- **连接优先级**: 为关键操作预留高优先级连接

#### 配置示例
```typescript
const sdk = new DevboxSDK({
  apiEndpoint: 'https://api.example.com',
  kubeconfig: 'path/to/kubeconfig',
  // 连接池配置
  pool: {
    maxConnections: 10,
    minConnections: 2,
    idleTimeout: 30000,
    connectionTimeout: 10000,
  }
})
```

### 2. 缓存策略

#### ✅ 已实现
- **Devbox 信息缓存**: 缓存 Devbox 基本信息，减少 API 调用

#### ⏳ 计划中
- **DNS 缓存**: 缓存域名解析结果
- **端点缓存**: 缓存 API 端点信息
- **智能失效**: 根据变更事件自动失效缓存

#### 配置示例
```typescript
const sdk = new DevboxSDK({
  // ...其他配置
  cache: {
    enabled: true,
    ttl: 60000, // 60 秒
    maxSize: 100, // 最多缓存 100 个条目
  }
})
```

### 3. 传输优化

#### ✅ 已实现
- **小文件直接传输**: < 1MB 文件直接传输
- **大文件分块传输**: ≥ 1MB 文件分块传输

#### ⏳ 计划中
- **并行分块上传**: 多个分块并行上传
- **压缩传输**: gzip 压缩大文件
- **断点续传**: 支持大文件断点续传
- **增量更新**: 只传输文件变更部分

#### 使用示例
```typescript
// 批量上传优化
await devbox.uploadFiles({
  '/path/file1.txt': 'content1',
  '/path/file2.txt': 'content2',
  // ... 更多文件
}, {
  parallel: true,      // 并行上传
  compress: true,      // 压缩传输
  chunkSize: 1048576, // 1MB 分块
})
```

### 4. API 优化

#### ✅ 已实现
- **批量文件上传**: 一次 API 调用上传多个文件

#### ⏳ 计划中
- **批量命令执行**: 一次调用执行多个命令
- **批量查询**: 一次调用获取多个资源
- **请求合并**: 自动合并相似请求
- **请求去重**: 避免重复请求

### 5. 错误处理和重试

#### ✅ 已实现
- **指数退避重试**: 网络错误自动重试
- **可配置重试策略**: 自定义重试次数和延迟
- **断路器模式**: 防止对故障服务的重复调用

#### 配置示例
```typescript
import { withRetry } from '@sealos/devbox-sdk/utils/retry'

// 自定义重试策略
const result = await withRetry(
  () => devbox.executeCommand('npm install'),
  {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    factor: 2,
  }
)
```

### 6. 并发控制

#### ⏳ 计划中
- **限流器**: 控制并发请求数量
- **请求队列**: 管理请求优先级
- **资源池**: 限制同时运行的资源密集型操作

## 监控和指标

### 使用内置指标收集器

```typescript
import { metrics } from '@sealos/devbox-sdk/monitoring/metrics'

// 执行操作...
await devbox.writeFile('/path/file.txt', 'content')

// 获取性能指标
const summary = metrics.getSummary()
console.log(summary)

// 输出:
// === SDK Performance Summary ===
// Uptime: 120s
// Operations: 50
// Requests: 100 (Success: 95, Failed: 5)
// Connections: 3 created, 2 active
// Files Transferred: 25
// Bytes Transferred: 1.5 MB
// Errors: 5
// Success Rate: 95.00%
```

### 详细指标

```typescript
const detailed = metrics.getDetailedMetrics()

// 查看特定操作的统计
console.log(detailed.operations.file_transfer)
// {
//   count: 25,
//   min: 100,
//   max: 2500,
//   avg: 450,
//   p50: 400,
//   p95: 800,
//   p99: 1200,
//   sum: 11250
// }

// 查看错误分布
console.log(detailed.errors)
// {
//   'ECONNRESET': 2,
//   'ETIMEDOUT': 3
// }
```

### 性能追踪

```typescript
import { track } from '@sealos/devbox-sdk/monitoring/metrics'

async function deployApplication() {
  const tracker = track('deploy_application')
  
  try {
    // 执行部署操作...
    await devbox.uploadFiles(files)
    await devbox.executeCommand('npm install')
    await devbox.executeCommand('npm start')
    
    tracker.success()
  } catch (error) {
    tracker.failure('deployment_error')
    throw error
  }
}
```

## 性能测试

### 运行基准测试

```bash
# 运行所有基准测试
npm run test -- --run packages/sdk/__tests__/benchmarks/

# 运行特定基准测试
npm run test -- --run packages/sdk/__tests__/benchmarks/performance.bench.ts

# 生成基准报告
npm run test -- --run --reporter=verbose packages/sdk/__tests__/benchmarks/
```

### 基准测试结果

测试环境: Node.js 22, Ubuntu 22.04, 4 Core CPU, 8GB RAM

| 操作 | 平均耗时 | P95 | P99 |
|------|---------|-----|-----|
| 文件写入 (1KB) | 待测试 | - | - |
| 文件写入 (10KB) | 待测试 | - | - |
| 文件写入 (100KB) | 待测试 | - | - |
| 文件写入 (1MB) | 待测试 | - | - |
| 批量上传 (10 文件) | 待测试 | - | - |
| 命令执行 | 待测试 | - | - |
| 并发操作 (5 个) | 待测试 | - | - |

## 最佳实践

### 1. 复用 SDK 实例

❌ **不推荐**: 频繁创建销毁实例
```typescript
for (const devbox of devboxes) {
  const sdk = new DevboxSDK(config) // 每次都创建新实例
  await sdk.getDevbox(devbox.name)
  await sdk.close()
}
```

✅ **推荐**: 复用单个实例
```typescript
const sdk = new DevboxSDK(config)
try {
  for (const devbox of devboxes) {
    await sdk.getDevbox(devbox.name)
  }
} finally {
  await sdk.close()
}
```

### 2. 使用批量操作

❌ **不推荐**: 逐个上传文件
```typescript
for (const file of files) {
  await devbox.writeFile(file.path, file.content)
}
```

✅ **推荐**: 批量上传
```typescript
const fileMap = Object.fromEntries(
  files.map(f => [f.path, f.content])
)
await devbox.uploadFiles(fileMap)
```

### 3. 并发操作

❌ **不推荐**: 顺序执行
```typescript
await devbox.writeFile('/file1.txt', 'content1')
await devbox.writeFile('/file2.txt', 'content2')
await devbox.writeFile('/file3.txt', 'content3')
```

✅ **推荐**: 并发执行
```typescript
await Promise.all([
  devbox.writeFile('/file1.txt', 'content1'),
  devbox.writeFile('/file2.txt', 'content2'),
  devbox.writeFile('/file3.txt', 'content3'),
])
```

### 4. 适当的超时设置

```typescript
// 根据操作类型设置合理的超时
const sdk = new DevboxSDK({
  // ...
  timeout: 30000, // 一般操作 30 秒
})

// 耗时操作单独设置
await devbox.executeCommand('npm install', {
  timeout: 300000, // npm install 可能需要 5 分钟
})
```

### 5. 错误处理

```typescript
import { withRetry } from '@sealos/devbox-sdk/utils/retry'

// 对不稳定的操作使用重试
const result = await withRetry(
  () => devbox.executeCommand('curl https://api.example.com'),
  {
    maxRetries: 3,
    shouldRetry: (error) => {
      // 自定义重试条件
      return error.code === 'ETIMEDOUT'
    }
  }
)
```

## 性能问题排查

### 1. 启用调试日志

```typescript
const sdk = new DevboxSDK({
  // ...
  debug: true, // 启用调试日志
})
```

### 2. 查看指标

```typescript
// 定期输出性能指标
setInterval(() => {
  console.log(metrics.getSummary())
}, 60000) // 每分钟
```

### 3. 分析慢查询

```typescript
const detailed = metrics.getDetailedMetrics()

// 找出最慢的操作
for (const [name, stats] of Object.entries(detailed.operations)) {
  if (stats.avg > 1000) {
    console.warn(`慢操作: ${name}, 平均耗时: ${stats.avg}ms`)
  }
}
```

## 未来优化计划

### 短期 (1-2 个月)
- [ ] 实现连接预热
- [ ] 添加请求队列和限流
- [ ] 优化批量操作性能
- [ ] 实现智能缓存失效

### 中期 (3-6 个月)
- [ ] 实现并行分块上传
- [ ] 添加压缩传输支持
- [ ] 实现断点续传
- [ ] 优化内存使用

### 长期 (6+ 个月)
- [ ] 实现增量更新
- [ ] 添加预测性预加载
- [ ] 优化大规模并发场景
- [ ] 实现智能负载均衡

## 贡献

如果你有性能优化建议或发现性能问题，欢迎：
- 提交 Issue
- 提交 Pull Request
- 在 Discussions 中讨论

---

最后更新: 2025-11-03

