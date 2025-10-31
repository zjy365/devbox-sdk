# Task: SDK Phase 1 - Core Implementation

**Priority**: 🔴 Critical  
**Estimated Time**: 3-4 days  
**Status**: ⏳ Pending  
**Dependencies**: Devbox API available, Analysis (0009) completed

---

## Overview

实现 Devbox SDK 的核心功能，对接完整的 Devbox 管理 API，使 SDK 能够作为 Vercel Sandbox 的完美替代品。本阶段专注于**核心功能实现和 API 集成**。

**目标**:
- ✅ 完整对接 Devbox 生命周期 API（15+ 端点）
- ✅ 实现文件操作和命令执行（满足 Vercel Sandbox 需求）
- ✅ 修复现有架构缺陷
- ✅ 提供稳定可用的 SDK（80% 核心功能）

**成功标准**:
```typescript
// 1. 基础创建和管理
const sdk = new DevboxSDK({ kubeconfig, endpoint })
const devbox = await sdk.createDevbox({ name, runtime, resource })
await devbox.waitForReady()

// 2. 文件操作
await devbox.writeFile('/app/package.json', content)
const data = await devbox.readFile('/app/package.json')
await devbox.uploadFiles([...])

// 3. 命令执行
const result = await devbox.executeCommand('npm install')

// 4. 生命周期
await devbox.start()
await devbox.pause()
await devbox.restart()
await devbox.delete()
```

---

## Parent Task

本任务是 SDK 实现的第一阶段，后续任务：
- [ ] **Phase 1**: 核心实现 (本任务)
- [ ] Phase 2: 高级功能（Session、Transfer、Monitor）
- [ ] Phase 3: 示例和文档
- [ ] Phase 4: 测试和优化

---

## API 对接清单

基于 `devbox-api.json`，需要对接以下 API：

### 📋 **1. Query APIs (只读操作)**

| API 端点 | 功能 | SDK 方法 | 优先级 |
|---------|------|----------|--------|
| `GET /api/v1/devbox` | 获取所有 Devbox | `listDevboxes()` | 🔴 P0 |
| `GET /api/v1/devbox/{name}` | 获取单个 Devbox 详情 | `getDevbox()` | 🔴 P0 |
| `GET /api/v1/devbox/{name}/release` | 获取 Release 列表 | `listReleases()` | 🟡 P1 |
| `GET /api/v1/devbox/{name}/monitor` | 获取监控数据 | `getMonitorData()` | 🟡 P2 |
| `GET /api/v1/devbox/templates` | 获取可用 Runtime | `getTemplates()` | 🔴 P0 |

### 🔧 **2. Mutation APIs (写操作)**

#### **生命周期管理** (Critical - P0)
| API 端点 | 功能 | SDK 方法 | 优先级 |
|---------|------|----------|--------|
| `POST /api/v1/devbox` | 创建 Devbox | `createDevbox()` | 🔴 P0 |
| `PATCH /api/v1/devbox/{name}` | 更新资源/端口 | `updateDevbox()` | 🟡 P1 |
| `DELETE /api/v1/devbox/{name}/delete` | 删除 Devbox | `deleteDevbox()` | 🔴 P0 |
| `POST /api/v1/devbox/{name}/start` | 启动 | `start()` | 🔴 P0 |
| `POST /api/v1/devbox/{name}/pause` | 暂停 | `pause()` | 🔴 P0 |
| `POST /api/v1/devbox/{name}/restart` | 重启 | `restart()` | 🔴 P0 |
| `POST /api/v1/devbox/{name}/shutdown` | 关机 | `shutdown()` | 🟡 P1 |

#### **端口管理** (Medium - P1)
| API 端点 | 功能 | SDK 方法 | 优先级 |
|---------|------|----------|--------|
| `PUT /api/v1/devbox/{name}/ports` | 更新端口配置 | `updatePorts()` | 🟡 P1 |

