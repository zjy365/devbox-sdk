# Task: SDK Phase 2 - Advanced Features

**Priority**: 🟡 Medium  
**Estimated Time**: 2-3 days  
**Status**: ⏳ Pending  
**Dependencies**: Phase 1 (0010) completed

---

## Overview

实现 Devbox SDK 的高级功能，包括持久化 Session、文件传输引擎、实时监控和 WebSocket 文件监控。这些功能使 SDK 更加强大和灵活。

**目标**:
- ✅ Session 管理（持久化 Shell 会话）
- ✅ Transfer Engine（智能文件传输）
- ✅ WebSocket 文件监控
- ✅ 监控数据收集和展示

**成功标准**:
```typescript
// 1. Session 管理
const session = await devbox.createSession()
await session.execute('cd /app && npm install')
await session.execute('npm start')

// 2. 智能文件传输
await devbox.uploadFiles([
  { path: '/app/package.json', content: '...' },
  { path: '/app/src/index.js', content: '...' }
], {
  strategy: 'auto',  // 自动选择策略
  onProgress: (progress) => console.log(progress)
})

// 3. 实时文件监控
const watcher = await devbox.watchFiles('/app/src', (event) => {
  console.log(`File ${event.path} ${event.type}`)
})

// 4. 监控数据
const metrics = await devbox.getMonitorData({
  timeRange: '1h',
  step: '1m'
})
```

---

## Parent Task

本任务是 SDK 实现的第二阶段：
- [x] Phase 1: 核心实现
- [ ] **Phase 2**: 高级功能 (本任务)
- [ ] Phase 3: 示例和文档
- [ ] Phase 4: 测试和优化

---

## Implementation Tasks

### ✅ **Task 1: Session 管理** (1 day)

Session 提供**持久化的 Shell 会话**，允许在同一个 Shell 进程中执行多个命令，保持上下文状态（工作目录、环境变量等）。

#### 1.1 Session 类实现

**文件**: `packages/sdk/src/core/Session.ts`

```typescript
import type { DevboxInstance } from './DevboxInstance'
import { DevboxError } from '../utils/error'
import { Logger } from '@devbox/shared/logger'

export interface SessionOptions {
  shell?: string  // 默认 /bin/bash
  workingDir?: string
  env?: Record<string, string>
}

export interface SessionExecuteResult {
  output: string
  error: string
  exitCode: number
  timestamp: number
}

export class Session {
  private sessionId: string
  private devbox: DevboxInstance
  private logger: Logger
  private isActive: boolean = false
  
  constructor(
    sessionId: string,
    devbox: DevboxInstance,
    logger: Logger
  ) {
    this.sessionId = sessionId
    this.devbox = devbox
    this.logger = logger
  }
  
  /**
   * 获取 Session ID
   */
  getId(): string {
    return this.sessionId
  }
  
  /**
   * 检查 Session 是否激活
   */
  isAlive(): boolean {
    return this.isActive
  }
  
  /**
   * 在 Session 中执行命令
   */
  async execute(
    command: string,
    options?: {
      timeout?: number
    }
  ): Promise<SessionExecuteResult> {
    if (!this.isActive) {
      throw new DevboxError(
        'SESSION_INACTIVE',
        `Session ${this.sessionId} is not active`
      )
    }
    
    this.logger.debug(`Executing in session ${this.sessionId}: ${command}`)
    
    try {
      const response = await this.devbox.getConnectionManager().executeWithConnection(
        this.devbox.getName(),
        async (connection) => {
          return await connection.post(`/sessions/${this.sessionId}/execute`, {
            command,
            timeout: options?.timeout,
          })
        }
      )
      
      return {
        output: response.data.output || '',
        error: response.data.error || '',
        exitCode: response.data.exitCode || 0,
        timestamp: Date.now(),
      }
      
    } catch (error) {
      throw new DevboxError(
        'SESSION_EXECUTE_FAILED',
        `Failed to execute command in session: ${error.message}`,
        { cause: error }
      )
    }
  }
  
  /**
   * 获取 Session 信息
   */
  async getInfo(): Promise<{
    id: string
    status: string
    workingDir: string
    env: Record<string, string>
    createdAt: number
    lastActivity: number
  }> {
    try {
      const response = await this.devbox.getConnectionManager().executeWithConnection(
        this.devbox.getName(),
        async (connection) => {
          return await connection.get(`/sessions/${this.sessionId}`)
        }
      )
      
      return response.data
      
    } catch (error) {
      throw new DevboxError(
        'SESSION_INFO_FAILED',
        `Failed to get session info: ${error.message}`,
        { cause: error }
      )
    }
  }
  
  /**
   * 更新 Session 环境变量
   */
  async updateEnv(env: Record<string, string>): Promise<void> {
    try {
      await this.devbox.getConnectionManager().executeWithConnection(
        this.devbox.getName(),
        async (connection) => {
          return await connection.patch(`/sessions/${this.sessionId}`, {
            env,
          })
        }
      )
      
      this.logger.info(`Updated session ${this.sessionId} environment`)
      
    } catch (error) {
      throw new DevboxError(
        'SESSION_UPDATE_FAILED',
        `Failed to update session: ${error.message}`,
        { cause: error }
      )
    }
  }
  
  /**
   * 终止 Session
   */
  async terminate(): Promise<void> {
    if (!this.isActive) {
      return
    }
    
    try {
      await this.devbox.getConnectionManager().executeWithConnection(
        this.devbox.getName(),
        async (connection) => {
          return await connection.delete(`/sessions/${this.sessionId}`)
        }
      )
      
      this.isActive = false
      this.logger.info(`Terminated session ${this.sessionId}`)
      
    } catch (error) {
      throw new DevboxError(
        'SESSION_TERMINATE_FAILED',
        `Failed to terminate session: ${error.message}`,
        { cause: error }
      )
    }
  }
  
  /**
   * 激活 Session（内部方法）
   */
  _activate(): void {
    this.isActive = true
  }
}
```

