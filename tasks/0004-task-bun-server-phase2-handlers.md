# Task: Bun Server Phase 2 - Core Handlers Implementation

**Priority**: 🔴 Critical
**Estimated Time**: 10-12 hours
**Status**: Not Started

---

## Overview

Implement all core HTTP request handlers for the Bun Server:
- FileHandler (complete file operations)
- ProcessHandler (command execution and process management)
- SessionHandler (persistent shell sessions)
- HealthHandler (health checks and metrics)

All handlers must use types from `@sealos/devbox-shared` and return standardized responses.

---

## Parent Task
- [ ] Phase 2: Core Handlers Implementation (10-12 hours)

---

## Sub-tasks

### 2.1 Complete FileHandler Implementation
**Estimated**: 2-3 hours
**File**: `packages/server/src/handlers/files.ts`

#### Required Methods

- [ ] **handleReadFile**(request: ReadFileRequest): Promise<Response>
  - Use `Bun.file()` to read file
  - Support encoding: `utf8`, `base64`, `binary`
  - Return file content + metadata (size, mimeType)
  - Throw `DevboxError` with `FILE_NOT_FOUND` if missing

- [ ] **handleWriteFile**(request: WriteFileRequest): Promise<Response>
  - Decode base64 if needed
  - Use `Bun.write()` for writing
  - Validate path with `validatePath()`
  - Trigger FileWatcher event
  - Return success response with size

- [ ] **handleListFiles**(request: ListFilesRequest): Promise<Response>
  - Use `readdir` to list directory
  - Support recursive listing
  - Support filtering hidden files
  - Return array of `FileMetadata`

- [ ] **handleDeleteFile**(request: DeleteFileRequest): Promise<Response>
  - Validate path
  - Support recursive delete for directories
  - Use `unlink` or `rmdir`
  - Return success response

- [ ] **handleBatchUpload**(request: BatchUploadRequest): Promise<Response>
  - Process files in parallel (limit concurrency to 5)
  - Collect results for each file
  - Return `BatchUploadResponse` with success/failure counts

- [ ] **handleReadFileStream**(path: string): Promise<Response>
  - Return file as `ReadableStream`
  - Use `Bun.file().stream()`
  - Set appropriate headers (Content-Type, Content-Length)

- [ ] **handleWriteFileStream**(path: string, stream: ReadableStream): Promise<Response>
  - Accept streaming upload
  - Write to file incrementally
  - Handle errors mid-stream

**Acceptance Criteria**:
```typescript
// Read file
const readResp = await fileHandler.handleReadFile({ path: '/workspace/app.js' })
expect(readResp.status).toBe(200)

// Write file
const writeResp = await fileHandler.handleWriteFile({
  path: '/workspace/test.txt',
  content: 'Hello World',
  encoding: 'utf8'
})
expect(writeResp.status).toBe(200)

// List files
const listResp = await fileHandler.handleListFiles({ path: '/workspace' })
const data = await listResp.json()
expect(data.files).toBeArray()
```

---

### 2.2 Complete ProcessHandler Implementation
**Estimated**: 3-4 hours
**File**: `packages/server/src/handlers/process.ts`

#### Required Methods

- [ ] **handleExec**(request: ProcessExecRequest): Promise<Response>
  - Use `Bun.spawn()` to execute command
  - Capture stdout/stderr
  - Support timeout (default: 30s)
  - Support custom environment variables
  - Return `ProcessExecResponse` with exitCode, stdout, stderr

- [ ] **handleExecStream**(request: ProcessExecRequest): Promise<Response>
  - Stream process output as Server-Sent Events (SSE)
  - Real-time stdout/stderr streaming
  - Send final result when process exits

- [ ] **handleStartProcess**(request: StartProcessRequest): Promise<Response>
  - Start process in background
  - Assign unique process ID
  - Store process in `ProcessTracker`
  - Return `StartProcessResponse` with process ID and PID

- [ ] **handleKillProcess**(request: KillProcessRequest): Promise<Response>
  - Find process by ID
  - Send signal (default: SIGTERM)
  - Update process status
  - Return success response

- [ ] **handleGetProcessStatus**(id: string): Promise<Response>
  - Lookup process by ID
  - Return `ProcessStatusResponse` with current status
  - Include stdout/stderr if available