#### **Release 管理** (Low - P2)
| API 端点 | 功能 | SDK 方法 | 优先级 |
|---------|------|----------|--------|
| `POST /api/v1/devbox/{name}/release` | 创建 Release | `createRelease()` | 🟢 P2 |
| `DELETE /api/v1/devbox/{name}/release/{tag}` | 删除 Release | `deleteRelease()` | 🟢 P2 |
| `POST /api/v1/devbox/{name}/release/{tag}/deploy` | 部署 Release | `deployRelease()` | 🟢 P2 |

#### **自动启动** (Low - P2)
| API 端点 | 功能 | SDK 方法 | 优先级 |
|---------|------|----------|--------|
| `POST /api/v1/devbox/{name}/autostart` | 配置自动启动 | `configureAutostart()` | 🟢 P2 |

### 🔌 **3. Bun Server APIs (已实现)**

这些 API 由内部 Bun Server 提供（通过 SSH tunnel 或 Ingress 访问）：

| 功能 | Bun Server 端点 | SDK 方法 | 优先级 |
|------|----------------|----------|--------|
| 文件读取 | `POST /files/read` | `readFile()` | 🔴 P0 |
| 文件写入 | `POST /files/write` | `writeFile()` | 🔴 P0 |
| 文件上传 | `POST /files/upload` | `uploadFiles()` | 🔴 P0 |
| 文件列表 | `POST /files/list` | `listFiles()` | 🔴 P0 |
| 命令执行 | `POST /process/exec` | `executeCommand()` | 🔴 P0 |
| 健康检查 | `GET /health` | `isHealthy()` | 🔴 P0 |
| Session 创建 | `POST /sessions/create` | `createSession()` | 🟡 P2 |
| Session 执行 | `POST /sessions/{id}/execute` | `session.execute()` | 🟡 P2 |
| 文件监控 WebSocket | `WS /files/watch` | `watchFiles()` | 🟡 P1 |

---

## Implementation Tasks

### ✅ **Task 1: 修复核心架构缺陷** (0.5 day)

#### 1.1 修复 ConnectionManager 导入路径
**问题**: `packages/sdk/src/core/DevboxInstance.ts` 导入路径错误
```typescript
// ❌ 错误
import { ConnectionManager } from '../connection/manager'

// ✅ 正确
import { ConnectionManager } from '../http/manager'
```

**文件**: `packages/sdk/src/core/DevboxInstance.ts`

#### 1.2 实现 DevboxSDK.close()
**目标**: 资源清理和连接池关闭

```typescript
// packages/sdk/src/core/DevboxSDK.ts
async close(): Promise<void> {
  this.logger.info('Closing DevboxSDK...')
  
  // 1. 关闭所有连接池
  await this.connectionManager?.close()
  
  // 2. 清理监控资源
  await this.metricsCollector?.stop()
  
  // 3. 清空缓存
  this.instanceCache.clear()
  
  this.logger.info('DevboxSDK closed')
}
```

**验收标准**:
- ✅ 所有 HTTP 连接正确关闭
- ✅ 连接池资源释放
- ✅ 无内存泄漏

---

### ✅ **Task 2: 完整实现 DevboxAPI 客户端** (1 day)

#### 2.1 实现所有 Query APIs

**文件**: `packages/sdk/src/api/client.ts`