#### 1.2 在 DevboxInstance 中添加 Session 方法

**文件**: `packages/sdk/src/core/DevboxInstance.ts`

```typescript
import { Session, type SessionOptions } from './Session'

export class DevboxInstance {
  private sessions: Map<string, Session> = new Map()
  
  /**
   * 创建新的 Session
   */
  async createSession(options?: SessionOptions): Promise<Session> {
    this.logger.info(`Creating session for ${this.name}`)
    
    try {
      const response = await this.connectionManager.executeWithConnection(
        this.name,
        async (connection) => {
          return await connection.post('/sessions/create', {
            shell: options?.shell || '/bin/bash',
            workingDir: options?.workingDir,
            env: options?.env,
          })
        }
      )
      
      const sessionId = response.data.id
      const session = new Session(sessionId, this, this.logger)
      session._activate()
      
      this.sessions.set(sessionId, session)
      
      this.logger.info(`Created session ${sessionId}`)
      
      return session
      
    } catch (error) {
      throw new DevboxError(
        'SESSION_CREATE_FAILED',
        `Failed to create session: ${error.message}`,
        { cause: error }
      )
    }
  }
  
  /**
   * 获取已有的 Session
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }
  
  /**
   * 列出所有活跃的 Sessions
   */
  async listSessions(): Promise<Session[]> {
    try {
      const response = await this.connectionManager.executeWithConnection(
        this.name,
        async (connection) => {
          return await connection.get('/sessions')
        }
      )
      
      return response.data.sessions || []
      
    } catch (error) {
      throw new DevboxError(
        'SESSION_LIST_FAILED',
        `Failed to list sessions: ${error.message}`,
        { cause: error }
      )
    }
  }
  
  /**
   * 终止所有 Sessions（清理时使用）
   */
  async terminateAllSessions(): Promise<void> {
    const sessions = Array.from(this.sessions.values())
    
    await Promise.all(
      sessions.map(session => session.terminate().catch(err => {
        this.logger.warn(`Failed to terminate session ${session.getId()}: ${err.message}`)
      }))
    )
    
    this.sessions.clear()
  }
}
```

