# Devbox SDK Architecture - Comprehensive Analysis

## Executive Summary

The Devbox SDK is a monorepo project implementing an enterprise-grade TypeScript SDK for managing Sealos Devbox containers. It follows a modern microservices-inspired architecture with:

- **Two main packages**: A Node.js-based SDK client (`@sealos/devbox-sdk`) and a Bun-based HTTP server (`@sealos/devbox-server`)
- **Modern tooling**: Turbo for monorepo management, tsup for bundling, Vitest for testing
- **Enterprise features**: Connection pooling, security, monitoring, error handling
- **Full TypeScript support** with strict type checking

---

## 1. OVERALL PROJECT STRUCTURE

```
devbox-sdk/
├── packages/
│   ├── sdk/              # TypeScript SDK (Node.js runtime)
│   │   ├── src/
│   │   ├── __tests__/    # Unit, integration, E2E tests
│   │   └── dist/         # Built output (ES modules & CommonJS)
│   └── server/           # HTTP Server (Bun runtime)
│       ├── src/
│       └── Dockerfile
├── plans/                # Design specifications
├── tasks/                # Task documentation
├── turbo.json            # Monorepo build configuration
├── package.json          # Root workspace definition
└── tsconfig.json         # TypeScript configuration

Workspaces: npm workspaces
Build System: Turbo with task caching
Runtime Targets: Node.js ≥22.0.0 (SDK), Bun ≥1.0.0 (Server)
```

### Key Technologies:
- **TypeScript 5.5.3** - Full type safety
- **Biome 1.8.3** - Code linting and formatting
- **Turbo 2.5.8** - Build orchestration
- **tsup 8.0.0** - Fast TypeScript bundling
- **Vitest 3.2.4** - Unit testing
- **Bun Runtime** - Server runtime (ultra-fast JS runtime)

---

## 2. PACKAGE: @sealos/devbox-sdk

### 2.1 Purpose & Scope
Client-side SDK providing high-level APIs to manage Devbox instances running in Kubernetes. Exposes:
- Devbox lifecycle operations (create, start, pause, restart, delete)
- File operations (read, write, batch upload)
- Process execution
- Real-time file watching via WebSocket
- Connection pooling with health checks
- Monitoring data collection

### 2.2 Directory Structure & Components

```
src/
├── core/
│   ├── DevboxSDK.ts           # Main SDK class - orchestrates all operations
│   ├── DevboxInstance.ts      # Per-instance wrapper providing convenience methods
│   ├── types.ts               # Core type definitions
│   └── constants.ts           # Global constants, default configs, error codes
│
├── api/
│   ├── client.ts              # REST API client for Sealos platform
│   ├── auth.ts                # Kubeconfig-based authentication
│   ├── endpoints.ts           # API endpoint URL construction
│   └── types.ts               # API request/response types
│
├── http/
│   ├── pool.ts                # HTTP connection pool implementation
│   ├── manager.ts             # Connection manager (pool orchestrator)
│   └── types.ts               # HTTP connection types
│
├── transfer/
│   ├── engine.ts              # File transfer strategy engine (extensible)
│
├── security/
│   ├── adapter.ts             # Security validation (path traversal, sanitization)
│
├── monitoring/
│   ├── metrics.ts             # Metrics collection and tracking
│
├── utils/
│   └── error.ts               # Custom error classes and error codes
│
└── index.ts                   # Main entry point & exports
```

### 2.3 Core Components Deep Dive

#### A. DevboxSDK Class (Main Entry Point)
**File**: `src/core/DevboxSDK.ts`

```typescript
class DevboxSDK {
  private apiClient: DevboxAPI
  private connectionManager: ConnectionManager
  
  // Lifecycle operations
  async createDevbox(config: DevboxCreateConfig): Promise<DevboxInstance>
  async getDevbox(name: string): Promise<DevboxInstance>
  async listDevboxes(): Promise<DevboxInstance[]>
  
  // File operations
  async writeFile(devboxName, path, content, options?): Promise<void>
  async readFile(devboxName, path, options?): Promise<Buffer>
  async uploadFiles(devboxName, files, options?): Promise<TransferResult>
  
  // Real-time file watching
  async watchFiles(devboxName, path, callback): Promise<WebSocket>
  
  // Monitoring
  async getMonitorData(devboxName, timeRange?): Promise<MonitorData[]>
  
  // Resource cleanup
  async close(): Promise<void>
}
```

**Key Responsibilities**:
- Serves as the main orchestrator
- Delegates to `DevboxAPI` for platform API calls
- Delegates to `ConnectionManager` for container HTTP communication
- Creates and returns `DevboxInstance` wrappers

**Design Pattern**: Facade pattern - simplifies complex subsystem interactions

#### B. DevboxInstance Class (Per-Instance Wrapper)
**File**: `src/core/DevboxInstance.ts`

```typescript
class DevboxInstance {
  private info: DevboxInfo
  private sdk: DevboxSDK
  
  // Properties
  get name(): string
  get status(): string
  get runtime(): string
  get serverUrl(): string
  
  // Instance-specific methods (delegate to SDK)
  async writeFile(path, content, options?): Promise<void>
  async readFile(path, options?): Promise<Buffer>
  async uploadFiles(files, options?): Promise<TransferResult>
  async executeCommand(command): Promise<CommandResult>
  async getProcessStatus(pid): Promise<ProcessStatus>
  async getMonitorData(timeRange?): Promise<MonitorData[]>
  
  // Lifecycle
  async start(): Promise<void>
  async pause(): Promise<void>
  async restart(): Promise<void>
  async delete(): Promise<void>
  async waitForReady(timeout): Promise<void>
  
  // Health & diagnostics
  async isHealthy(): Promise<boolean>
  async getDetailedInfo(): Promise<DevboxInfo>
}
```