```typescript
export class DevboxAPI {
  // ============ Query APIs ============
  
  /**
   * GET /api/v1/devbox - 获取所有 Devbox
   */
  async listDevboxes(): Promise<DevboxListResponse> {
    const response = await this.request<DevboxListResponse>({
      method: 'GET',
      path: '/api/v1/devbox',
    })
    return response
  }
  
  /**
   * GET /api/v1/devbox/{name} - 获取单个 Devbox 详情
   */
  async getDevbox(name: string): Promise<DevboxDetailResponse> {
    this.validateDevboxName(name)
    
    const response = await this.request<DevboxDetailResponse>({
      method: 'GET',
      path: `/api/v1/devbox/${name}`,
    })
    return response
  }
  
  /**
   * GET /api/v1/devbox/templates - 获取可用 Runtime 模板
   */
  async getTemplates(): Promise<TemplatesResponse> {
    const response = await this.request<TemplatesResponse>({
      method: 'GET',
      path: '/api/v1/devbox/templates',
    })
    return response
  }
  
  /**
   * GET /api/v1/devbox/{name}/release - 获取 Release 列表
   */
  async listReleases(name: string): Promise<ReleaseListResponse> {
    this.validateDevboxName(name)
    
    const response = await this.request<ReleaseListResponse>({
      method: 'GET',
      path: `/api/v1/devbox/${name}/release`,
    })
    return response
  }
  
  /**
   * GET /api/v1/devbox/{name}/monitor - 获取监控数据
   */
  async getMonitorData(
    name: string,
    options?: {
      start?: number  // 毫秒时间戳
      end?: number
      step?: string   // 如 "1m", "5m"
    }
  ): Promise<MonitorDataResponse> {
    this.validateDevboxName(name)
    
    const queryParams = new URLSearchParams()
    if (options?.start) queryParams.set('start', options.start.toString())
    if (options?.end) queryParams.set('end', options.end.toString())
    if (options?.step) queryParams.set('step', options.step)
    
    const query = queryParams.toString()
    const path = `/api/v1/devbox/${name}/monitor${query ? `?${query}` : ''}`
    
    const response = await this.request<MonitorDataResponse>({
      method: 'GET',
      path,
    })
    return response
  }
  
  // ============ Mutation APIs ============
  
  /**
   * POST /api/v1/devbox - 创建 Devbox
   */
  async createDevbox(config: CreateDevboxRequest): Promise<void> {
    await this.request({
      method: 'POST',
      path: '/api/v1/devbox',
      data: config,
    })
  }
  
  /**
   * PATCH /api/v1/devbox/{name} - 更新 Devbox 配置
   */
  async updateDevbox(
    name: string,
    config: UpdateDevboxRequest
  ): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'PATCH',
      path: `/api/v1/devbox/${name}`,
      data: config,
    })
  }
  
  /**
   * DELETE /api/v1/devbox/{name}/delete - 删除 Devbox
   */
  async deleteDevbox(name: string): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'DELETE',
      path: `/api/v1/devbox/${name}/delete`,
    })
  }
  
  /**
   * POST /api/v1/devbox/{name}/start - 启动 Devbox
   */
  async startDevbox(name: string): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'POST',
      path: `/api/v1/devbox/${name}/start`,
      data: {},
    })
  }
  
  /**
   * POST /api/v1/devbox/{name}/pause - 暂停 Devbox
   */
  async pauseDevbox(name: string): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'POST',
      path: `/api/v1/devbox/${name}/pause`,
      data: {},
    })
  }
  
  /**
   * POST /api/v1/devbox/{name}/restart - 重启 Devbox
   */
  async restartDevbox(name: string): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'POST',
      path: `/api/v1/devbox/${name}/restart`,
      data: {},
    })
  }
  
  /**
   * POST /api/v1/devbox/{name}/shutdown - 关机 Devbox
   */
  async shutdownDevbox(name: string): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'POST',
      path: `/api/v1/devbox/${name}/shutdown`,
      data: {},
    })
  }
  
  /**
   * PUT /api/v1/devbox/{name}/ports - 更新端口配置
   */
  async updatePorts(
    name: string,
    ports: PortConfig[]
  ): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'PUT',
      path: `/api/v1/devbox/${name}/ports`,
      data: { ports },
    })
  }
  
  // ============ Release APIs ============
  
  /**
   * POST /api/v1/devbox/{name}/release - 创建 Release
   */
  async createRelease(
    name: string,
    config: { tag: string; releaseDes?: string }
  ): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'POST',
      path: `/api/v1/devbox/${name}/release`,
      data: config,
    })
  }
  
  /**
   * DELETE /api/v1/devbox/{name}/release/{tag} - 删除 Release
   */
  async deleteRelease(name: string, tag: string): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'DELETE',
      path: `/api/v1/devbox/${name}/release/${tag}`,
    })
  }
  
  /**
   * POST /api/v1/devbox/{name}/release/{tag}/deploy - 部署 Release
   */
  async deployRelease(name: string, tag: string): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'POST',
      path: `/api/v1/devbox/${name}/release/${tag}/deploy`,
      data: {},
    })
  }
  
  /**
   * POST /api/v1/devbox/{name}/autostart - 配置自动启动
   */
  async configureAutostart(
    name: string,
    config?: { execCommand?: string }
  ): Promise<void> {
    this.validateDevboxName(name)
    
    await this.request({
      method: 'POST',
      path: `/api/v1/devbox/${name}/autostart`,
      data: config || {},
    })
  }
  
  // ============ Helper Methods ============
  
  private validateDevboxName(name: string): void {
    // DNS 命名规范：lowercase, numbers, hyphens, 1-63 chars
    const dnsPattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
    
    if (!name || name.length < 1 || name.length > 63) {
      throw new DevboxError(
        'VALIDATION_ERROR',
        'Devbox name must be 1-63 characters'
      )
    }
    
    if (!dnsPattern.test(name)) {
      throw new DevboxError(
        'VALIDATION_ERROR',
        'Devbox name must comply with DNS naming conventions'
      )
    }
  }
}
```