**验收标准**:
- ✅ Session 创建和终止
- ✅ 命令执行保持上下文
- ✅ 环境变量管理
- ✅ 错误处理和日志

---

### ✅ **Task 2: Transfer Engine 实现** (1 day)

Transfer Engine 提供**智能文件传输策略**，根据文件大小和类型自动选择最优传输方式。

#### 2.1 传输策略接口

**文件**: `packages/sdk/src/transfer/types.ts`

```typescript
export interface TransferStrategy {
  name: string
  maxFileSize?: number  // 最大支持文件大小（字节）
  
  /**
   * 判断是否适用此策略
   */
  canHandle(file: FileInfo): boolean
  
  /**
   * 执行文件传输
   */
  transfer(
    file: FileInfo,
    devboxName: string,
    options: TransferOptions
  ): Promise<TransferResult>
}

export interface FileInfo {
  path: string  // 目标路径
  content: Buffer | string
  size: number
  encoding?: BufferEncoding
}

export interface TransferOptions {
  createDirs?: boolean
  overwrite?: boolean
  onProgress?: (progress: TransferProgress) => void
}

export interface TransferProgress {
  file: string
  transferred: number
  total: number
  percentage: number
}

export interface TransferResult {
  success: boolean
  path: string
  bytesTransferred: number
  duration: number
  strategy: string
  error?: string
}
```

#### 2.2 实现传输策略

**文件**: `packages/sdk/src/transfer/strategies/inline.ts`

```typescript
import type { TransferStrategy, FileInfo, TransferOptions, TransferResult } from '../types'
import { DevboxError } from '../../utils/error'

/**
 * 内联传输策略 - 适合小文件（< 1MB）
 * 直接通过 API 传输 base64 编码的内容
 */
export class InlineStrategy implements TransferStrategy {
  name = 'inline'
  maxFileSize = 1024 * 1024  // 1MB
  
  constructor(
    private connectionManager: ConnectionManager
  ) {}
  
  canHandle(file: FileInfo): boolean {
    return file.size <= this.maxFileSize
  }
  
  async transfer(
    file: FileInfo,
    devboxName: string,
    options: TransferOptions
  ): Promise<TransferResult> {
    const startTime = Date.now()
    
    try {
      // 转换为 base64
      const content = Buffer.isBuffer(file.content)
        ? file.content.toString('base64')
        : Buffer.from(file.content, file.encoding || 'utf-8').toString('base64')
      
      // 调用 Bun Server API
      await this.connectionManager.executeWithConnection(
        devboxName,
        async (connection) => {
          return await connection.post('/files/write', {
            path: file.path,
            content,
            createDirs: options.createDirs ?? true,
          })
        }
      )
      
      // 报告进度
      if (options.onProgress) {
        options.onProgress({
          file: file.path,
          transferred: file.size,
          total: file.size,
          percentage: 100,
        })
      }
      
      return {
        success: true,
        path: file.path,
        bytesTransferred: file.size,
        duration: Date.now() - startTime,
        strategy: this.name,
      }
      
    } catch (error) {
      return {
        success: false,
        path: file.path,
        bytesTransferred: 0,
        duration: Date.now() - startTime,
        strategy: this.name,
        error: error.message,
      }
    }
  }
}
```

**文件**: `packages/sdk/src/transfer/strategies/chunked.ts`