- [ ] **handleGetProcessLogs**(request: ProcessLogsRequest): Promise<Response>
  - Get stdout/stderr for process
  - Support `tail` parameter (last N lines)
  - Support `follow` for streaming logs

- [ ] **handleListProcesses**(): Promise<Response>
  - Return all tracked processes
  - Include status, startTime, exitCode

**Acceptance Criteria**:
```typescript
// Execute command
const execResp = await processHandler.handleExec({
  command: 'echo "Hello"',
  timeout: 5000
})
const result = await execResp.json()
expect(result.exitCode).toBe(0)
expect(result.stdout).toContain('Hello')

// Start background process
const startResp = await processHandler.handleStartProcess({
  command: 'sleep 10'
})
const process = await startResp.json()
expect(process.id).toBeDefined()
expect(process.status).toBe('running')
```

**Helper Class Needed**:
```typescript
// packages/server/src/utils/process-tracker.ts
class ProcessTracker {
  private processes = new Map<string, ProcessInfo>()

  add(id: string, proc: Subprocess): void
  get(id: string): ProcessInfo | null
  remove(id: string): void
  list(): ProcessInfo[]
}
```

---

### 2.3 Implement SessionHandler (⭐ Most Complex)
**Estimated**: 4-5 hours
**Files**:
- `packages/server/src/handlers/session.ts`
- `packages/server/src/session/manager.ts`
- `packages/server/src/session/session.ts`

#### Session Architecture

**SessionManager** - Manages multiple sessions
- Create/get/terminate sessions
- Session timeout cleanup
- Session ID generation

**Session** - Individual persistent shell
- Persistent bash shell via `Bun.spawn(['bash', '-i'])`
- Environment variable management
- Working directory tracking
- Command execution in context

#### Required Methods in SessionHandler

- [ ] **handleCreateSession**(request: CreateSessionRequest): Promise<Response>
  - Generate unique session ID
  - Create Session instance with persistent bash
  - Set initial workingDir and env
  - Return `CreateSessionResponse`

- [ ] **handleGetSession**(id: string): Promise<Response>
  - Lookup session by ID
  - Return `GetSessionResponse` with session info

- [ ] **handleUpdateSessionEnv**(request: UpdateSessionEnvRequest): Promise<Response>
  - Update environment variables in session
  - Execute `export VAR=value` commands in shell
  - Return success response

- [ ] **handleTerminateSession**(id: string): Promise<Response>
  - Terminate bash shell
  - Cleanup resources
  - Remove from SessionManager
  - Return success response

- [ ] **handleListSessions**(): Promise<Response>
  - Return all active sessions
  - Include session info (id, state, lastActivity)

#### Session Class Implementation

```typescript
// packages/server/src/session/session.ts
export class Session {
  private shell: Subprocess
  private workingDir: string
  private env: Map<string, string>

  constructor(id: string, config: SessionConfig) {
    this.shell = Bun.spawn(['bash', '-i'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: config.env
    })
    this.workingDir = config.workingDir || '/workspace'
  }

  async execute(command: string): Promise<ExecResult> {
    // Send command to persistent shell
    this.shell.stdin.write(`cd ${this.workingDir}\n`)
    this.shell.stdin.write(`${command}\n`)
    // Collect output...
    return result
  }

  setEnv(key: string, value: string): void {
    this.env.set(key, value)
    this.shell.stdin.write(`export ${key}=${value}\n`)
  }

  terminate(): void {
    this.shell.kill()
  }
}
```

**Acceptance Criteria**:
```typescript
// Create session
const createResp = await sessionHandler.handleCreateSession({
  workingDir: '/workspace',
  env: { FOO: 'bar' }
})
const session = await createResp.json()
expect(session.id).toBeDefined()

// Execute in session context
const session1 = await sessionManager.get(session.id)
const result1 = await session1.execute('cd /tmp')
const result2 = await session1.execute('pwd')
expect(result2.stdout).toContain('/tmp') // Working directory persisted!

// Environment persisted
const result3 = await session1.execute('echo $FOO')
expect(result3.stdout).toContain('bar')
```

---

### 2.4 Implement HealthHandler
**Estimated**: 1 hour
**File**: `packages/server/src/handlers/health.ts`

#### Required Methods