#### 2.2 添加类型定义

**文件**: `packages/sdk/src/api/types.ts`

```typescript
// ============ Request Types ============

export interface CreateDevboxRequest {
  name: string
  runtime: string
  resource: {
    cpu: number  // 0.1, 0.2, 0.5, 1, 2, 4, 8, 16
    memory: number  // 0.1, 0.5, 1, 2, 4, 8, 16, 32
  }
  ports?: PortConfig[]
  env?: EnvVar[]
  autostart?: boolean
}

export interface UpdateDevboxRequest {
  resource?: {
    cpu: number
    memory: number
  }
  ports?: PortConfig[]
}

export interface PortConfig {
  number: number  // 1-65535
  protocol?: 'HTTP' | 'GRPC' | 'WS'
  exposesPublicDomain?: boolean
  customDomain?: string
  portName?: string  // 用于更新已有端口
}

export interface EnvVar {
  name: string
  value?: string
  valueFrom?: {
    secretKeyRef: {
      name: string
      key: string
    }
  }
}

// ============ Response Types ============

export interface DevboxListResponse {
  data: Array<{
    name: string
    uid: string
    resourceType: 'devbox'
    runtime: string
    status: string
    resources: {
      cpu: number
      memory: number
    }
  }>
}

export interface DevboxDetailResponse {
  data: {
    name: string
    uid: string
    resourceType: 'devbox'
    runtime: string
    image: string
    status: string
    resources: {
      cpu: number
      memory: number
    }
    ssh: {
      host: string
      port: number
      user: string
      workingDir: string
      privateKey?: string
    }
    env?: EnvVar[]
    ports: Array<{
      number: number
      portName: string
      protocol: string
      serviceName: string
      privateAddress: string
      privateHost: string
      networkName: string
      publicHost?: string
      publicAddress?: string
      customDomain?: string
    }>
    pods?: Array<{
      name: string
      status: string
    }>
  }
}

export interface TemplatesResponse {
  data: {
    runtime: Array<{
      uid: string
      iconId: string | null
      name: string
      kind: 'FRAMEWORK' | 'OS' | 'LANGUAGE' | 'SERVICE' | 'CUSTOM'
      description: string | null
      isPublic: boolean
    }>
    config: Array<{
      templateUid: string
      templateName: string
      runtimeUid: string
      runtime: string | null
      config: {
        appPorts?: Array<{
          name: string
          port: number
          protocol: string
        }>
        ports?: Array<{
          containerPort: number
          name: string
          protocol: string
        }>
        releaseCommand?: string[]
        releaseArgs?: string[]
        user?: string
        workingDir?: string
      }
    }>
  }
}

export interface ReleaseListResponse {
  data: Array<{
    id: string
    name: string
    devboxName: string
    createTime: string
    tag: string
    status: {
      value: string
      label: string
    }
    description: string
    image: string
  }>
}

export interface MonitorDataResponse {
  code: 200
  data: Array<{
    timestamp: number
    readableTime: string
    cpu: number
    memory: number
  }>
}
```