**Key Responsibilities**:
- Wraps individual Devbox info
- Provides convenience methods scoped to this instance
- Delegates operations back to parent SDK

**Design Pattern**: Wrapper/Adapter pattern - provides convenient interface

#### C. HTTP Connection Pool (Core Infrastructure)
**File**: `src/http/pool.ts`

**Purpose**: Manage reusable HTTP connections to container servers

**Key Features**:
```typescript
class ConnectionPool {
  // Connection acquisition & release
  async getConnection(devboxName, serverUrl): Promise<ContainerHTTPClient>
  releaseConnection(connectionId): void
  async removeConnection(connection): Promise<void>
  
  // Lifecycle management
  async closeAllConnections(): Promise<void>
  getStats(): PoolStats
  
  // Health monitoring
  private async performHealthCheck(client): Promise<HealthCheckResult>
  private async performRoutineHealthChecks(): Promise<void>
  private async cleanupIdleConnections(): Promise<void>
}
```

**Configuration**:
```typescript
interface ConnectionPoolConfig {
  maxSize?: number              // Default: 15
  connectionTimeout?: number    // Default: 30s
  keepAliveInterval?: number    // Default: 60s
  healthCheckInterval?: number  // Default: 60s
  maxIdleTime?: number          // Default: 5 min
}
```

**Strategy**: `least-used` (default), `round-robin`, `random`

**Health Check Mechanism**:
- Periodic background health checks every 60s
- Per-operation health validation before use
- Automatic removal of unhealthy connections
- Idle connection cleanup (>5 minutes)

**Connection Lifecycle**:
1. Created on-demand when getConnection() called
2. Marked as active during operation
3. Released back to pool after operation
4. Health checked periodically
5. Cleaned up if idle or unhealthy

**Stats Tracked**:
- Total connections, active, healthy, unhealthy
- Connection reuse rate (98%+ target)
- Average connection lifetime
- Total bytes transferred
- Total operations performed

#### D. Connection Manager
**File**: `src/http/manager.ts`

**Purpose**: High-level orchestration of connection pool + API client integration

```typescript
class ConnectionManager {
  private pool: ConnectionPool
  private apiClient: any
  
  async executeWithConnection<T>(
    devboxName: string,
    operation: (client: any) => Promise<T>
  ): Promise<T>
  
  async getServerUrl(devboxName: string): Promise<string>
  async checkDevboxHealth(devboxName: string): Promise<boolean>
  getConnectionStats(): PoolStats
}
```

**Workflow**:
1. Get devbox info from API to resolve server URL
2. Acquire HTTP client from pool
3. Execute operation
4. Handle errors and cleanup
5. Optionally release connection back to pool

#### E. API Client (Sealos Platform Integration)
**File**: `src/api/client.ts`

**Purpose**: REST API client for Sealos Devbox management platform

**Main Operations**:
```typescript
class DevboxAPI {
  // Lifecycle
  async createDevbox(config): Promise<DevboxInfo>
  async getDevbox(name): Promise<DevboxInfo>
  async listDevboxes(): Promise<DevboxInfo[]>
  async startDevbox(name): Promise<void>
  async pauseDevbox(name): Promise<void>
  async restartDevbox(name): Promise<void>
  async deleteDevbox(name): Promise<void>
  
  // Monitoring
  async getMonitorData(name, timeRange?): Promise<MonitorData[]>
  
  // Auth test
  async testAuth(): Promise<boolean>
}
```

**HTTP Client Features**:
- Exponential backoff retry logic (3 retries default)
- Timeout handling with AbortController
- Status code → error code mapping
- JSON/text response parsing

**Retry Strategy**:
- Retries on: timeout, connection failed, server unavailable
- Exponential backoff: 1s, 2s, 4s
- Total timeout: 30s (configurable)

#### F. Authentication (Kubeconfig-based)
**File**: `src/api/auth.ts`

```typescript
class KubeconfigAuthenticator {
  constructor(kubeconfig: string)
  getAuthHeaders(): Record<string, string>
  validateKubeconfig(): void
  async testAuthentication(apiClient): Promise<boolean>
  updateKubeconfig(kubeconfig: string): void
}
```

**Security**:
- Validates kubeconfig format (basic JSON parsing if applicable)
- Generates Bearer token in auth headers
- Test auth via API call
- Runtime kubeconfig updates

#### G. Security Adapter
**File**: `src/security/adapter.ts`

```typescript
class SecurityAdapter {
  validatePath(path: string): boolean      // Prevent directory traversal
  sanitizeInput(input: string): string     // Trim whitespace
  validatePermissions(required, user): boolean
}
```

**Current Validations**:
- No `../` sequences (directory traversal)
- No leading `/` (absolute paths)
- Input trimming

#### H. Metrics Collection
**File**: `src/monitoring/metrics.ts`

```typescript
interface SDKMetrics {
  connectionsCreated: number
  filesTransferred: number
  bytesTransferred: number
  errors: number
  avgLatency: number
  operationsCount: number
}

class MetricsCollector {
  recordTransfer(size, latency): void
  recordConnection(): void
  recordError(): void
  getMetrics(): SDKMetrics
  reset(): void
}
```

#### I. File Transfer Engine
**File**: `src/transfer/engine.ts`