```typescript
/**
 * 分块传输策略 - 适合大文件（1MB - 100MB）
 * 将文件分块传输，支持进度报告
 */
export class ChunkedStrategy implements TransferStrategy {
  name = 'chunked'
  maxFileSize = 100 * 1024 * 1024  // 100MB
  private chunkSize = 512 * 1024  // 512KB per chunk
  
  constructor(
    private connectionManager: ConnectionManager
  ) {}
  
  canHandle(file: FileInfo): boolean {
    return file.size > 1024 * 1024 && file.size <= this.maxFileSize
  }
  
  async transfer(
    file: FileInfo,
    devboxName: string,
    options: TransferOptions
  ): Promise<TransferResult> {
    const startTime = Date.now()
    
    try {
      const buffer = Buffer.isBuffer(file.content)
        ? file.content
        : Buffer.from(file.content, file.encoding || 'utf-8')
      
      const totalChunks = Math.ceil(buffer.length / this.chunkSize)
      let transferred = 0
      
      // 分块传输
      for (let i = 0; i < totalChunks; i++) {
        const start = i * this.chunkSize
        const end = Math.min(start + this.chunkSize, buffer.length)
        const chunk = buffer.slice(start, end)
        const chunkBase64 = chunk.toString('base64')
        
        // 上传分块
        await this.connectionManager.executeWithConnection(
          devboxName,
          async (connection) => {
            return await connection.post('/files/append', {
              path: file.path,
              content: chunkBase64,
              createDirs: i === 0 ? (options.createDirs ?? true) : false,
            })
          }
        )
        
        transferred += chunk.length
        
        // 报告进度
        if (options.onProgress) {
          options.onProgress({
            file: file.path,
            transferred,
            total: buffer.length,
            percentage: Math.round((transferred / buffer.length) * 100),
          })
        }
      }
      
      return {
        success: true,
        path: file.path,
        bytesTransferred: transferred,
        duration: Date.now() - startTime,
        strategy: this.name,
      }
      
    } catch (error) {
      return {
        success: false,
        path: file.path,
        bytesTransferred: 0,
        duration: Date.now() - startTime,
        strategy: this.name,
        error: error.message,
      }
    }
  }
}
```

#### 2.3 Transfer Engine 主类

**文件**: `packages/sdk/src/transfer/engine.ts`

```typescript
import type { TransferStrategy, FileInfo, TransferOptions, TransferResult } from './types'
import { InlineStrategy } from './strategies/inline'
import { ChunkedStrategy } from './strategies/chunked'

export class TransferEngine {
  private strategies: TransferStrategy[]
  
  constructor(connectionManager: ConnectionManager) {
    this.strategies = [
      new InlineStrategy(connectionManager),
      new ChunkedStrategy(connectionManager),
    ]
  }
  
  /**
   * 选择合适的传输策略
   */
  private selectStrategy(file: FileInfo): TransferStrategy {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(file)) {
        return strategy
      }
    }
    
    throw new DevboxError(
      'NO_STRATEGY',
      `No transfer strategy available for file ${file.path} (${file.size} bytes)`
    )
  }
  
  /**
   * 传输单个文件
   */
  async transferFile(
    file: FileInfo,
    devboxName: string,
    options: TransferOptions = {}
  ): Promise<TransferResult> {
    const strategy = this.selectStrategy(file)
    return await strategy.transfer(file, devboxName, options)
  }
  
  /**
   * 批量传输文件
   */
  async transferFiles(
    files: FileInfo[],
    devboxName: string,
    options: TransferOptions = {}
  ): Promise<TransferResult[]> {
    const results: TransferResult[] = []
    
    for (const file of files) {
      const result = await this.transferFile(file, devboxName, options)
      results.push(result)
      
      if (!result.success) {
        // 可以选择继续或中断
        console.warn(`Failed to transfer ${file.path}: ${result.error}`)
      }
    }
    
    return results
  }
}
```

#### 2.4 在 DevboxInstance 中集成

**文件**: `packages/sdk/src/core/DevboxInstance.ts`

```typescript
/**
 * 上传多个文件（智能传输）
 */
async uploadFiles(
  files: Array<{ path: string; content: string | Buffer }>,
  options?: TransferOptions
): Promise<TransferResult[]> {
  const fileInfos: FileInfo[] = files.map(file => ({
    path: file.path,
    content: file.content,
    size: Buffer.isBuffer(file.content)
      ? file.content.length
      : Buffer.from(file.content).length,
  }))
  
  return await this.transferEngine.transferFiles(
    fileInfos,
    this.name,
    options
  )
}
```