**验收标准**:
- ✅ 所有 15+ API 端点完整实现
- ✅ 完整的类型定义和文档
- ✅ 参数验证（DNS 命名规范等）
- ✅ 错误处理和重试逻辑

---

### ✅ **Task 3: 实现 DevboxInstance 核心方法** (1 day)

#### 3.1 实现 waitForReady()

**目标**: 等待 Devbox 就绪（状态变为 Running 且健康检查通过）

```typescript
// packages/sdk/src/core/DevboxInstance.ts

/**
 * 等待 Devbox 就绪
 * @param timeout 超时时间（毫秒），默认 300000 (5分钟)
 * @param checkInterval 检查间隔（毫秒），默认 2000
 */
async waitForReady(
  timeout: number = 300000,
  checkInterval: number = 2000
): Promise<void> {
  const startTime = Date.now()
  
  this.logger.info(`Waiting for devbox ${this.name} to be ready...`)
  
  while (Date.now() - startTime < timeout) {
    try {
      // 1. 检查 Devbox 状态
      const info = await this.getInfo()
      
      if (info.status === 'Running') {
        // 2. 检查健康状态
        const healthy = await this.isHealthy()
        
        if (healthy) {
          this.logger.info(`Devbox ${this.name} is ready`)
          return
        }
      }
      
      // 3. 等待下次检查
      await new Promise(resolve => setTimeout(resolve, checkInterval))
      
    } catch (error) {
      this.logger.warn(`Health check failed: ${error.message}`)
      // 继续等待
    }
  }
  
  throw new DevboxError(
    'TIMEOUT',
    `Devbox ${this.name} did not become ready within ${timeout}ms`
  )
}
```

#### 3.2 实现 isHealthy()

**目标**: 检查 Devbox 内部服务健康状态

```typescript
/**
 * 检查 Devbox 健康状态
 */
async isHealthy(): Promise<boolean> {
  try {
    // 通过 ConnectionManager 调用 Bun Server 的 /health 端点
    const response = await this.connectionManager.executeWithConnection(
      this.name,
      async (connection) => {
        return await connection.get('/health')
      }
    )
    
    return response.status === 'healthy'
    
  } catch (error) {
    this.logger.warn(`Health check failed for ${this.name}: ${error.message}`)
    return false
  }
}
```

#### 3.3 完善文件操作方法

**目标**: 确保文件操作通过 Bun Server API

```typescript
/**
 * 读取文件
 */
async readFile(
  path: string,
  options?: { encoding?: BufferEncoding }
): Promise<Buffer | string> {
  this.validatePath(path)
  
  const response = await this.connectionManager.executeWithConnection(
    this.name,
    async (connection) => {
      return await connection.post('/files/read', { path })
    }
  )
  
  const content = response.data.content
  
  // 处理编码
  if (options?.encoding) {
    return Buffer.from(content, 'base64').toString(options.encoding)
  }
  
  return Buffer.from(content, 'base64')
}

/**
 * 写入文件
 */
async writeFile(
  path: string,
  content: string | Buffer,
  options?: { encoding?: BufferEncoding; createDirs?: boolean }
): Promise<void> {
  this.validatePath(path)
  
  // 转换为 base64
  const base64Content = Buffer.isBuffer(content)
    ? content.toString('base64')
    : Buffer.from(content, options?.encoding || 'utf-8').toString('base64')
  
  await this.connectionManager.executeWithConnection(
    this.name,
    async (connection) => {
      return await connection.post('/files/write', {
        path,
        content: base64Content,
        createDirs: options?.createDirs ?? true,
      })
    }
  )
}

/**
 * 列出文件
 */
async listFiles(directory: string = '/'): Promise<string[]> {
  this.validatePath(directory)
  
  const response = await this.connectionManager.executeWithConnection(
    this.name,
    async (connection) => {
      return await connection.post('/files/list', {
        path: directory,
        recursive: true,
      })
    }
  )
  
  return response.data.files || []
}

/**
 * 执行命令
 */
async executeCommand(
  command: string,
  options?: {
    cwd?: string
    env?: Record<string, string>
    timeout?: number
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const response = await this.connectionManager.executeWithConnection(
    this.name,
    async (connection) => {
      return await connection.post('/process/exec', {
        command,
        args: [],  // 如果需要分离参数可以解析 command
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout,
      })
    }
  )
  
  return {
    stdout: response.data.output || '',
    stderr: response.data.error || '',
    exitCode: response.data.exitCode || 0,
  }
}
```

