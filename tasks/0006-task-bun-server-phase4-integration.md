# Task: Bun Server Phase 4 - Integration and Testing

**Priority**: 🟡 Medium
**Estimated Time**: 3-4 hours
**Status**: Not Started

---

## Overview

Refactor the main server.ts to use the new architecture (Router + DI Container), write comprehensive tests, and ensure the complete HTTP Server works end-to-end.

This phase integrates all previous work into a clean, production-ready HTTP Server.

---

## Parent Task
- [ ] Phase 4: Integration and Testing (3-4 hours)

---

## Sub-tasks

### 4.1 Refactor server.ts to Use New Architecture
**Estimated**: 1.5-2 hours
**File**: `packages/server/src/server.ts`

#### Current Issues
- ❌ 180+ lines with giant switch-case
- ❌ Direct handler instantiation (no DI)
- ❌ No middleware pipeline
- ❌ Inconsistent error handling

#### Target Architecture

```typescript
import { ServiceContainer } from './core/container'
import { Router } from './core/router'
import { corsMiddleware, loggerMiddleware, errorHandlerMiddleware } from './core/middleware'
import { FileHandler } from './handlers/files'
import { ProcessHandler } from './handlers/process'
import { SessionHandler } from './handlers/session'
import { HealthHandler } from './handlers/health'
import { SessionManager } from './session/manager'
import { FileWatcher } from './utils/file-watcher'
import { ProcessTracker } from './utils/process-tracker'
import { createLogger } from '@sealos/devbox-shared/logger'

export class DevboxHTTPServer {
  private container: ServiceContainer
  private router: Router
  private middlewares: Middleware[]

  constructor(config: ServerConfig) {
    this.container = new ServiceContainer()
    this.router = new Router(this.container)
    this.setupServices(config)
    this.setupMiddlewares(config)
    this.setupRoutes()
  }

  private setupServices(config: ServerConfig): void {
    // Core services
    this.container.register('logger', () => createLogger({ level: 'info' }))
    this.container.register('fileWatcher', () => new FileWatcher())
    this.container.register('processTracker', () => new ProcessTracker())
    this.container.register('sessionManager', () => new SessionManager())

    // Handlers
    this.container.register('fileHandler', () => {
      const fileWatcher = this.container.get<FileWatcher>('fileWatcher')
      return new FileHandler(config.workspacePath, fileWatcher)
    })

    this.container.register('processHandler', () => {
      const processTracker = this.container.get<ProcessTracker>('processTracker')
      return new ProcessHandler(config.workspacePath, processTracker)
    })

    this.container.register('sessionHandler', () => {
      const sessionManager = this.container.get<SessionManager>('sessionManager')
      return new SessionHandler(sessionManager)
    })

    this.container.register('healthHandler', () => {
      const sessionManager = this.container.get<SessionManager>('sessionManager')
      const processTracker = this.container.get<ProcessTracker>('processTracker')
      return new HealthHandler(sessionManager, processTracker)
    })
  }

  private setupMiddlewares(config: ServerConfig): void {
    this.middlewares = [
      loggerMiddleware(this.container.get('logger')),
      config.enableCors ? corsMiddleware() : null,
      errorHandlerMiddleware()
    ].filter(Boolean) as Middleware[]
  }

  private setupRoutes(): void {
    const fileHandler = this.container.get<FileHandler>('fileHandler')
    const processHandler = this.container.get<ProcessHandler>('processHandler')
    const sessionHandler = this.container.get<SessionHandler>('sessionHandler')
    const healthHandler = this.container.get<HealthHandler>('healthHandler')

    // Health
    this.router.register('GET', '/health', (req) => healthHandler.handleHealth())
    this.router.register('GET', '/metrics', (req) => healthHandler.handleMetrics())

    // Files
    this.router.register('POST', '/files/read', (req) => fileHandler.handleReadFile(req))
    this.router.register('POST', '/files/write', (req) => fileHandler.handleWriteFile(req))
    this.router.register('POST', '/files/list', (req) => fileHandler.handleListFiles(req))
    this.router.register('POST', '/files/delete', (req) => fileHandler.handleDeleteFile(req))
    this.router.register('POST', '/files/batch-upload', (req) => fileHandler.handleBatchUpload(req))
    this.router.register('GET', '/files/stream/:path', (req) => fileHandler.handleReadFileStream(req))

    // Processes
    this.router.register('POST', '/process/exec', (req) => processHandler.handleExec(req))
    this.router.register('POST', '/process/start', (req) => processHandler.handleStartProcess(req))
    this.router.register('POST', '/process/kill', (req) => processHandler.handleKillProcess(req))
    this.router.register('GET', '/process/status/:id', (req) => processHandler.handleGetProcessStatus(req))
    this.router.register('GET', '/process/logs/:id', (req) => processHandler.handleGetProcessLogs(req))
    this.router.register('GET', '/process/list', (req) => processHandler.handleListProcesses())

    // Sessions
    this.router.register('POST', '/sessions/create', (req) => sessionHandler.handleCreateSession(req))
    this.router.register('GET', '/sessions/:id', (req) => sessionHandler.handleGetSession(req))
    this.router.register('POST', '/sessions/:id/env', (req) => sessionHandler.handleUpdateSessionEnv(req))
    this.router.register('POST', '/sessions/:id/terminate', (req) => sessionHandler.handleTerminateSession(req))
    this.router.register('GET', '/sessions/list', (req) => sessionHandler.handleListSessions())
  }

  async start(): Promise<void> {
    const server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: this.handleRequest.bind(this)
    })

    const logger = this.container.get<Logger>('logger')
    logger.info(`Server started on ${this.config.host}:${this.config.port}`)
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Match route
    const match = this.router.match(request.method, url.pathname)
    if (!match) {
      return new Response('Not Found', { status: 404 })
    }

    // Execute middlewares + handler
    return await this.executeMiddlewares(request, match.handler)
  }

  private async executeMiddlewares(
    request: Request,
    handler: RouteHandler
  ): Promise<Response> {
    let index = 0

    const next = async (): Promise<Response> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++]
        return await middleware(request, next)
      }
      return await handler(request)
    }

    return await next()
  }
}
```