```typescript
interface TransferStrategy {
  name: string
  canHandle(files: FileMap): boolean
  transfer(files, onProgress?): Promise<TransferResult>
}

class TransferEngine {
  addStrategy(strategy: TransferStrategy): void
  async transferFiles(files, onProgress?): Promise<TransferResult>
  private selectStrategy(files): TransferStrategy | null
}
```

**Current State**: Framework defined, default strategies not yet implemented

### 2.4 Type System

**Core Types** (`src/core/types.ts`):

```typescript
// SDK Configuration
interface DevboxSDKConfig {
  kubeconfig: string
  baseUrl?: string
  connectionPool?: ConnectionPoolConfig
  http?: HttpClientConfig
}

// Devbox Creation
interface DevboxCreateConfig {
  name: string
  runtime: string  // 'node.js', 'python', 'go', etc.
  resource: ResourceInfo
  ports?: PortConfig[]
  env?: Record<string, string>
}

interface ResourceInfo {
  cpu: number      // CPU cores
  memory: number   // GB
}

// Instance Info
interface DevboxInfo {
  name: string
  status: string   // 'creating', 'running', 'paused', 'error', etc.
  runtime: string
  resources: ResourceInfo
  podIP?: string   // For direct HTTP access
  ssh?: SSHInfo
}

// File Operations
interface FileMap {
  [path: string]: Buffer | string
}

interface WriteOptions {
  encoding?: string
  mode?: number
}

interface BatchUploadOptions {
  concurrency?: number
  chunkSize?: number
  onProgress?: (progress: TransferProgress) => void
}

interface TransferResult {
  success: boolean
  processed: number
  total: number
  bytesTransferred: number
  duration: number
  errors?: TransferError[]
}

// Process Execution
interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  pid?: number
}

interface ProcessStatus {
  pid: number
  state: 'running' | 'completed' | 'failed' | 'unknown'
  exitCode?: number
  cpu?: number
  memory?: number
  startTime: number
  runningTime: number
}

// Monitoring
interface MonitorData {
  cpu: number
  memory: number
  network: { bytesIn: number; bytesOut: number }
  disk: { used: number; total: number }
  timestamp: number
}
```

### 2.5 Error Handling

**Custom Error Classes** (`src/utils/error.ts`):

```typescript
class DevboxSDKError extends Error {
  constructor(message, code, context?)
}

// Specialized error types:
class AuthenticationError extends DevboxSDKError
class ConnectionError extends DevboxSDKError
class FileOperationError extends DevboxSDKError
class DevboxNotFoundError extends DevboxSDKError
class ValidationError extends DevboxSDKError
```

**Error Codes** (from `src/core/constants.ts`):
```typescript
ERROR_CODES = {
  // Auth
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_KUBECONFIG: 'INVALID_KUBECONFIG',
  
  // Connection
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_POOL_EXHAUSTED: 'CONNECTION_POOL_EXHAUSTED',
  
  // Devbox
  DEVBOX_NOT_FOUND: 'DEVBOX_NOT_FOUND',
  DEVBOX_CREATION_FAILED: 'DEVBOX_CREATION_FAILED',
  
  // File operations
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TRANSFER_FAILED: 'FILE_TRANSFER_FAILED',
  PATH_TRAVERSAL_DETECTED: 'PATH_TRAVERSAL_DETECTED',
  
  // Server
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',
  HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED',
  
  // General
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
}
```

### 2.6 Constants & Configuration

**Default Configuration** (`src/core/constants.ts`):

```typescript
DEFAULT_CONFIG = {
  BASE_URL: 'https://api.sealos.io',
  CONTAINER_HTTP_PORT: 3000,
  
  CONNECTION_POOL: {
    MAX_SIZE: 15,
    CONNECTION_TIMEOUT: 30s,
    KEEP_ALIVE_INTERVAL: 60s,
    HEALTH_CHECK_INTERVAL: 60s
  },
  
  HTTP_CLIENT: {
    TIMEOUT: 30s,
    RETRIES: 3
  },
  
  FILE_LIMITS: {
    MAX_FILE_SIZE: 100MB,
    MAX_BATCH_SIZE: 50,
    CHUNK_SIZE: 1MB
  },
  
  PERFORMANCE: {
    SMALL_FILE_LATENCY_MS: 50,      // <50ms for <1MB
    LARGE_FILE_THROUGHPUT_MBPS: 15, // >15MB/s
    CONNECTION_REUSE_RATE: 0.98,    // >98%
    STARTUP_TIME_MS: 100              // <100ms
  }
}

API_ENDPOINTS = {
  DEVBOX: {
    LIST: '/api/v1/devbox',
    CREATE: '/api/v1/devbox',
    GET: '/api/v1/devbox/{name}',
    START: '/api/v1/devbox/{name}/start',
    PAUSE: '/api/v1/devbox/{name}/pause',
    RESTART: '/api/v1/devbox/{name}/restart',
    DELETE: '/api/v1/devbox/{name}',
    MONITOR: '/api/v1/devbox/{name}/monitor'
  }
}

SUPPORTED_RUNTIMES = [
  'node.js', 'python', 'go', 'java',
  'react', 'vue', 'angular', 'docker', 'bash'
]
```

---

## 3. PACKAGE: @sealos/devbox-server

### 3.1 Purpose & Scope
High-performance HTTP server running inside Devbox containers, providing APIs for:
- File operations (read, write, batch upload)
- Process execution
- Real-time file watching via WebSocket
- Health checks

### 3.2 Directory Structure

```
src/
├── server.ts              # Main HTTP server implementation
├── handlers/
│   ├── files.ts          # File operation handlers
│   ├── process.ts        # Process execution handler
│   └── websocket.ts      # WebSocket handler for file watching
├── types/
│   └── server.ts         # Type definitions
├── utils/
│   ├── file-watcher.ts   # Chokidar-based file watcher
│   └── path-validator.ts # Path validation utilities
└── index.ts              # Entry point (bootstrap)
```