**验收标准**:
- ✅ `waitForReady()` 正确等待 Devbox 就绪
- ✅ `isHealthy()` 正确检查健康状态
- ✅ 文件操作通过 Bun Server API
- ✅ 命令执行返回完整结果

---

### ✅ **Task 4: 实现 ConnectionManager 核心逻辑** (0.5 day)

#### 4.1 实现 executeWithConnection()

**文件**: `packages/sdk/src/http/manager.ts`

```typescript
/**
 * 使用连接执行操作
 */
async executeWithConnection<T>(
  devboxName: string,
  operation: (connection: HttpConnection) => Promise<T>
): Promise<T> {
  // 1. 获取 Devbox 信息
  const devboxInfo = await this.getDevboxInfo(devboxName)
  
  if (!devboxInfo) {
    throw new DevboxError('NOT_FOUND', `Devbox ${devboxName} not found`)
  }
  
  // 2. 确定连接 URL
  const connectionUrl = this.getConnectionUrl(devboxInfo)
  
  // 3. 从连接池获取或创建连接
  const connection = await this.connectionPool.acquire(connectionUrl)
  
  try {
    // 4. 执行操作
    const result = await operation(connection)
    
    // 5. 释放连接回池
    await this.connectionPool.release(connection)
    
    return result
    
  } catch (error) {
    // 6. 错误时标记连接为不健康
    await this.connectionPool.destroy(connection)
    
    throw new DevboxError(
      'OPERATION_FAILED',
      `Failed to execute operation on ${devboxName}: ${error.message}`,
      { cause: error }
    )
  }
}

/**
 * 获取连接 URL
 */
private getConnectionUrl(devboxInfo: DevboxDetailResponse['data']): string {
  // 优先使用公网地址
  if (devboxInfo.ports && devboxInfo.ports.length > 0) {
    const port = devboxInfo.ports[0]
    
    if (port.publicAddress) {
      return port.publicAddress  // https://xyz789.cloud.sealos.io
    }
    
    if (port.privateAddress) {
      return port.privateAddress  // http://devbox.ns-user123:3000
    }
  }
  
  throw new DevboxError(
    'NO_CONNECTION_URL',
    `No accessible URL found for devbox ${devboxInfo.name}`
  )
}

/**
 * 获取 Devbox 信息（带缓存）
 */
private async getDevboxInfo(name: string): Promise<DevboxDetailResponse['data'] | null> {
  // 简单缓存机制，避免频繁查询
  const cacheKey = `devbox:${name}`
  const cached = this.cache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.data
  }
  
  try {
    const response = await this.apiClient.getDevbox(name)
    
    this.cache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
    })
    
    return response.data
    
  } catch (error) {
    return null
  }
}
```

**验收标准**:
- ✅ 正确从连接池获取连接
- ✅ 自动处理连接 URL（公网/内网）
- ✅ 错误时释放连接
- ✅ 缓存 Devbox 信息

---

### ✅ **Task 5: 增强 ConnectionPool** (0.5 day)

#### 5.1 实现基础健康检查

**文件**: `packages/sdk/src/http/pool.ts`