- [ ] **handleHealth**(): Promise<Response>
  - Return server status: `healthy` or `unhealthy`
  - Include uptime, version, timestamp
  - Check filesystem health
  - Check SessionManager health
  - Return `HealthResponse`

- [ ] **handleMetrics**(): Promise<Response>
  - Return `ServerMetrics`
  - Memory usage (heap, rss)
  - Active sessions count
  - Active processes count
  - Request counts

**Acceptance Criteria**:
```typescript
const healthResp = await healthHandler.handleHealth()
const health = await healthResp.json()
expect(health.status).toBe('healthy')
expect(health.uptime).toBeGreaterThan(0)
```

---

## Testing Requirements

**Unit Tests** (`bun test`):
- [ ] FileHandler: All 7 methods
- [ ] ProcessHandler: All 7 methods
- [ ] SessionHandler: All 5 methods
- [ ] Session class: execute, setEnv, terminate
- [ ] SessionManager: create, get, terminate, cleanup
- [ ] HealthHandler: health, metrics

**Integration Tests**:
- [ ] Session persistence test (multi-command sequence)
- [ ] Process lifecycle test (start → status → kill)
- [ ] File upload → read → delete flow

**Coverage Target**: ≥80%

---

## Files to Create/Update

```
packages/server/src/
├── handlers/
│   ├── files.ts           # ✏️ Complete implementation
│   ├── process.ts         # ✏️ Complete implementation
│   ├── session.ts         # ⭐ New file
│   └── health.ts          # ⭐ New file
│
├── session/               # ⭐ New directory
│   ├── manager.ts         # SessionManager
│   └── session.ts         # Session class
│
└── utils/
    └── process-tracker.ts # ⭐ New file

packages/server/__tests__/handlers/
├── files.test.ts
├── process.test.ts
├── session.test.ts
└── health.test.ts
```

---

## Dependencies

**From @sealos/devbox-shared**:
```typescript
import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import type {
  WriteFileRequest,
  ReadFileRequest,
  ProcessExecRequest,
  SessionInfo,
  CreateSessionRequest
} from '@sealos/devbox-shared/types'
import { createLogger } from '@sealos/devbox-shared/logger'
```

**Bun APIs**:
```typescript
Bun.file()      // File operations
Bun.write()     // Write file
Bun.spawn()     // Process execution
```

---

## Critical Implementation Notes

### 1. Session Shell Management

**Problem**: Need to capture output from persistent bash shell
**Solution**: Use markers to delimit command output

```typescript
class Session {
  async execute(command: string): Promise<ExecResult> {
    const marker = `___MARKER_${Date.now()}___`

    // Send command with marker
    this.shell.stdin.write(`${command}\n`)
    this.shell.stdin.write(`echo ${marker}\n`)

    // Read until marker
    let output = ''
    while (!output.includes(marker)) {
      const chunk = await this.shell.stdout.read()
      output += chunk.toString()
    }

    // Parse output before marker
    const stdout = output.split(marker)[0]
    return { exitCode: 0, stdout, stderr: '' }
  }
}
```

### 2. Process Tracking

**ProcessTracker** must handle:
- Process lifecycle (running → completed → killed)
- Automatic cleanup after process exits
- Stdout/stderr buffering for retrieval

### 3. File Streaming

For large files (>10MB):
```typescript
async handleReadFileStream(path: string): Promise<Response> {
  const file = Bun.file(path)
  return new Response(file.stream(), {
    headers: {
      'Content-Type': await file.type || 'application/octet-stream',
      'Content-Length': (await file.size()).toString()
    }
  })
}
```

---

## Definition of Done

- [ ] All sub-tasks completed
- [ ] All handlers implemented with proper error handling
- [ ] Session persistence works (multi-command test passes)
- [ ] All tests passing (`bun test`)
- [ ] Test coverage ≥80%
- [ ] No TypeScript errors
- [ ] Integration with Phase 1 Router successful

**Key Test**:
```typescript
// Session persistence
const session = await createSession()
await session.execute('cd /tmp')
await session.execute('export FOO=bar')
const result = await session.execute('pwd && echo $FOO')
expect(result.stdout).toContain('/tmp')
expect(result.stdout).toContain('bar')
```

---

## Next Phase

After completing Phase 2, proceed to:
- **Phase 3**: Request Validation with Zod Schemas