### 3.3 Core Components

#### A. DevboxHTTPServer (Main Server)
**File**: `src/server.ts`

```typescript
class DevboxHTTPServer {
  private config: ServerConfig
  private fileWatcher: FileWatcher
  private fileHandler: FileHandler
  private processHandler: ProcessHandler
  private webSocketHandler: WebSocketHandler
  
  async start(): Promise<void>
  private async handleRequest(request: Request): Promise<Response>
  private handleHealth(): Response
}
```

**Configuration**:
```typescript
interface ServerConfig {
  port: number                    // Default: 3000
  host?: string                   // Default: '0.0.0.0'
  workspacePath: string           // Default: '/workspace'
  enableCors: boolean
  maxFileSize: number             // Default: 100MB
}
```

**Environment Variables**:
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `WORKSPACE_PATH` - Workspace directory (default: /workspace)
- `ENABLE_CORS` - Enable CORS (default: false)
- `MAX_FILE_SIZE` - Max file size in bytes (default: 100MB)

**Routes**:
```
GET  /health                    # Health check
POST /files/read                # Read file
POST /files/write               # Write file
POST /files/delete              # Delete file
POST /files/batch-upload        # Batch upload
POST /process/exec              # Execute command
GET  /process/status/{pid}      # Get process status
WS   /ws                        # WebSocket file watching
```

**CORS Support**: Optional, configurable via `enableCors` setting

#### B. FileHandler
**File**: `src/handlers/files.ts`

```typescript
class FileHandler {
  async handleReadFile(request: ReadFileRequest): Promise<Response>
  async handleWriteFile(request: WriteFileRequest): Promise<Response>
  async handleBatchUpload(request: BatchUploadRequest): Promise<Response>
  async handleDeleteFile(path: string): Promise<Response>
}
```

**Features**:
- Path validation (prevent directory traversal)
- Base64 encoding support
- File permissions handling
- MIME type detection
- Event emission to file watcher

**Implementation Details**:
- Uses Bun's native `Bun.write()` and `Bun.file()` APIs
- Supports binary and text encodings
- Triggers file watcher events on changes

#### C. ProcessHandler
**File**: `src/handlers/process.ts`

```typescript
class ProcessHandler {
  async handleExec(request: ProcessExecRequest): Promise<Response>
  async handleStatus(pid: number): Promise<Response>
  private cleanupFinishedProcesses(): void
}

interface RunningProcess {
  pid: number
  process: Bun.Subprocess
  startTime: number
  stdout: string
  stderr: string
}
```

**Features**:
- Command execution via Bun.spawn()
- Process tracking with PIDs
- Timeout handling (default: 30s)
- Stdout/stderr capture
- Periodic cleanup of finished processes (30s interval)
- Exit code tracking

**Process Lifecycle**:
1. Spawn subprocess with Bun
2. Capture output streams
3. Wait for completion with timeout
4. Return results (PID, exit code, stdout, stderr)
5. Auto-cleanup after 30s of inactivity

#### D. WebSocket Handler
**File**: `src/handlers/websocket.ts`

```typescript
class WebSocketHandler {
  handleConnection(ws: any): void
  private handleMessage(ws, message): void
  private handleWatchRequest(ws, path): void
  private handleUnwatchRequest(ws, path): void
  private setupFileWatcher(): void
  private broadcastToAll(data): void
}
```

**Message Protocol**:
```json
// Watch request
{ "type": "watch", "path": "/path/to/watch" }

// Unwatch request
{ "type": "unwatch", "path": "/path/to/watch" }

// File change notification (broadcast)
{
  "type": "file-change",
  "event": {
    "type": "change|add|unlink",
    "path": "filename",
    "timestamp": 1234567890
  }
}
```

**Features**:
- Multiple concurrent connections
- Per-path watching registration
- Automatic cleanup on disconnect
- Error handling and message validation
- Broadcast to all connected clients

#### E. File Watcher Utility
**File**: `src/utils/file-watcher.ts`

```typescript
class FileWatcher extends EventTarget {
  startWatching(path: string, ws: any): void
  stopWatching(path: string, ws: any): void
  emit(event: string, data: FileChangeEvent): void
  on(event: string, callback: (data) => void): void
}
```

**Implementation**:
- Uses Chokidar library for cross-platform file watching
- Lazy initialization (watcher created on first subscription)
- Lazy cleanup (watcher destroyed when last subscriber unsubscribes)
- Event filtering (ignores dotfiles)

**Events**:
- `add` - File/directory added
- `change` - File modified
- `unlink` - File/directory deleted

#### F. Path Validator
**File**: `src/utils/path-validator.ts`

```typescript
function validatePath(path: string, allowedBase: string): void
function getContentType(filePath: string): string
function sanitizePath(path: string): string
```

**Validation**:
- Ensures resolved path stays within allowed base directory
- Prevents path traversal attacks
- MIME type detection
- Path normalization

### 3.4 Type Definitions