**Acceptance Criteria**:
- [ ] server.ts reduced from 180 lines to ~80 lines
- [ ] All routes defined in setupRoutes()
- [ ] All services managed by DI Container
- [ ] Middleware pipeline working
- [ ] No switch-case statement

---

### 4.2 Write Comprehensive Unit Tests
**Estimated**: 1 hour

#### Test Structure

```
packages/server/__tests__/
├── core/
│   ├── container.test.ts          # DI Container
│   ├── router.test.ts             # Router
│   ├── middleware.test.ts         # Middleware
│   └── response-builder.test.ts   # Response helpers
│
├── handlers/
│   ├── files.test.ts              # FileHandler
│   ├── process.test.ts            # ProcessHandler
│   ├── session.test.ts            # SessionHandler
│   └── health.test.ts             # HealthHandler
│
├── session/
│   ├── manager.test.ts            # SessionManager
│   └── session.test.ts            # Session class
│
├── utils/
│   ├── process-tracker.test.ts    # ProcessTracker
│   └── path-validator.test.ts     # PathValidator
│
└── validators/
    └── schemas.test.ts            # Zod schemas
```

#### Key Test Cases

- [ ] **Container Tests**
  ```typescript
  test('register and get service', () => {
    const container = new ServiceContainer()
    container.register('test', () => ({ value: 42 }))
    expect(container.get('test').value).toBe(42)
  })

  test('lazy initialization', () => {
    let called = false
    container.register('test', () => {
      called = true
      return {}
    })
    expect(called).toBe(false)
    container.get('test')
    expect(called).toBe(true)
  })
  ```

- [ ] **Router Tests**
  ```typescript
  test('match simple route', () => {
    router.register('GET', '/health', handler)
    const match = router.match('GET', '/health')
    expect(match).toBeDefined()
  })

  test('match route with params', () => {
    router.register('GET', '/process/:id', handler)
    const match = router.match('GET', '/process/123')
    expect(match.params.id).toBe('123')
  })
  ```

- [ ] **FileHandler Tests**
  ```typescript
  test('write and read file', async () => {
    await fileHandler.handleWriteFile({
      path: '/test.txt',
      content: 'Hello'
    })
    const response = await fileHandler.handleReadFile({
      path: '/test.txt'
    })
    const data = await response.json()
    expect(data.content).toBe('Hello')
  })
  ```

- [ ] **Session Tests**
  ```typescript
  test('session persistence', async () => {
    const session = await sessionManager.create({})
    await session.execute('cd /tmp')
    const result = await session.execute('pwd')
    expect(result.stdout).toContain('/tmp')
  })
  ```

---

### 4.3 Write Integration Tests
**Estimated**: 1 hour
**File**: `packages/server/__tests__/integration/server.test.ts`

#### Test Scenarios

- [ ] **Server Startup**
  ```typescript
  test('server starts successfully', async () => {
    const server = new DevboxHTTPServer(config)
    await server.start()

    const response = await fetch('http://localhost:3000/health')
    expect(response.status).toBe(200)

    await server.stop()
  })
  ```

- [ ] **Complete File Workflow**
  ```typescript
  test('file upload, read, delete', async () => {
    // Upload
    const uploadResp = await fetch('http://localhost:3000/files/write', {
      method: 'POST',
      body: JSON.stringify({
        path: '/test.txt',
        content: btoa('Hello World'),
        encoding: 'base64'
      })
    })
    expect(uploadResp.status).toBe(200)

    // Read
    const readResp = await fetch('http://localhost:3000/files/read', {
      method: 'POST',
      body: JSON.stringify({ path: '/test.txt' })
    })
    const file = await readResp.json()
    expect(file.content).toBe('Hello World')

    // Delete
    const deleteResp = await fetch('http://localhost:3000/files/delete', {
      method: 'POST',
      body: JSON.stringify({ path: '/test.txt' })
    })
    expect(deleteResp.status).toBe(200)
  })
  ```