**验收标准**:
- ✅ 小文件直接传输（< 1MB）
- ✅ 大文件分块传输（1MB - 100MB）
- ✅ 进度报告回调
- ✅ 错误处理和重试

---

### ✅ **Task 3: WebSocket 文件监控** (0.5 day)

实现实时文件监控，通过 WebSocket 接收文件变更事件。

#### 3.1 WebSocket 客户端

**文件**: `packages/sdk/src/core/FileWatcher.ts`

```typescript
import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { DevboxError } from '../utils/error'

export interface FileWatchEvent {
  type: 'create' | 'modify' | 'delete' | 'rename'
  path: string
  timestamp: number
  oldPath?: string  // for rename events
}

export class FileWatcher extends EventEmitter {
  private ws: WebSocket | null = null
  private isConnected: boolean = false
  private reconnectTimer?: NodeJS.Timeout
  
  constructor(
    private url: string,
    private path: string,
    private options: {
      recursive?: boolean
      reconnect?: boolean
      reconnectInterval?: number
    } = {}
  ) {
    super()
  }
  
  /**
   * 连接 WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.url}/files/watch?path=${encodeURIComponent(this.path)}&recursive=${this.options.recursive ?? true}`
      
      this.ws = new WebSocket(wsUrl)
      
      this.ws.on('open', () => {
        this.isConnected = true
        this.emit('connected')
        resolve()
      })
      
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const event: FileWatchEvent = JSON.parse(data.toString())
          this.emit('change', event)
        } catch (error) {
          this.emit('error', new DevboxError('PARSE_ERROR', 'Failed to parse watch event'))
        }
      })
      
      this.ws.on('close', () => {
        this.isConnected = false
        this.emit('disconnected')
        
        // 自动重连
        if (this.options.reconnect) {
          this.scheduleReconnect()
        }
      })
      
      this.ws.on('error', (error) => {
        this.emit('error', new DevboxError('WEBSOCKET_ERROR', error.message))
        reject(error)
      })
    })
  }
  
  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    
    const interval = this.options.reconnectInterval || 5000
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect().catch(() => {
        // 重连失败，继续尝试
        this.scheduleReconnect()
      })
    }, interval)
  }
  
  /**
   * 断开连接
   */
  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.isConnected = false
  }
  
  /**
   * 检查连接状态
   */
  isActive(): boolean {
    return this.isConnected
  }
}
```

#### 3.2 在 DevboxInstance 中添加监控方法

**文件**: `packages/sdk/src/core/DevboxInstance.ts`

```typescript
/**
 * 监控文件变更
 */
async watchFiles(
  path: string,
  callback: (event: FileWatchEvent) => void,
  options?: {
    recursive?: boolean
    reconnect?: boolean
  }
): Promise<FileWatcher> {
  // 获取 WebSocket URL
  const devboxInfo = await this.getInfo()
  const wsUrl = this.getWebSocketUrl(devboxInfo)
  
  // 创建 Watcher
  const watcher = new FileWatcher(wsUrl, path, options)
  
  // 监听事件
  watcher.on('change', callback)
  
  watcher.on('error', (error) => {
    this.logger.error(`File watch error: ${error.message}`)
  })
  
  // 连接
  await watcher.connect()
  
  return watcher
}

/**
 * 获取 WebSocket URL
 */
private getWebSocketUrl(devboxInfo: any): string {
  if (devboxInfo.ports && devboxInfo.ports.length > 0) {
    const httpUrl = devboxInfo.ports[0].publicAddress || devboxInfo.ports[0].privateAddress
    // 转换 http(s) -> ws(s)
    return httpUrl.replace(/^http/, 'ws')
  }
  
  throw new DevboxError('NO_WEBSOCKET_URL', 'No accessible WebSocket URL found')
}
```

**验收标准**:
- ✅ WebSocket 连接建立
- ✅ 接收文件变更事件
- ✅ 自动重连机制
- ✅ 错误处理

---

### ✅ **Task 4: 监控数据增强** (0.5 day)

增强监控数据的获取和处理。

#### 4.1 在 DevboxInstance 中添加监控方法

**文件**: `packages/sdk/src/core/DevboxInstance.ts`

```typescript
/**
 * 获取监控数据
 */