```typescript
/**
 * 检查连接健康状态
 */
private async isConnectionHealthy(connection: HttpConnection): Promise<boolean> {
  try {
    // 简单的健康检查：发送 HEAD 请求
    const response = await connection.head('/health', { timeout: 5000 })
    return response.status === 200
    
  } catch (error) {
    return false
  }
}

/**
 * 获取连接
 */
async acquire(url: string): Promise<HttpConnection> {
  const pool = this.pools.get(url) || this.createPool(url)
  
  // 1. 尝试复用空闲连接
  while (pool.idle.length > 0) {
    const connection = pool.idle.shift()!
    
    // 检查连接是否健康
    const healthy = await this.isConnectionHealthy(connection)
    
    if (healthy) {
      pool.active.add(connection)
      return connection
    } else {
      // 销毁不健康的连接
      pool.total--
    }
  }
  
  // 2. 创建新连接（如果未达到上限）
  if (pool.total < this.options.maxPerUrl) {
    const connection = this.createConnection(url)
    pool.total++
    pool.active.add(connection)
    return connection
  }
  
  // 3. 等待空闲连接
  return this.waitForConnection(url)
}
```

**验收标准**:
- ✅ 基础健康检查实现
- ✅ 不健康连接自动销毁
- ✅ 连接复用和池管理

---

## Testing Checklist

### ✅ **单元测试**

```typescript
// packages/sdk/__tests__/unit/devbox-instance.test.ts

describe('DevboxInstance', () => {
  it('should wait for devbox to be ready', async () => {
    const instance = new DevboxInstance(...)
    await instance.waitForReady()
    expect(instance.isHealthy()).resolves.toBe(true)
  })
  
  it('should throw timeout error', async () => {
    await expect(
      instance.waitForReady(1000)  // 1秒超时
    ).rejects.toThrow('TIMEOUT')
  })
})
```

### ✅ **集成测试**

```typescript
// packages/sdk/__tests__/integration/devbox-lifecycle.test.ts

describe('Devbox Lifecycle', () => {
  it('should create and manage devbox', async () => {
    const sdk = new DevboxSDK(testConfig)
    
    // 1. 创建
    const devbox = await sdk.createDevbox({
      name: 'test-devbox',
      runtime: 'node.js',
      resource: { cpu: 1, memory: 2 },
    })
    
    // 2. 等待就绪
    await devbox.waitForReady()
    
    // 3. 文件操作
    await devbox.writeFile('/test.txt', 'Hello')
    const content = await devbox.readFile('/test.txt')
    expect(content.toString()).toBe('Hello')
    
    // 4. 命令执行
    const result = await devbox.executeCommand('echo "test"')
    expect(result.stdout).toContain('test')
    
    // 5. 清理
    await devbox.delete()
  })
})
```

---

## Success Criteria

### ✅ **功能完整性**
- [ ] ✅ 所有 P0 API 完整实现（15+ 端点）
- [ ] ✅ DevboxInstance 核心方法可用
- [ ] ✅ 文件操作和命令执行正常
- [ ] ✅ 连接池和健康检查工作

### ✅ **代码质量**
- [ ] ✅ TypeScript 类型完整
- [ ] ✅ 错误处理和重试机制
- [ ] ✅ 日志记录完善
- [ ] ✅ 单元测试覆盖率 ≥ 70%

### ✅ **文档**
- [ ] ✅ API 文档注释完整
- [ ] ✅ 类型定义导出
- [ ] ✅ README 更新

---

## Next Steps

完成本任务后，进入下一阶段：
- **Phase 2**: 高级功能（Session、Transfer Engine、WebSocket）
- **Phase 3**: 示例代码和文档
- **Phase 4**: 性能优化和生产就绪

---

## Notes

### **关于 Bun Server 访问**
SDK 需要通过两种方式访问 Bun Server：
1. **公网 Ingress**: 使用 `publicAddress`（推荐，适合外部访问）
2. **内网 Service**: 使用 `privateAddress`（适合集群内访问）

当前实现优先使用公网地址，确保 SDK 在任何环境都能工作。

### **关于错误处理**
所有 API 调用都应该：
1. 验证参数（DNS 命名等）
2. 捕获和转换错误
3. 提供有意义的错误信息
4. 自动重试（对于临时性错误）

### **关于性能**
- 连接池复用减少连接开销
- Devbox 信息缓存（60秒）减少查询
- 健康检查异步执行

---

**Estimated Completion**: 3-4 days  
**Dependencies**: devbox-api.json, Bun Server API  
**Blocked By**: None  
**Blocks**: Phase 2 tasks