```typescript
// Server Configuration
interface ServerConfig {
  port: number
  host?: string
  workspacePath: string
  enableCors: boolean
  maxFileSize: number
}

// File Operations
interface WriteFileRequest {
  path: string
  content: string          // Can be base64 encoded
  encoding?: 'utf8' | 'base64'
  permissions?: number
}

interface ReadFileRequest {
  path: string
  encoding?: 'utf8' | 'binary'
}

interface BatchUploadRequest {
  files: Array<{
    path: string
    content: string
    encoding?: 'utf8' | 'base64'
  }>
}

interface FileOperationResult {
  path: string
  success: boolean
  size?: number
  error?: string
}

// Process Operations
interface ProcessExecRequest {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  shell?: string
  timeout?: number
}

interface ProcessStatusResponse {
  pid: number
  status: 'running' | 'completed' | 'failed'
  exitCode?: number
  stdout?: string
  stderr?: string
}

// Health
interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
}

// File watching
interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  timestamp: number
}
```

### 3.5 Server Bootstrap

**File**: `src/index.ts`

```typescript
const server = new DevboxHTTPServer({
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  workspacePath: process.env.WORKSPACE_PATH || '/workspace',
  enableCors: process.env.ENABLE_CORS === 'true',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600')
})

server.start().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
```

---

## 4. SDK-SERVER RELATIONSHIP

### 4.1 Communication Flow

```
┌─────────────────────┐
│   SDK Client        │
│  (Node.js)          │
├─────────────────────┤
│ - DevboxSDK         │
│ - DevboxInstance    │
│ - DevboxAPI         │ ──────────┐
│ - ConnectionPool    │           │
│ - ConnectionManager │           │
└─────────────────────┘           │
                                  │
         Sealos Platform API       │
         (Kubeconfig auth)         │
                                  │ HTTP
                                  │
                          ┌───────▼──────────┐
                          │  Container       │
                          │  HTTP Server     │
                          │  (Bun Runtime)   │
                          ├──────────────────┤
                          │ - FileHandler    │
                          │ - ProcessHandler │
                          │ - WebSocketWS    │
                          │ - FileWatcher    │
                          └──────────────────┘
```

### 4.2 Request Flow Example: File Write

```
1. SDK Client:
   devbox.writeFile('main.ts', 'const x = 1', { encoding: 'utf8' })

2. DevboxSDK:
   - Calls connectionManager.executeWithConnection(devboxName, async (client) => {
       return await client.post('/files/write', { path, content, encoding })
     })

3. ConnectionManager:
   - Resolves devbox server URL via DevboxAPI
   - Gets HTTP client from ConnectionPool
   - Executes operation
   - Client health checked automatically

4. ConnectionPool:
   - Returns existing healthy connection OR
   - Creates new connection if pool not full
   - Connection lifecycle managed automatically

5. ContainerHTTPClient:
   - Makes HTTP POST to http://{podIP}:3000/files/write
   - JSON body: { path, content: "base64_encoded", encoding }

6. Server (Bun):
   - POST /files/write route
   - FileHandler.handleWriteFile()
   - Validates path (no traversal)
   - Decodes base64 content
   - Writes via Bun.write()
   - Triggers file watcher event
   - Returns { success, path, size, timestamp }

7. Back to SDK:
   - Promise resolves
   - Connection released back to pool
```

### 4.3 Server URL Resolution

Server URL comes from `DevboxInfo.podIP` returned by Sealos API:
```
http://{devboxInfo.podIP}:3000
```

The pod IP is set by Kubernetes when container is created and running.

---

## 5. HTTP CLIENT POOL ARCHITECTURE

### 5.1 Connection Pool Strategy

**Type**: Per-devbox-server connection pool

**Configuration Hierarchy**:
1. User provides `DevboxSDKConfig.connectionPool`
2. Merged with `DEFAULT_CONFIG.CONNECTION_POOL`
3. Applied to `ConnectionPool` instance

### 5.2 Connection Lifecycle

```
1. REQUEST PHASE
   ├─ getConnection(devboxName, serverUrl)
   │  ├─ Lookup existing pool by poolKey
   │  ├─ Find available healthy idle connection
   │  ├─ OR create new connection if pool < maxSize
   │  ├─ Perform health check
   │  └─ Mark as active, update timestamps
   │
2. OPERATION PHASE
   ├─ Application executes operation
   │
3. RELEASE PHASE
   ├─ releaseConnection()
   │  └─ Mark as inactive, update lastUsed
   │
4. BACKGROUND MONITORING
   ├─ performRoutineHealthChecks() - every healthCheckInterval
   │  └─ Health check all idle connections
   ├─ cleanupIdleConnections() - every healthCheckInterval
   │  └─ Remove connections idle > maxIdleTime (5 min)
```

### 5.3 Health Check Mechanism

**Two-level Health Checking**:

1. **Pre-operation Check** (always):
   - Quick check: if healthy & recently used → approve
   - Full check: if needed → /health endpoint
   - Mark unhealthy if check fails
   - Retry with new connection if failed

2. **Background Check** (periodic):
   - Runs every 60s on all idle connections
   - Updates health status
   - Feeds into pre-operation decisions

**Health Endpoint**:
```
GET /health → { status: 'healthy', ... }
```

### 5.4 Connection Stats Tracked

```typescript
interface PoolStats {
  totalConnections: number           // All connections
  activeConnections: number          // Currently in use
  healthyConnections: number         // Passed last health check
  unhealthyConnections: number       // Failed health check
  reuseRate: number                  // (totalUseCount - totalConnections) / totalUseCount
  averageLifetime: number            // ms
  bytesTransferred: number           // Total bytes
  totalOperations: number            // Total operations
}
```

### 5.5 Pool Key & Pooling Strategy

**Pool Key**: `${devboxName}:${serverUrl}`

This means separate pools for different devboxes and/or different server URLs.

**Selection Strategy** (configurable):
- `least-used` (default) - Pick connection with lowest useCount
- `round-robin` - Round-robin through healthy connections
- `random` - Random healthy connection

---

