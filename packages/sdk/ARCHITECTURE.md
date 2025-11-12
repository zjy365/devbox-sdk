# Devbox SDK 项目架构和设计文档

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [SDK Core 核心功能详解](#3-sdk-core-核心功能详解)
4. [API 客户端模块](#4-api-客户端模块)
5. [HTTP 连接管理](#5-http-连接管理)
6. [其他核心模块](#6-其他核心模块)
7. [Shared 包](#7-shared-包)
8. [技术特性](#8-技术特性)

---

## 1. 项目概述

### 1.1 项目简介

Devbox SDK 是一个企业级 TypeScript SDK，用于管理 Sealos Devbox 实例。Devbox 是 Sealos 平台提供的云端开发环境容器，支持多种运行时环境（Node.js、Python、Go 等）。

该 SDK 提供了完整的 Devbox 生命周期管理、文件操作、命令执行、监控等功能，通过 HTTP API 与 Devbox 容器进行通信。

### 1.2 技术栈

- **语言**: TypeScript
- **运行时**: Node.js >= 22.0.0
- **构建工具**: tsup
- **包管理**: npm workspaces (monorepo)
- **测试框架**: Vitest
- **代码规范**: Biome
- **HTTP 客户端**: 基于 fetch API
- **WebSocket**: ws 库

### 1.3 项目结构

项目采用 monorepo 结构，使用 npm workspaces 管理多个包：

```
devbox-sdk/
├── packages/
│   ├── sdk/              # 主 SDK 包
│   │   ├── src/
│   │   │   ├── core/     # 核心功能模块
│   │   │   ├── api/      # API 客户端
│   │   │   ├── http/     # HTTP 连接管理
│   │   │   ├── utils/    # 工具函数
│   │   │   ├── monitoring/ # 性能监控
│   │   │   ├── security/   # 安全适配器
│   │   │   └── transfer/   # 文件传输引擎
│   │   ├── tests/        # 测试文件
│   │   └── dist/         # 构建输出
│   └── shared/           # 共享包
│       ├── src/
│       │   ├── types/    # 共享类型定义
│       │   ├── errors/   # 错误处理
│       │   └── logger/   # 日志系统
│       └── dist/         # 构建输出
├── README.md
└── ARCHITECTURE.md       # 本文档
```

---

## 2. 整体架构

### 2.1 架构概览

Devbox SDK 采用分层架构设计，主要分为以下几个层次：

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (Application)                    │
│              使用 DevboxSDK 和 DevboxInstance              │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│                   核心层 (Core)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  DevboxSDK   │  │DevboxInstance│  │  Constants   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│                 服务层 (Services)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  DevboxAPI   │  │UrlResolver   │  │  ErrorUtils  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│                 基础设施层 (Infrastructure)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ContainerClient│  │  HTTP Client │  │  WebSocket   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│                   外部服务                                  │
│  ┌──────────────┐              ┌──────────────┐         │
│  │ Sealos API   │              │ Devbox 容器   │         │
│  │  (REST API)  │              │  (HTTP API)  │         │
│  └──────────────┘              └──────────────┘         │
└──────────────────────────────────────────────────────────┘
```

### 2.2 核心组件关系

1. **DevboxSDK**: 主入口类，提供高级 API
2. **DevboxInstance**: Devbox 实例的封装，提供实例级别的操作
3. **DevboxAPI**: 与 Sealos Devbox API 通信的客户端
4. **ContainerUrlResolver**: 解析 Devbox 容器 URL 并管理连接执行
5. **DevboxContainerClient**: HTTP 客户端，用于与 Devbox 容器服务器通信
6. **Git**: Git 操作类，通过依赖注入集成到 DevboxInstance

### 2.3 数据流

#### 创建 Devbox 流程

```
用户代码
  ↓
DevboxSDK.createDevbox()
  ↓
DevboxAPI.createDevbox() → Sealos API
  ↓
返回 DevboxInfo
  ↓
创建 DevboxInstance 对象
  ↓
返回给用户
```

#### 文件操作流程

```
用户代码
  ↓
DevboxInstance.writeFile()
  ↓
ContainerUrlResolver.executeWithConnection()
  ↓
ContainerUrlResolver.getServerUrl() → 解析 URL（带缓存）
  ↓
创建 DevboxContainerClient 实例
  ↓
DevboxContainerClient.post() → Devbox 容器 HTTP API
  ↓
返回结果
```

---

## 3. SDK Core 核心功能详解

### 3.1 DevboxSDK 主类

`DevboxSDK` 是 SDK 的管理类，负责 Devbox 实例的生命周期管理。

#### 3.1.1 功能概述

`DevboxSDK` 类**只负责**：
- Devbox 实例的创建、获取、列表查询（生命周期管理）
- 监控数据获取（通过 API，不涉及实例操作）
- 资源管理和清理
- 提供内部访问器（getAPIClient, getConnectionManager）

**注意**：`DevboxSDK` **不包含**文件操作、命令执行等实例级别的操作。这些操作应该在 `DevboxInstance` 中进行。

#### 3.1.2 初始化

```typescript
constructor(config: DevboxSDKConfig)
```

配置项包括：
- `kubeconfig`: Kubernetes 配置（实际是 token），用于认证
- `baseUrl`: Devbox API 基础 URL（可选，默认：`https://devbox.usw.sealos.io/v1`）
- `mockServerUrl`: 模拟服务器 URL（用于测试，优先级最高）
- `devboxServerUrl`: Devbox 服务器 URL（用于开发，优先级最高）
- `http`: HTTP 客户端配置（timeout、retries、rejectUnauthorized）

#### 3.1.3 Devbox 管理方法

**创建 Devbox**
```typescript
async createDevbox(config: DevboxCreateConfig): Promise<DevboxInstance>
```
- 通过 Sealos API 创建新的 Devbox 实例
- 返回 `DevboxInstance` 对象

**获取 Devbox**
```typescript
async getDevbox(name: string): Promise<DevboxInstance>
```
- 根据名称获取已存在的 Devbox 实例
- 返回 `DevboxInstance` 对象

**列表查询**
```typescript
async listDevboxes(): Promise<DevboxInstance[]>
```
- 获取所有 Devbox 实例列表
- 返回 `DevboxInstance` 数组

#### 3.1.4 监控数据

```typescript
async getMonitorData(
  devboxName: string,
  timeRange?: TimeRange
): Promise<MonitorData[]>
```
- 获取 Devbox 实例的监控数据
- 包括 CPU、内存、网络、磁盘使用情况
- 支持时间范围查询

#### 3.1.5 资源管理

```typescript
async close(): Promise<void>
```
- 清理缓存和资源
- 防止内存泄漏

**访问器方法**
```typescript
getAPIClient(): DevboxAPI  // 获取 API 客户端
getUrlResolver(): ContainerUrlResolver  // 获取 URL 解析器
```

### 3.2 DevboxInstance 实例类

`DevboxInstance` 封装了单个 Devbox 实例的所有操作，是实例级别的 API 入口。

#### 3.2.1 功能概述

`DevboxInstance` 类负责**所有实例级别的操作**：
- Devbox 实例的生命周期管理（start, pause, restart, shutdown, delete）
- **所有文件操作**（writeFile, readFile, uploadFiles, deleteFile, listFiles, watchFiles）
- 命令执行（executeCommand, getProcessStatus）
- 健康检查和状态查询（isHealthy, waitForReady）
- 监控数据获取（getMonitorData）

**设计原则**：
- `DevboxInstance` 直接使用 `ConnectionManager` 执行 HTTP 调用
- 所有文件操作都包含路径验证，防止目录遍历攻击
- 不需要传入 `devboxName` 参数，因为已经绑定到实例

#### 3.2.2 属性访问器

```typescript
get name(): string           // Devbox 名称
get status(): string         // 当前状态
get runtime(): DevboxRuntime // 运行时环境
get resources(): ResourceInfo // 资源信息
get serverUrl(): string      // 服务器 URL
```

#### 3.2.3 生命周期管理

**启动**
```typescript
async start(): Promise<void>
```
- 启动 Devbox 实例
- 自动刷新实例信息

**暂停**
```typescript
async pause(): Promise<void>
```
- 暂停 Devbox 实例

**重启**
```typescript
async restart(): Promise<void>
```
- 重启 Devbox 实例

**关闭**
```typescript
async shutdown(): Promise<void>
```
- 关闭 Devbox 实例

**删除**
```typescript
async delete(): Promise<void>
```
- 删除 Devbox 实例

**刷新信息**
```typescript
async refreshInfo(): Promise<void>
```
- 从 API 刷新实例信息

#### 3.2.4 文件操作（实例级别）

所有文件操作方法都包含路径验证，防止目录遍历攻击：

**基础文件操作**
- `writeFile(path, content, options?)`: 写入文件
  - 支持字符串和 Buffer
  - 支持 base64 编码选项
  - 自动选择 JSON 模式或二进制模式
- `readFile(path, options?)`: 读取文件
  - 返回 Buffer
  - 支持编码选项（utf-8、base64）
- `deleteFile(path)`: 删除文件
- `listFiles(path)`: 列出目录内容

**高级文件操作**
- `uploadFiles(files, options?)`: 批量上传文件
  - 支持 FileMap（路径到内容的映射）
  - 自动计算公共目录前缀
  - 支持 targetDir 选项
- `moveFile(source, destination, overwrite?)`: 移动文件
- `renameFile(oldPath, newPath)`: 重命名文件或目录
- `downloadFile(paths, options?)`: 下载文件
  - 支持单个或多个文件路径
  - 支持多种格式：tar.gz、tar、multipart、direct
- `getPorts()`: 获取监听端口列表（3000-9999 范围）
- `watchFiles(path, callback)`: 监听文件变化（WebSocket）

#### 3.2.5 命令执行和进程管理

**异步执行**
```typescript
async executeCommand(options: ProcessExecOptions): Promise<ProcessExecResponse>
```
- 异步执行命令，立即返回进程 ID
- 返回 `processId` 和 `pid`，可用于后续查询

**同步执行**
```typescript
async execSync(options: ProcessExecOptions): Promise<SyncExecutionResponse>
```
- 同步执行命令，等待完成
- 返回 stdout、stderr、exitCode、执行时间等

**代码执行**
```typescript
async codeRun(code: string, options?: CodeRunOptions): Promise<SyncExecutionResponse>
```
- 直接执行代码字符串（Node.js 或 Python）
- 自动检测语言类型
- 支持命令行参数

**流式执行**
```typescript
async execSyncStream(options: ProcessExecOptions): Promise<ReadableStream>
```
- 同步执行并返回 Server-Sent Events (SSE) 流
- 实时获取输出

**进程管理**
```typescript
async listProcesses(): Promise<ListProcessesResponse>  // 列出所有进程
async getProcessStatus(processId: string): Promise<GetProcessStatusResponse>  // 获取进程状态
async killProcess(processId: string, options?: KillProcessOptions): Promise<void>  // 终止进程
async getProcessLogs(processId: string, stream?: boolean): Promise<GetProcessLogsResponse>  // 获取进程日志
```

#### 3.2.6 健康检查

**检查健康状态**
```typescript
async isHealthy(): Promise<boolean>
```
- 检查 Devbox 是否健康
- 通过 HTTP /health 端点检查

**等待就绪**
```typescript
async waitForReady(
  timeout?: number,
  checkInterval?: number
): Promise<void>
```
- 等待 Devbox 进入就绪状态
- 默认超时 5 分钟
- 默认检查间隔 2 秒
- 检查状态和健康状态

#### 3.2.7 Git 操作

`DevboxInstance` 提供了 `git` 属性，用于执行 Git 仓库操作：

```typescript
const instance = await sdk.getDevbox('my-devbox')
await instance.git.clone({ url: 'https://github.com/user/repo.git' })
await instance.git.pull('./repo')
await instance.git.push('./repo')
```

**Git 方法**
- `clone(options)`: 克隆仓库
- `pull(repoPath, options?)`: 拉取更新
- `push(repoPath, options?)`: 推送更改
- `branches(repoPath)`: 列出所有分支
- `createBranch(repoPath, branchName, checkout?)`: 创建分支
- `deleteBranch(repoPath, branchName, force?, remote?)`: 删除分支
- `checkoutBranch(repoPath, branchName, create?)`: 切换分支
- `add(repoPath, files?)`: 暂存文件
- `commit(repoPath, options)`: 提交更改
- `status(repoPath)`: 获取仓库状态

**认证支持**
- 支持 token、username/password 认证
- 自动设置 Git 环境变量

#### 3.2.8 路径验证

```typescript
private validatePath(path: string): void
```
- 验证文件路径，防止目录遍历攻击
- 检查空路径
- 检查 `../` 和 `..\\` 模式
- 验证绝对路径

### 3.3 常量定义（constants.ts）

常量模块定义了 SDK 使用的所有常量。

#### 3.3.1 默认配置

```typescript
DEFAULT_CONFIG = {
  BASE_URL: 'https://devbox.usw.sealos.io/v1',
  CONTAINER_HTTP_PORT: 3000,
  MOCK_SERVER: { ... },
  HTTP_CLIENT: {
    TIMEOUT: 30000,
    RETRIES: 3,
  },
  FILE_LIMITS: {
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    MAX_BATCH_SIZE: 50,
    CHUNK_SIZE: 1024 * 1024, // 1MB
  },
  PERFORMANCE: { ... },
}
```

#### 3.3.2 API 端点

定义了所有 API 端点的路径：
- Devbox 管理端点（创建、获取、列表、更新、删除、启动、暂停、重启、关闭）
- 监控端点
- 模板端点
- 端口配置端点
- 容器 HTTP 服务器端点（文件操作、进程执行、WebSocket）

#### 3.3.3 错误代码

定义了标准化的错误代码：
- 认证错误：`AUTHENTICATION_FAILED`、`INVALID_KUBECONFIG`
- 连接错误：`CONNECTION_FAILED`、`CONNECTION_TIMEOUT`
- Devbox 错误：`DEVBOX_NOT_FOUND`、`DEVBOX_CREATION_FAILED`、`DEVBOX_OPERATION_FAILED`
- 文件操作错误：`FILE_NOT_FOUND`、`FILE_TOO_LARGE`、`FILE_TRANSFER_FAILED`、`PATH_TRAVERSAL_DETECTED`
- 服务器错误：`SERVER_UNAVAILABLE`、`HEALTH_CHECK_FAILED`
- 通用错误：`OPERATION_TIMEOUT`、`VALIDATION_ERROR`、`INTERNAL_ERROR`

#### 3.3.4 HTTP 状态码

定义了常用的 HTTP 状态码常量。

### 3.4 类型系统（types.ts）

类型系统提供了完整的 TypeScript 类型定义。

#### 3.4.1 配置接口

**DevboxSDKConfig**
```typescript
interface DevboxSDKConfig {
  kubeconfig: string
  baseUrl?: string
  mockServerUrl?: string
  devboxServerUrl?: string
  http?: HttpClientConfig
}
```

**DevboxCreateConfig**
```typescript
interface DevboxCreateConfig {
  name: string
  runtime: DevboxRuntime
  resource: ResourceInfo
  ports?: PortConfig[]
  env?: Record<string, string>
}
```

#### 3.4.2 核心类型

**DevboxInfo**
```typescript
interface DevboxInfo {
  name: string
  status: string
  runtime: DevboxRuntime
  resources: ResourceInfo
  podIP?: string
  ssh?: SSHInfo
  ports?: PortConfig[]
}
```

**ResourceInfo**
```typescript
interface ResourceInfo {
  cpu: number
  memory: number
}
```

**PortConfig**
```typescript
interface PortConfig {
  number: number
  protocol: string
  portName?: string
  serviceName?: string
  privateAddress?: string
  privateHost?: string
  networkName?: string
  publicHost?: string
  publicAddress?: string
  customDomain?: string
}
```

#### 3.4.3 文件操作类型

**FileMap**: 文件映射，键为路径，值为 Buffer 或字符串

**WriteOptions**: 写入选项（encoding、mode、createDirs）

**ReadOptions**: 读取选项（encoding、offset、length）

**BatchUploadOptions**: 批量上传选项（concurrency、chunkSize、onProgress、targetDir）

**TransferResult**: 传输结果（success、results、totalFiles、successCount）

**MoveFileResponse**: 移动文件响应（success、source、destination）

**RenameFileResponse**: 重命名文件响应（success、oldPath、newPath）

**DownloadFileOptions**: 下载文件选项（paths、format）

**PortsResponse**: 端口响应（success、ports、lastUpdatedAt）

#### 3.4.4 监控和进程类型

**MonitorData**: 监控数据（CPU、内存、网络、磁盘、时间戳）

**ProcessExecOptions**: 进程执行选项（command、args、cwd、env、shell、timeout）

**ProcessExecResponse**: 异步执行响应（success、processId、pid、status、exitCode）

**SyncExecutionResponse**: 同步执行响应（success、stdout、stderr、exitCode、durationMs、startTime、endTime）

**CodeRunOptions**: 代码执行选项（language、argv、env、cwd、timeout）

**ListProcessesResponse**: 进程列表响应（success、processes）

**GetProcessStatusResponse**: 进程状态响应（success、processId、pid、status、startedAt）

**GetProcessLogsResponse**: 进程日志响应（success、processId、logs）

**KillProcessOptions**: 终止进程选项（signal）

#### 3.4.5 Git 操作类型

**GitAuth**: Git 认证选项（username、password、token、sshKey）

**GitCloneOptions**: Git 克隆选项（url、targetDir、branch、commit、depth、auth）

**GitPullOptions**: Git 拉取选项（remote、branch、auth）

**GitPushOptions**: Git 推送选项（remote、branch、auth、force）

**GitBranchInfo**: Git 分支信息（name、isCurrent、isRemote、commit、ahead、behind）

**GitStatus**: Git 仓库状态（currentBranch、isClean、ahead、behind、staged、modified、untracked、deleted）

**Git Commit API**: `commit(repoPath, message, author, email, allowEmpty?)` - 提交更改，author 和 email 为必需参数

**Legacy Types**（向后兼容）:
- **CommandResult**: 旧版命令执行结果
- **ProcessStatus**: 旧版进程状态

---

## 4. API 客户端模块

### 4.1 DevboxAPI 类

`DevboxAPI` 类负责与 Sealos Devbox REST API 通信。

#### 4.1.1 功能概述

- 封装所有 Sealos API 调用
- 处理认证和授权
- 转换 API 响应为 SDK 内部类型
- 错误处理和重试

#### 4.1.2 核心方法

**Devbox 管理**
- `createDevbox(config)`: 创建 Devbox
- `getDevbox(name)`: 获取 Devbox 详情
- `listDevboxes()`: 列出所有 Devbox
- `startDevbox(name)`: 启动 Devbox
- `pauseDevbox(name)`: 暂停 Devbox
- `restartDevbox(name)`: 重启 Devbox
- `shutdownDevbox(name)`: 关闭 Devbox
- `deleteDevbox(name)`: 删除 Devbox
- `updateDevbox(name, config)`: 更新 Devbox 配置

**其他功能**
- `getMonitorData(name, timeRange?)`: 获取监控数据
- `getTemplates()`: 获取运行时模板
- `updatePorts(name, ports)`: 更新端口配置
- `configureAutostart(name, config?)`: 配置自动启动
- `listReleases(name)`: 列出发布版本
- `createRelease(name, config)`: 创建发布版本
- `deleteRelease(name, tag)`: 删除发布版本
- `deployRelease(name, tag)`: 部署发布版本

#### 4.1.3 数据转换

API 类包含多个私有方法用于转换 API 响应：

- `transformCreateResponseToDevboxInfo()`: 转换创建响应
- `transformDetailToDevboxInfo()`: 转换详情响应
- `transformListItemToDevboxInfo()`: 转换列表项
- `transformMonitorData()`: 转换监控数据
- `stringToRuntime()`: 安全转换运行时字符串

### 4.2 认证机制

#### 4.2.1 KubeconfigAuthenticator

```typescript
class KubeconfigAuthenticator {
  constructor(kubeconfig: string)
  getAuthHeaders(): Record<string, string>
}
```

- 接收 kubeconfig 字符串（实际是 token）
- 生成认证头（Authorization 和 Content-Type）
- 验证 kubeconfig 格式

### 4.3 API 端点管理

`APIEndpoints` 类管理所有 API 端点路径，提供类型安全的方法来构建端点 URL。

### 4.4 错误处理

- 统一错误处理机制
- HTTP 状态码到错误代码的映射
- 错误上下文信息
- 重试逻辑（指数退避）

---

## 5. HTTP 连接管理

### 5.1 ContainerUrlResolver URL 解析器

`ContainerUrlResolver` 负责解析 Devbox 容器的服务器 URL，并提供连接执行能力。

#### 5.1.1 功能概述

- 解析 Devbox 服务器 URL
- 缓存 Devbox 信息和 URL（60 秒 TTL）
- 执行连接操作
- 健康检查

#### 5.1.2 核心方法

**执行操作**
```typescript
async executeWithConnection<T>(
  devboxName: string,
  operation: (client: DevboxContainerClient) => Promise<T>
): Promise<T>
```
- 获取服务器 URL 并创建客户端
- 执行操作并自动处理错误
- 每次操作创建新的客户端实例（无连接池）

**获取服务器 URL**
```typescript
async getServerUrl(devboxName: string): Promise<string>
```
- 从 Devbox 信息中提取服务器 URL
- 优先使用 `ports[0].publicAddress`，其次 `ports[0].privateAddress`，最后 `podIP:3000`
- 支持缓存（60 秒 TTL）
- 支持 `mockServerUrl` 和 `devboxServerUrl` 配置（优先级最高）

**健康检查**
```typescript
async checkDevboxHealth(devboxName: string): Promise<boolean>
```
- 检查 Devbox 健康状态
- 通过 `/health` 端点检查
- 返回 `status === 'healthy'`

#### 5.1.3 缓存机制

- Devbox 信息缓存（60 秒 TTL）
- 服务器 URL 缓存（60 秒 TTL）
- 自动过期清理
- 支持手动清理缓存：`clearCache()`

#### 5.1.4 URL 解析优先级

1. **配置的 URL**（最高优先级）：
   - `mockServerUrl`（用于测试）
   - `devboxServerUrl`（用于开发）

2. **从 Devbox 信息提取**：
   - `ports[0].publicAddress`（公共地址）
   - `ports[0].privateAddress`（私有地址）
   - `http://${podIP}:3000`（Pod IP + 默认端口）

### 5.2 DevboxContainerClient HTTP 客户端

`DevboxContainerClient` 是实际的 HTTP 客户端实现，基于 fetch API，用于与 Devbox 容器服务器通信。

#### 5.2.1 功能特性

- 支持 GET、POST、PUT、DELETE 方法
- 支持 JSON、FormData 和二进制数据
- 超时控制（默认 30 秒）
- 错误处理和转换
- 自动设置 Authorization header

#### 5.2.2 核心方法

```typescript
async get<T>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>>
async post<T>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>>
async put<T>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>>
async delete<T>(path: string, options?: RequestOptions): Promise<HTTPResponse<T>>
```

#### 5.2.3 请求选项

```typescript
interface RequestOptions {
  params?: Record<string, any>  // URL 查询参数
  headers?: Record<string, string>  // 自定义请求头
  body?: any  // 请求体（支持 JSON、FormData、Buffer、字符串）
  signal?: AbortSignal  // 取消信号
}
```

#### 5.2.4 数据格式支持

- **JSON**: 自动序列化/反序列化
- **FormData**: 支持浏览器和 Node.js FormData
- **二进制数据**: 支持 Buffer、ArrayBuffer、Uint8Array
- **文本**: 支持字符串

#### 5.2.5 响应格式

```typescript
interface HTTPResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
  url: string
}
```

#### 5.2.6 设计说明

**注意**：当前实现采用**每次操作创建新客户端**的方式，而不是连接池模式。这样设计的好处是：
- 简化实现，避免连接状态管理复杂性
- 利用 HTTP/1.1 keep-alive 和现代浏览器的连接复用
- 减少内存占用和状态同步问题
- 适合大多数使用场景的性能需求

---

## 6. 其他核心模块

### 6.1 错误处理系统

#### 6.1.1 错误类层次

```typescript
DevboxSDKError (基类)
  ├── AuthenticationError
  ├── ConnectionError
  ├── FileOperationError
  ├── DevboxNotFoundError
  └── ValidationError
```

#### 6.1.2 错误特性

- 错误代码：标准化的错误代码
- 错误上下文：详细的错误信息
- 原始错误：保留原始错误对象
- 错误消息：友好的错误消息

### 6.2 性能监控（MetricsCollector）

#### 6.2.1 功能概述

`MetricsCollector` 类收集和跟踪 SDK 性能指标。

#### 6.2.2 收集的指标

- 连接统计：创建数、活跃数
- 文件传输：文件数、字节数
- 错误统计：错误数、错误类型
- 请求统计：总数、成功数、失败数
- 操作统计：操作数、延迟（min、max、avg、p50、p95、p99）

#### 6.2.3 使用方式

**手动记录**
```typescript
metrics.recordOperation(name, durationMs)
metrics.recordTransfer(size, latency)
metrics.recordError(errorType)
```

**装饰器**
```typescript
@monitored('operation_name')
async myMethod() { ... }
```

**追踪器**
```typescript
const tracker = track('operation_name')
// ... 执行操作
tracker.success() // 或 tracker.failure()
```

### 6.3 安全适配器

#### 6.3.1 SecurityAdapter

提供企业级安全功能：

- **路径验证**: 防止目录遍历攻击
- **输入清理**: 清理用户输入
- **权限验证**: 验证用户权限

#### 6.3.2 安全特性

- 路径规范化
- 目录遍历检测
- 输入验证和清理

### 6.4 文件传输引擎

#### 6.4.1 TransferEngine

`TransferEngine` 提供可扩展的文件传输策略系统。

#### 6.4.2 设计模式

- 策略模式：支持多种传输策略
- 可扩展：可以添加自定义策略
- 自动选择：根据文件特征自动选择最佳策略

#### 6.4.3 传输策略接口

```typescript
interface TransferStrategy {
  name: string
  canHandle(files: FileMap): boolean
  transfer(files: FileMap, onProgress?): Promise<TransferResult>
}
```

---

## 7. Shared 包

`@sealos/devbox-shared` 包提供 SDK 和服务器之间共享的类型、错误处理和日志功能。

### 7.1 共享类型定义

#### 7.1.1 文件操作类型

- `FileEncoding`: 文件编码类型
- `FileMetadata`: 文件元数据
- `WriteFileRequest/Response`: 写入文件请求/响应
- `ReadFileRequest/Response`: 读取文件请求/响应
- `ListFilesRequest/Response`: 列出文件请求/响应
- `DeleteFileRequest/Response`: 删除文件请求/响应
- `BatchUploadRequest/Response`: 批量上传请求/响应
- `FileWatchEvent`: 文件监听事件

#### 7.1.2 进程执行类型

- `ProcessStatus`: 进程状态
- `ProcessExecRequest/Response`: 执行命令请求/响应
- `ProcessInfo`: 进程信息
- `ProcessLogsRequest/Response`: 进程日志请求/响应

#### 7.1.3 会话管理类型

- `SessionState`: 会话状态
- `SessionInfo`: 会话信息
- `CreateSessionRequest/Response`: 创建会话请求/响应
- `ListSessionsResponse`: 列出会话响应

#### 7.1.4 Devbox 生命周期类型

- `DevboxRuntime`: 运行时枚举
- `DevboxState`: 状态枚举
- `ResourceConfig`: 资源配置
- `PortConfig`: 端口配置
- `DevboxInfo`: Devbox 信息
- 各种请求/响应类型

### 7.2 错误系统

#### 7.2.1 错误代码

定义了标准化的错误代码系统，包括：
- 文件操作错误
- 进程执行错误
- 连接错误
- 认证错误
- 会话错误
- Devbox 错误
- 验证错误

#### 7.2.2 错误上下文

不同类型的错误上下文：
- `FileErrorContext`: 文件操作错误上下文
- `ProcessErrorContext`: 进程执行错误上下文
- `ConnectionErrorContext`: 连接错误上下文
- `AuthErrorContext`: 认证错误上下文
- `SessionErrorContext`: 会话错误上下文
- `DevboxErrorContext`: Devbox 错误上下文
- `ValidationErrorContext`: 验证错误上下文

#### 7.2.3 错误响应

- `ErrorResponse`: 标准错误响应格式
- `DevboxError`: 错误类
- `createErrorResponse()`: 创建错误响应
- `isDevboxError()`: 检查是否为 Devbox 错误
- `toDevboxError()`: 转换为 Devbox 错误

### 7.3 日志系统

提供统一的日志接口，支持：
- 日志级别（debug、info、warn、error）
- 结构化日志
- 追踪 ID 支持

---

## 8. 技术特性

### 8.1 URL 解析和缓存

#### 8.1.1 URL 解析策略

- 优先级：配置 URL > publicAddress > privateAddress > podIP:3000
- 支持测试和开发环境配置（mockServerUrl、devboxServerUrl）
- 自动提取端口信息

#### 8.1.2 缓存机制

- Devbox 信息缓存：60 秒 TTL
- 服务器 URL 缓存：60 秒 TTL
- 自动过期清理
- 支持手动清理缓存

#### 8.1.3 客户端创建

- 每次操作创建新的客户端实例
- 利用 HTTP/1.1 keep-alive 和浏览器连接复用
- 简化状态管理，避免连接池复杂性

### 8.2 错误重试机制

#### 8.2.1 重试策略

- 默认重试次数：3
- 指数退避：2^attempt * 1000ms
- 可重试错误：
  - `CONNECTION_TIMEOUT`
  - `CONNECTION_FAILED`
  - `SERVER_UNAVAILABLE`
  - `SERVICE_UNAVAILABLE`
  - AbortError
  - fetch 错误

#### 8.2.2 超时控制

- HTTP 请求超时：30 秒（默认）
- 连接超时：30 秒（默认）
- 可配置超时时间

### 8.3 性能优化

#### 8.3.1 缓存机制

- Devbox 信息缓存：60 秒 TTL
- 服务器 URL 缓存：60 秒 TTL
- 自动过期清理

#### 8.3.2 文件传输优化

- 批量上传：支持多文件同时上传
- 块大小：1MB（可配置）
- 最大文件大小：100MB
- 最大批量大小：50 个文件

#### 8.3.3 性能目标

- 小文件延迟：<50ms（<1MB）
- 大文件吞吐量：>15MB/s
- URL 解析缓存命中率：>95%
- 服务器启动时间：<100ms

### 8.4 安全性考虑

#### 8.4.1 路径验证

- 防止目录遍历攻击
- 验证空路径
- 检查 `../` 模式
- 验证绝对路径

#### 8.4.2 输入验证

- 输入清理和验证
- 类型检查
- 范围验证

#### 8.4.3 认证和授权

- Kubeconfig 认证
- Token 传递
- HTTPS 支持（可配置拒绝未授权证书）

### 8.5 最佳实践

#### 8.5.1 使用建议

1. **连接管理**
   - 使用 `DevboxInstance` 进行实例级别操作
   - 及时调用 `close()` 清理资源
   - 复用 SDK 实例
   - URL 解析会自动缓存，无需手动管理

2. **错误处理**
   - 使用 try-catch 捕获错误
   - 检查错误代码进行不同处理
   - 记录错误上下文

3. **性能优化**
   - 使用批量上传处理多个文件
   - URL 解析和 Devbox 信息会自动缓存（60 秒 TTL）
   - 利用 HTTP keep-alive 实现连接复用（浏览器/Node.js 自动处理）

4. **监控和调试**
   - 启用日志记录
   - 使用 `getDetailedInfo()` 获取实例详细信息
   - 使用 `getMonitorData()` 监控资源使用情况
   - 检查健康状态：`isHealthy()` 和 `waitForReady()`

#### 8.5.2 配置建议

```typescript
const sdk = new DevboxSDK({
  kubeconfig: process.env.KUBECONFIG,
  baseUrl: 'https://devbox.usw.sealos.io/v1',
  // 可选：用于测试的模拟服务器 URL
  mockServerUrl: process.env.MOCK_SERVER_URL,
  // 可选：用于开发的 Devbox 服务器 URL
  devboxServerUrl: process.env.DEVBOX_SERVER_URL,
  http: {
    timeout: 30000,
    retries: 3,
    rejectUnauthorized: true, // 生产环境应为 true
  },
})
```

#### 8.5.3 测试建议

- 使用 `mockServerUrl` 进行单元测试
- 使用 `devboxServerUrl` 进行集成测试
- 测试错误处理和重试逻辑
- 测试 URL 解析和缓存机制
- 测试 Git 操作和文件操作

---

## 总结

Devbox SDK 是一个功能完整、设计良好的企业级 SDK，提供了：

1. **完整的 Devbox 生命周期管理**
2. **高效的文件操作和传输**（包括批量上传、下载、移动、重命名等）
3. **强大的进程管理**（异步/同步执行、代码执行、流式输出、进程监控）
4. **Git 操作支持**（克隆、拉取、推送、分支管理等）
5. **智能的 URL 解析和缓存机制**
6. **完善的错误处理和重试机制**
7. **丰富的监控和健康检查功能**
8. **强大的 TypeScript 类型系统**
9. **良好的安全特性**（路径验证、输入清理）

通过分层架构、模块化设计和最佳实践，SDK 提供了高性能、高可靠性和易用性的开发体验。