- [ ] **Process Lifecycle**
  ```typescript
  test('start, check status, kill process', async () => {
    // Start
    const startResp = await fetch('http://localhost:3000/process/start', {
      method: 'POST',
      body: JSON.stringify({ command: 'sleep 60' })
    })
    const proc = await startResp.json()
    expect(proc.status).toBe('running')

    // Status
    const statusResp = await fetch(`http://localhost:3000/process/status/${proc.id}`)
    const status = await statusResp.json()
    expect(status.status).toBe('running')

    // Kill
    const killResp = await fetch('http://localhost:3000/process/kill', {
      method: 'POST',
      body: JSON.stringify({ id: proc.id })
    })
    expect(killResp.status).toBe(200)
  })
  ```

- [ ] **Session Persistence**
  ```typescript
  test('session maintains state', async () => {
    // Create session
    const createResp = await fetch('http://localhost:3000/sessions/create', {
      method: 'POST',
      body: JSON.stringify({})
    })
    const session = await createResp.json()

    // Execute commands in session
    const exec1 = await executeInSession(session.id, 'cd /tmp')
    const exec2 = await executeInSession(session.id, 'export FOO=bar')
    const exec3 = await executeInSession(session.id, 'pwd && echo $FOO')

    expect(exec3.stdout).toContain('/tmp')
    expect(exec3.stdout).toContain('bar')
  })
  ```

- [ ] **Error Handling**
  ```typescript
  test('invalid request returns validation error', async () => {
    const response = await fetch('http://localhost:3000/files/write', {
      method: 'POST',
      body: JSON.stringify({ path: '' }) // Invalid: empty path
    })

    expect(response.status).toBe(400)
    const error = await response.json()
    expect(error.error.code).toBe('VALIDATION_ERROR')
  })
  ```

---

### 4.4 Add Test Utilities
**Estimated**: 30 minutes
**File**: `packages/server/__tests__/utils/test-helpers.ts`

- [ ] **startTestServer**()
  - Start server on random port
  - Return server instance + base URL
  - Auto cleanup after tests

- [ ] **createTestContainer**()
  - Create container with test services
  - Mock external dependencies
  - Return configured container

- [ ] **createTestFile**(path, content)
  - Create file in test workspace
  - Auto cleanup after test

**Implementation**:
```typescript
export async function startTestServer(): Promise<{
  server: DevboxHTTPServer
  baseUrl: string
  cleanup: () => Promise<void>
}> {
  const port = 3000 + Math.floor(Math.random() * 1000)
  const server = new DevboxHTTPServer({
    port,
    host: 'localhost',
    workspacePath: '/tmp/test-workspace',
    enableCors: false,
    maxFileSize: 1024 * 1024
  })

  await server.start()

  return {
    server,
    baseUrl: `http://localhost:${port}`,
    cleanup: async () => {
      await server.stop()
      // Cleanup test workspace
    }
  }
}
```

---

## Testing Requirements

**Coverage Targets**:
- [ ] Overall: ≥80%
- [ ] Handlers: ≥85%
- [ ] Core (Container, Router): ≥90%
- [ ] Session Management: ≥85%

**Test Commands**:
```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test packages/server/__tests__/handlers/files.test.ts

# Watch mode
bun test --watch
```

---

## Files to Create/Update

```
packages/server/src/
└── server.ts                      # ✏️ Complete refactor (~80 lines)

packages/server/__tests__/
├── core/                          # ⭐ Unit tests
├── handlers/                      # ⭐ Unit tests
├── session/                       # ⭐ Unit tests
├── utils/                         # ⭐ Unit tests
├── validators/                    # ⭐ Unit tests
├── integration/
│   └── server.test.ts             # ⭐ Integration tests
└── utils/
    └── test-helpers.ts            # ⭐ Test utilities
```

---

## Definition of Done

- [ ] server.ts refactored to <80 lines
- [ ] All routes registered via Router
- [ ] All services managed by DI Container
- [ ] Middleware pipeline functional
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Test coverage ≥80%
- [ ] No TypeScript errors
- [ ] Server starts without errors
- [ ] Health check returns 200

**Key Integration Test**:
```bash
# Start server
bun run dev

# Test health
curl http://localhost:3000/health
# {"status":"healthy","uptime":1.234,"version":"1.0.0"}

# Write file
curl -X POST http://localhost:3000/files/write \
  -H "Content-Type: application/json" \
  -d '{"path":"/test.txt","content":"Hello"}'
# {"success":true,"path":"/test.txt","size":5}

# Read file
curl -X POST http://localhost:3000/files/read \
  -H "Content-Type: application/json" \
  -d '{"path":"/test.txt"}'
# {"content":"Hello","size":5}
```

---

## Success Criteria

**Phase 4 Complete When**:
1. ✅ Server architecture clean and maintainable
2. ✅ All routes working via Router
3. ✅ All tests green
4. ✅ Coverage ≥80%
5. ✅ Integration tests passing
6. ✅ Server starts and responds correctly
7. ✅ No regressions from original implementation

---

## Next Steps

After Phase 4 completion:
- 🎉 **Core Bun HTTP Server is DONE**
- 📝 Update documentation
- 🚀 Begin SDK client implementation
- 🔗 SDK ↔ Server integration testing