## 6. SECURITY ARCHITECTURE

### 6.1 Authentication Flow

```
User → DevboxSDKConfig { kubeconfig }
         ↓
     KubeconfigAuthenticator
         ├─ Validate kubeconfig format (basic)
         ├─ Encode as Bearer token
         └─ Generate auth headers
           ↓
       DevboxAPI
         ├─ Attach auth headers to all requests
         └─ Send to Sealos API
```

**Auth Headers**:
```
Authorization: Bearer {kubeconfig}
Content-Type: application/json
```

### 6.2 Path Security

**Server-side Path Validation** (`src/utils/path-validator.ts`):

```typescript
function validatePath(path: string, allowedBase: string) {
  const normalizedPath = resolve(allowedBase, path)
  if (!normalizedPath.startsWith(allowedBase)) {
    throw new Error('Path traversal detected')
  }
}
```

**Prevents**:
- `../` sequences (directory traversal)
- Absolute paths starting with `/`
- Escaping workspace directory

**Example**:
- ✅ `writeFile('src/main.ts')` → `/workspace/src/main.ts`
- ✅ `writeFile('config.json')` → `/workspace/config.json`
- ❌ `writeFile('../../../etc/passwd')` → Throws error
- ❌ `writeFile('/etc/passwd')` → Throws error

### 6.3 Input Sanitization

**SDK-side** (BasicSecurityAdapter):
- Trim whitespace
- Basic validation

**Server-side** (Path validator):
- MIME type detection
- Path normalization

### 6.4 Security Concerns & Gaps

**Current State**:
- ✅ Path traversal prevention
- ✅ Bearer token authentication
- ✅ Input validation
- ⚠️ No file permission checks
- ⚠️ No rate limiting
- ⚠️ No RBAC/ACL enforcement
- ⚠️ No encryption in transit (assumes HTTPS proxy)
- ⚠️ No audit logging

---

## 7. MONITORING & OBSERVABILITY

### 7.1 Metrics Collection

**SDK-side** (`src/monitoring/metrics.ts`):

```typescript
class MetricsCollector {
  recordTransfer(size: number, latency: number)
  recordConnection()
  recordError()
  getMetrics(): SDKMetrics
}
```

**Tracked Metrics**:
- Connections created
- Files transferred
- Bytes transferred
- Errors encountered
- Average latency
- Operation count

### 7.2 Connection Pool Monitoring

**Real-time Stats**:
```
connectionPool.getStats() → {
  totalConnections: 5,
  activeConnections: 2,
  healthyConnections: 5,
  unhealthyConnections: 0,
  reuseRate: 0.95,
  averageLifetime: 45000,
  bytesTransferred: 5242880,
  totalOperations: 150
}
```

### 7.3 Health Checks

**Container Server Health**:
```
GET /health → HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
}
```

**Devbox Health Check** (SDK):
```typescript
async checkDevboxHealth(devboxName): Promise<boolean> {
  // Try /health endpoint
  // Return true if 200 OK
}
```

### 7.4 Monitoring Gaps

- ⚠️ No structured logging
- ⚠️ No distributed tracing
- ⚠️ No Prometheus metrics endpoint
- ⚠️ No alerting integration
- ⚠️ Limited error context capture

---

## 8. ERROR HANDLING

### 8.1 Error Classification

```
DevboxSDKError (base)
├── AuthenticationError
├── ConnectionError
├── FileOperationError
├── DevboxNotFoundError
└── ValidationError
```

### 8.2 Retry Logic