async getMonitorData(options?: {
  timeRange?: '1h' | '6h' | '24h' | { start: number; end: number }
  step?: string  // '1m', '5m', '1h'
}): Promise<Array<{
  timestamp: number
  readableTime: string
  cpu: number
  memory: number
}>> {
  let start: number
  let end: number = Date.now()
  
  // 处理时间范围
  if (options?.timeRange) {
    if (typeof options.timeRange === 'string') {
      const rangeMap = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      }
      start = end - rangeMap[options.timeRange]
    } else {
      start = options.timeRange.start
      end = options.timeRange.end
    }
  } else {
    start = end - 60 * 60 * 1000  // 默认 1 小时
  }
  
  const response = await this.apiClient.getMonitorData(this.name, {
    start,
    end,
    step: options?.step || '1m',
  })
  
  return response.data
}

/**
 * 获取当前资源使用情况
 */
async getCurrentUsage(): Promise<{
  cpu: number
  memory: number
  timestamp: number
}> {
  const data = await this.getMonitorData({
    timeRange: '1h',
    step: '1m',
  })
  
  if (data.length === 0) {
    throw new DevboxError('NO_MONITOR_DATA', 'No monitoring data available')
  }
  
  // 返回最新数据点
  const latest = data[data.length - 1]
  
  return {
    cpu: latest.cpu,
    memory: latest.memory,
    timestamp: latest.timestamp,
  }
}
```

**验收标准**:
- ✅ 监控数据查询
- ✅ 时间范围处理
- ✅ 当前使用情况获取

---

## Testing Checklist

### ✅ **单元测试**

```typescript
// Session 测试
describe('Session', () => {
  it('should create and execute commands', async () => {
    const session = await devbox.createSession()
    const result = await session.execute('echo "test"')
    expect(result.output).toContain('test')
  })
  
  it('should maintain context', async () => {
    const session = await devbox.createSession()
    await session.execute('cd /tmp')
    const result = await session.execute('pwd')
    expect(result.output).toContain('/tmp')
  })
})

// Transfer Engine 测试
describe('TransferEngine', () => {
  it('should select inline strategy for small files', () => {
    const file = { path: '/test.txt', content: 'small', size: 100 }
    const strategy = engine['selectStrategy'](file)
    expect(strategy.name).toBe('inline')
  })
  
  it('should transfer files with progress', async () => {
    let progress = 0
    await devbox.uploadFiles([{ path: '/test.txt', content: 'test' }], {
      onProgress: (p) => { progress = p.percentage }
    })
    expect(progress).toBe(100)
  })
})

// FileWatcher 测试
describe('FileWatcher', () => {
  it('should receive file change events', async () => {
    const events: FileWatchEvent[] = []
    const watcher = await devbox.watchFiles('/app', (event) => {
      events.push(event)
    })
    
    // 触发变更
    await devbox.writeFile('/app/test.txt', 'content')
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe('create')
  })
})
```

---

## Success Criteria

### ✅ **功能完整性**
- [ ] ✅ Session 管理完整实现
- [ ] ✅ Transfer Engine 智能传输
- [ ] ✅ WebSocket 文件监控工作
- [ ] ✅ 监控数据增强

### ✅ **代码质量**
- [ ] ✅ 完整的类型定义
- [ ] ✅ 错误处理和重试
- [ ] ✅ 单元测试覆盖率 ≥ 70%

### ✅ **性能**
- [ ] ✅ 大文件传输支持（≤ 100MB）
- [ ] ✅ 进度报告实时更新
- [ ] ✅ WebSocket 自动重连

---

## Next Steps

完成本任务后，进入：
- **Phase 3**: 示例代码和文档
- **Phase 4**: 测试和生产优化

---

**Estimated Completion**: 2-3 days  
**Dependencies**: Phase 1 completed  
**Blocks**: Phase 3 and Phase 4