**API Client Retry**:
- Retries on: timeout, connection failed, server unavailable
- Strategy: Exponential backoff (1s, 2s, 4s)
- Max retries: 3 (configurable)
- Respects HTTP status codes (401, 403 don't retry)

**Connection Pool Retry**:
- On operation failure: Try new connection from pool
- On health check failure: Mark connection unhealthy
- Auto-remove unhealthy connections

### 8.3 Error Propagation

```
1. Low-level error (fetch/timeout)
   ↓
2. Wrapped in DevboxSDKError with context
   ↓
3. Propagated through promise chain
   ↓
4. Application handles error
```

**Example**:
```typescript
try {
  await devbox.writeFile('main.ts', content)
} catch (error) {
  if (error instanceof FileOperationError) {
    console.log('File write failed:', error.message)
    console.log('Context:', error.context)
  }
}
```

---

## 9. FILE TRANSFER ARCHITECTURE

### 9.1 Current Implementation

**Basic Approach** (SDK):
```typescript
async writeFile(devboxName, path, content) {
  // Base64 encode content
  return await connectionManager.executeWithConnection(
    devboxName,
    async (client) => {
      return await client.post('/files/write', {
        path,
        content: content.toString('base64'),
        encoding: 'base64'
      })
    }
  )
}

async uploadFiles(devboxName, files, options?) {
  // Batch all files and send in one request
  return await connectionManager.executeWithConnection(
    devboxName,
    async (client) => {
      return await client.post('/files/batch-upload', {
        files: Object.entries(files).map(([path, content]) => ({
          path,
          content: content.toString('base64'),
          encoding: 'base64'
        }))
      })
    }
  )
}
```

**Encoding**: Base64 for JSON transport

**Chunking**: None (single request per operation)

**Concurrency**: Options defined but not enforced

### 9.2 Transfer Strategy Engine

**Framework** (`src/transfer/engine.ts`):
```typescript
interface TransferStrategy {
  name: string
  canHandle(files: FileMap): boolean
  transfer(files, onProgress?): Promise<TransferResult>
}

class TransferEngine {
  addStrategy(strategy: TransferStrategy)
  async transferFiles(files, onProgress?): Promise<TransferResult>
}
```

**Current State**: Framework defined, no concrete strategies implemented

**Planned Strategies** (from defaults comment):
- Small files: Direct POST
- Large files: Chunked transfer
- Binary files: Different encoding
- Directory sync: Batch with tree structure

### 9.3 Transfer Limitations

- ⚠️ No streaming
- ⚠️ No chunking (single request)
- ⚠️ No compression
- ⚠️ No resume capability
- ⚠️ No bandwidth throttling
- ⚠️ No progress reporting (framework exists but not used)

---

## 10. TESTING ARCHITECTURE

### 10.1 Test Structure

```
__tests__/
├── unit/                    # Unit tests for individual components
│   ├── app.test.ts
│   ├── benchmarks.test.ts
│   ├── connection-pool.test.ts
│   ├── devbox-sdk.test.ts
│
├── integration/             # Integration tests
│   ├── api-client.test.ts
│
└── e2e/                     # End-to-end tests
    └── file-operations.test.ts
```

### 10.2 Test Tools

- **Framework**: Vitest (configured in `vitest.config.ts`)
- **Assertions**: Node.js assert module
- **Mocking**: nock for HTTP mocking
- **Coverage**: Vitest built-in

### 10.3 Example Test Pattern

```typescript
describe('Connection Pool Tests', () => {
  let connectionPool: ConnectionPool
  let mockServer: nock.Scope
  
  beforeEach(() => {
    mockServer = nock('https://test-server.com')
    connectionPool = new ConnectionPool({ maxSize: 5 })
  })
  
  afterEach(() => {
    nock.cleanAll()
    connectionPool.clear()
  })
  
  test('should reuse idle connections', async () => {
    mockServer.get('/test').reply(200, { success: true })
    
    const conn1 = await connectionPool.acquire()
    const connId = conn1.id
    connectionPool.release(conn1)
    
    const conn2 = await connectionPool.acquire()
    assert.strictEqual(conn2.id, connId)
    
    connectionPool.release(conn2)
  })
})
```

---

## 11. BUILD & DEPLOYMENT

### 11.1 Build System: Turbo

**Configuration** (`turbo.json`):
```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "*.js"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    }
  }
}
```

**Key Features**:
- Task dependency graph (build → test)
- Output caching
- Parallel execution across packages
- `^build` = build dependencies first

### 11.2 SDK Build: tsup

**Configuration** (`packages/sdk/tsup.config.ts`):
- Entry: `src/index.ts`
- Output: CJS + ESM
- Target: ES2022
- Declaration files included

**Output**:
```
dist/
├── index.mjs              # ESM module
├── index.cjs              # CommonJS
├── index.d.ts             # TypeScript declarations (ESM)
├── index.d.cts            # TypeScript declarations (CJS)
└── *.js.map               # Source maps
```

### 11.3 Server: Bun Native

**Runtime**: Bun (no build step needed)
- Direct TypeScript execution
- Can run `src/index.ts` directly
- Optional bundling for deployment

### 11.4 TypeScript Configuration

**Global** (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node"
  }
}
```

**Paths**:
```
@/*               → src/*
@/core/*          → src/core/*
@/api/*           → src/api/*
@/connection/*    → src/connection/*
@/devbox/*        → src/devbox/*
@/files/*         → src/files/*
@/websocket/*     → src/websocket/*
@/security/*      → src/security/*
@/utils/*         → src/utils/*
@/monitoring/*    → src/monitoring/*
```

### 11.5 Code Quality Tools

**Biome** (for linting & formatting):
```
biome check src/          # Check
biome check --write src/  # Fix
```

---

## 12. ARCHITECTURAL PATTERNS & DESIGN DECISIONS

### 12.1 Design Patterns Used

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Facade** | DevboxSDK | Simplify complex subsystem (API + Pool) |
| **Adapter** | DevboxInstance | Provide convenient per-instance API |
| **Strategy** | TransferEngine | Pluggable file transfer strategies |
| **Pool** | ConnectionPool | Reuse expensive HTTP connections |
| **Singleton** | SecurityAdapter | Single instance security validation |
| **Factory** | ConnectionPool | Create ContainerHTTPClient instances |
| **Observer** | FileWatcher | Emit file change events to subscribers |

### 12.2 Key Design Decisions

1. **Kubeconfig-based Auth**
   - Simple token-based approach
   - Leverages existing Kubernetes auth
   - No credential storage needed

2. **Connection Pooling**
   - Improves performance for multiple operations
   - Automatic health checks
   - Per-devbox-server pools (isolation)
   - Configurable strategies (least-used, round-robin, random)

3. **Base64 Encoding for Files**
   - Compatible with JSON APIs
   - No special binary handling needed
   - Slight overhead (~33% size increase)
   - Alternative: streaming/chunking (not yet implemented)

4. **Bun Runtime for Server**
   - Ultra-fast JavaScript runtime
   - Native TypeScript support
   - Small container images
   - Direct Bun APIs (Bun.write, Bun.file, Bun.spawn)

5. **WebSocket for File Watching**
   - Real-time push notifications
   - Bidirectional communication
   - Lazy initialization (watcher starts on first subscriber)
   - Chokidar for cross-platform file watching

6. **Separate SDK & Server Packages**
   - Clear separation of concerns
   - Different runtime targets (Node.js vs Bun)
   - Independent versioning and deployment
   - Type-safe communication contracts

### 12.3 Trade-offs Made

| Decision | Benefit | Trade-off |
|----------|---------|-----------|
| Base64 encoding | JSON-compatible, simple | 33% size overhead |
| Single-request file transfers | Simple, no retry logic | No streaming for large files |
| Connection pool per server | Better isolation, parallelism | Memory overhead for many devboxes |
| WebSocket lazy init | Efficient resource use | Slight latency on first watch |
| No encryption in transit | Simpler, faster | Relies on HTTPS proxy |
| No rate limiting | Simple, fast | Vulnerable to resource exhaustion |

---

## 13. DATA FLOW EXAMPLES

### 13.1 Create Devbox Flow

```
SDK Application
    ↓
DevboxSDK.createDevbox({
  name: 'my-app',
  runtime: 'node.js',
  resource: { cpu: 1, memory: 2 }
})
    ↓
DevboxAPI.createDevbox()
    ↓
HTTP POST /api/v1/devbox
Headers: { Authorization: Bearer {kubeconfig} }
Body: { name, runtime, resource }
    ↓
Sealos API (external)
    ↓
Creates Kubernetes Pod + Service
    ↓
Returns: DevboxSSHInfoResponse {
  name, status, runtime, resources, podIP, ssh
}
    ↓
Transform to DevboxInfo
    ↓
Create & return DevboxInstance
```

### 13.2 File Write Flow (with Connection Pooling)

```
SDK Application
    ↓
devboxInstance.writeFile('main.ts', 'code')
    ↓
DevboxSDK.writeFile(devboxName, path, content)
    ↓
ConnectionManager.executeWithConnection(devboxName, operation)
    ├─ Resolve server URL: http://{podIP}:3000
    ├─ Get connection from pool
    │  ├─ Check for existing idle healthy connection
    │  ├─ Create new if needed (< maxSize)
    │  ├─ Perform health check
    │  └─ Mark active
    │
    ├─ Execute operation (POST /files/write)
    │  ├─ Encode content as base64
    │  ├─ Send HTTP POST
    │  ├─ Receive response
    │
    └─ Release connection (mark inactive)
       └─ Available for reuse
    ↓
Return success
```

### 13.3 File Watching Flow

```
SDK Application
    ↓
devboxInstance.watchFiles('/src', (event) => {
  console.log('File changed:', event)
})
    ↓
DevboxSDK.watchFiles(devboxName, path, callback)
    ├─ Get server URL
    ├─ Create WebSocket connection
    ├─ Send { type: 'watch', path }
    │
    └─ On each server message:
       ├─ Receive { type: 'file-change', event }
       └─ Call callback(event)
    ↓
Container Server
    ├─ WebSocket /ws
    ├─ Start Chokidar watcher on path
    │  ├─ Listen for file system events
    │  ├─ Filter and emit FileChangeEvent
    │
    └─ Broadcast to all connected WebSockets
       { type: 'file-change', event }
```

---

## 14. EXTENSIBILITY POINTS

### 14.1 Current Extension Points

1. **Transfer Strategies**
   ```typescript
   const engine = new TransferEngine()
   engine.addStrategy(new CustomTransferStrategy())
   ```

2. **Connection Pool Strategy**
   - Configurable via `ConnectionPoolConfig.strategy`
   - Implementations: round-robin, least-used, random

3. **Custom HTTP Headers**
   - Can be passed via request options

4. **Custom Environment Variables**
   - Server configuration via env vars

### 14.2 Future Extension Points

- Custom authentication adapters
- Custom security validators
- Custom metrics collectors
- Custom error handlers
- Custom file transfer strategies

---

## 15. PERFORMANCE CHARACTERISTICS

### 15.1 Performance Targets

From `DEFAULT_CONFIG.PERFORMANCE`:
- Small file (<1MB): <50ms latency
- Large files: >15MB/s throughput
- Connection reuse: >98%
- Bun server startup: <100ms

### 15.2 Bottlenecks & Optimization Opportunities

1. **Base64 Encoding Overhead**
   - 33% size increase
   - Alternative: Binary transfer (not implemented)

2. **Single-Request File Transfers**
   - No streaming for large files
   - All content in memory
   - Alternative: Chunked streaming (not implemented)

3. **Health Checks**
   - Every operation has pre-check
   - 60s background check interval
   - Could use more aggressive caching

4. **Path Validation**
   - `resolve()` call for every file operation
   - Minor overhead but acceptable

5. **WebSocket Broadcasting**
   - Broadcasts to all connected clients
   - Could be optimized with filtering

---

## 16. SUMMARY OF KEY ARCHITECTURAL DECISIONS

### SDK Architecture
- **Two-tier design**: High-level SDK (facade) + low-level components
- **Connection pooling**: Per-devbox-server pools with health management
- **Kubeconfig auth**: Simple token-based approach
- **Base64 encoding**: JSON-compatible file transfer
- **Error handling**: Custom error hierarchy with retry logic
- **Metrics collection**: Optional metrics tracking framework

### Server Architecture
- **Bun runtime**: Ultra-fast JS runtime with native TypeScript
- **Handler pattern**: Separate handlers for files, process, WebSocket
- **File watching**: Lazy-initialized Chokidar watchers
- **Path security**: Strict validation to prevent traversal
- **Health checks**: Simple /health endpoint

### Integration
- **HTTP-based communication**: Simple REST + WebSocket
- **Dynamic server discovery**: Pod IP from Kubernetes API
- **Stateless operations**: No session management needed
- **Connection reuse**: Pooling for performance

### Quality
- **Monorepo structure**: Single repo, multiple packages
- **Turbo build system**: Efficient caching and parallelization
- **Strict TypeScript**: Full type safety
- **Comprehensive testing**: Unit, integration, E2E tests
- **Code quality**: Biome for linting and formatting

