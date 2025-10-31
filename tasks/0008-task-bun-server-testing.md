# Task: Bun Server Testing Suite

**Priority**: 🔴 Critical
**Estimated Time**: 2-3 days
**Status**: ⏳ Pending
**Dependencies**: Phase 1-3 completed

---

## Overview

Implement comprehensive test coverage for the Bun HTTP Server to ensure code quality, reliability, and maintainability. This task focuses on achieving ≥80% test coverage across all core components and handlers.

**Current Status**:
- Test Coverage: ~20% (only basic tests exist)
- Target Coverage: ≥80%
- Missing: Most unit tests, integration tests, E2E tests

**Testing Strategy**:
- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete API workflows

---

## Parent Task

This task is part of Bun Server Phase 4 (Integration & Testing):
- [ ] **Phase 4.1**: Testing Suite (this task)
- [ ] Phase 4.2: Performance Testing
- [ ] Phase 4.3: Documentation

---

## Sub-tasks

### 1. Setup Testing Infrastructure ⏳

**Priority**: 🔴 Critical
**Estimated Time**: 2 hours

#### Tasks
- [ ] Create test directory structure
  ```
  packages/server/__tests__/
  ├── unit/
  │   ├── core/
  │   ├── handlers/
  │   ├── session/
  │   └── utils/
  ├── integration/
  │   ├── api/
  │   └── workflows/
  └── e2e/
      └── scenarios/
  ```
- [ ] Configure Vitest for Bun environment
  - [ ] Update `vitest.config.ts` for server package
  - [ ] Add test scripts to `package.json`
  - [ ] Configure coverage reporting
- [ ] Setup test utilities
  - [ ] Create `__tests__/helpers/test-server.ts` (test server helper)
  - [ ] Create `__tests__/helpers/mock-data.ts` (mock data generators)
  - [ ] Create `__tests__/helpers/assertions.ts` (custom assertions)
- [ ] Configure CI/CD test pipeline

**Acceptance Criteria**:
```bash
# All test commands work
bun test                    # Run all tests
bun test:unit              # Run unit tests
bun test:integration       # Run integration tests
bun test:coverage          # Generate coverage report
bun test:watch             # Watch mode for development
```

---

### 2. Core Architecture Tests ⏳

**Priority**: 🔴 Critical
**Estimated Time**: 6 hours

#### 2.1 ServiceContainer Tests
- [ ] File: `__tests__/unit/core/container.test.ts`
- [ ] Test service registration
  ```typescript
  test('should register and retrieve service', () => {
    const container = new ServiceContainer()
    container.register('test', () => ({ value: 42 }))
    const service = container.get('test')
    expect(service.value).toBe(42)
  })
  ```
- [ ] Test lazy initialization (service created only once)
- [ ] Test `has()` method
- [ ] Test `clear()` method
- [ ] Test error handling (accessing non-existent service)
- [ ] Test singleton behavior

**Coverage Target**: ≥90%

#### 2.2 Router Tests
- [ ] File: `__tests__/unit/core/router.test.ts`
- [ ] Test route registration
  ```typescript
  test('should match route with path parameters', () => {
    const router = new Router()
    router.register('GET', '/files/:path', handler)
    const match = router.match('GET', '/files/app.js')
    expect(match).toBeDefined()
    expect(match.params.path).toBe('app.js')
  })
  ```
- [ ] Test HTTP method matching (GET, POST, PUT, DELETE)
- [ ] Test path parameter extraction (`/files/:path`)
- [ ] Test query parameter parsing (`?encoding=utf8`)
- [ ] Test 404 handling (no route match)
- [ ] Test multiple routes with same path different methods
- [ ] Test wildcard routes

**Coverage Target**: ≥90%

#### 2.3 Middleware Tests
- [ ] File: `__tests__/unit/core/middleware.test.ts`
- [ ] Test CORS middleware
  ```typescript
  test('CORS middleware adds correct headers', async () => {
    const middleware = corsMiddleware()
    const response = await middleware(request, next)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
  ```
- [ ] Test logger middleware (trace ID generation)
- [ ] Test error handler middleware (catch exceptions)
- [ ] Test middleware chain execution order
- [ ] Test middleware short-circuit (early return)
- [ ] Test middleware error propagation

**Coverage Target**: ≥85%

#### 2.4 Response Builder Tests
- [ ] File: `__tests__/unit/core/response-builder.test.ts`
- [ ] Test success responses
  ```typescript
  test('successResponse returns 200 with data', () => {
    const response = successResponse({ message: 'OK' })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })
  ```
- [ ] Test error responses (different error codes)
- [ ] Test 404 responses
- [ ] Test validation error responses (Zod errors)
- [ ] Test custom status codes
- [ ] Test response headers

**Coverage Target**: ≥90%

#### 2.5 Validation Middleware Tests
- [ ] File: `__tests__/unit/core/validation-middleware.test.ts`
- [ ] Test request body validation
- [ ] Test query parameter validation
- [ ] Test path parameter validation
- [ ] Test validation error formatting
- [ ] Test successful validation
- [ ] Test optional fields handling

**Coverage Target**: ≥85%

---

### 3. Handler Tests ⏳

**Priority**: 🔴 Critical
**Estimated Time**: 8 hours

#### 3.1 FileHandler Tests
- [ ] File: `__tests__/unit/handlers/files.test.ts`
- [ ] Test file read operations
  ```typescript
  test('handleReadFile reads existing file', async () => {
    const handler = new FileHandler(workspacePath, fileWatcher, logger)
    const response = await handler.handleReadFile({
      path: 'test.txt',
      encoding: 'utf8'
    })
    expect(response.status).toBe(200)
  })
  ```
- [ ] Test file write operations
- [ ] Test file delete operations
- [ ] Test batch upload
- [ ] Test path validation (directory traversal prevention)
- [ ] Test encoding handling (utf8, base64, binary)
- [ ] Test file not found errors
- [ ] Test permission errors
- [ ] Test large file handling
- [ ] Test file watcher integration

**Coverage Target**: ≥80%

#### 3.2 ProcessHandler Tests
- [ ] File: `__tests__/unit/handlers/process.test.ts`
- [ ] Test command execution
  ```typescript
  test('handleExec executes command successfully', async () => {
    const handler = new ProcessHandler(tracker, logger)
    const response = await handler.handleExec({
      command: 'echo',
      args: ['hello']
    })
    const data = await response.json()
    expect(data.data.exitCode).toBe(0)
    expect(data.data.stdout).toContain('hello')
  })
  ```
- [ ] Test process status retrieval
- [ ] Test process termination
- [ ] Test process list
- [ ] Test process logs
- [ ] Test timeout handling
- [ ] Test error handling (invalid command)
- [ ] Test environment variables
- [ ] Test working directory

**Coverage Target**: ≥80%

#### 3.3 SessionHandler Tests
- [ ] File: `__tests__/unit/handlers/session.test.ts`
- [ ] Test session creation
  ```typescript
  test('handleCreateSession creates new session', async () => {
    const handler = new SessionHandler(sessionManager, logger)
    const response = await handler.handleCreateSession({
      workingDir: '/workspace',
      shell: '/bin/sh'
    })
    const data = await response.json()
    expect(data.data.id).toBeDefined()
    expect(data.data.status).toBe('active')
  })
  ```
- [ ] Test session execution
- [ ] Test session list
- [ ] Test session termination
- [ ] Test environment variable updates
- [ ] Test directory changes
- [ ] Test session not found errors
- [ ] Test concurrent sessions

**Coverage Target**: ≥80%

#### 3.4 HealthHandler Tests
- [ ] File: `__tests__/unit/handlers/health.test.ts`
- [ ] Test basic health check
- [ ] Test detailed health info
- [ ] Test metrics collection
- [ ] Test system monitoring
- [ ] Test health status calculation

**Coverage Target**: ≥85%

#### 3.5 WebSocketHandler Tests
- [ ] File: `__tests__/unit/handlers/websocket.test.ts`
- [ ] Test WebSocket connection
- [ ] Test file watch subscription
- [ ] Test file change notifications
- [ ] Test unwatch functionality
- [ ] Test connection cleanup
- [ ] Test multiple clients
- [ ] Test error handling

**Coverage Target**: ≥75%

---

### 4. Utility Tests ⏳

**Priority**: 🟡 Medium
**Estimated Time**: 4 hours

#### 4.1 ProcessTracker Tests
- [ ] File: `__tests__/unit/utils/process-tracker.test.ts`
- [ ] Test process registration
  ```typescript
  test('ProcessTracker tracks process lifecycle', async () => {
    const tracker = new ProcessTracker()
    const process = Bun.spawn(['sleep', '1'])
    const id = tracker.register('test-cmd', process, '/workspace')
    
    expect(tracker.get(id)).toBeDefined()
    expect(tracker.get(id).status).toBe('running')
  })
  ```
- [ ] Test process completion detection
- [ ] Test process output capture
- [ ] Test process logs retrieval
- [ ] Test process termination
- [ ] Test automatic cleanup
- [ ] Test process list filtering
- [ ] Test concurrent process tracking

**Coverage Target**: ≥85%

#### 4.2 PathValidator Tests
- [ ] File: `__tests__/unit/utils/path-validator.test.ts`
- [ ] Test valid path validation
- [ ] Test directory traversal prevention
  ```typescript
  test('validatePath rejects directory traversal', () => {
    expect(() => {
      validatePath('../etc/passwd', '/workspace')
    }).toThrow('Path traversal detected')
  })
  ```
- [ ] Test absolute path handling
- [ ] Test path normalization
- [ ] Test content type detection
- [ ] Test edge cases (empty path, null, undefined)

**Coverage Target**: ≥90%

#### 4.3 FileWatcher Tests
- [ ] File: `__tests__/unit/utils/file-watcher.test.ts`
- [ ] Test watch registration
- [ ] Test file change detection
- [ ] Test unwatch functionality
- [ ] Test multiple watchers
- [ ] Test event filtering
- [ ] Test lazy initialization
- [ ] Test cleanup on last unsubscribe

**Coverage Target**: ≥75%

---

### 5. Session Management Tests ⏳

**Priority**: 🟡 Medium
**Estimated Time**: 4 hours

#### 5.1 SessionManager Tests
- [ ] File: `__tests__/unit/session/manager.test.ts`
- [ ] Test session creation with various configs
- [ ] Test session retrieval
- [ ] Test session list
- [ ] Test session termination
- [ ] Test environment updates
- [ ] Test automatic cleanup (idle sessions)
- [ ] Test session ID generation uniqueness
- [ ] Test concurrent session management

**Coverage Target**: ≥85%

#### 5.2 Session Tests
- [ ] File: `__tests__/unit/session/session.test.ts`
- [ ] Test session initialization
- [ ] Test command execution
- [ ] Test output capture
- [ ] Test environment variable updates
- [ ] Test directory changes
- [ ] Test session termination
- [ ] Test command timeout
- [ ] Test shell initialization errors

**Coverage Target**: ≥80%

---

### 6. Integration Tests ⏳

**Priority**: 🟡 Medium
**Estimated Time**: 6 hours

#### 6.1 API Integration Tests
- [ ] File: `__tests__/integration/api/file-operations.test.ts`
- [ ] Test complete file upload → read → delete workflow
  ```typescript
  test('file operations workflow', async () => {
    // Write file
    const writeRes = await fetch('http://localhost:3000/files/write', {
      method: 'POST',
      body: JSON.stringify({ path: 'test.txt', content: 'hello' })
    })
    expect(writeRes.status).toBe(200)
    
    // Read file
    const readRes = await fetch('http://localhost:3000/files/read', {
      method: 'POST',
      body: JSON.stringify({ path: 'test.txt' })
    })
    const data = await readRes.json()
    expect(data.data.content).toContain('hello')
    
    // Delete file
    const deleteRes = await fetch('http://localhost:3000/files/delete', {
      method: 'POST',
      body: JSON.stringify({ path: 'test.txt' })
    })
    expect(deleteRes.status).toBe(200)
  })
  ```
- [ ] Test batch file operations
- [ ] Test concurrent file operations
- [ ] Test file watching integration

#### 6.2 Process Integration Tests
- [ ] File: `__tests__/integration/api/process-execution.test.ts`
- [ ] Test execute → status → logs workflow
- [ ] Test multiple concurrent processes
- [ ] Test process termination
- [ ] Test long-running processes

#### 6.3 Session Integration Tests
- [ ] File: `__tests__/integration/api/session-workflow.test.ts`
- [ ] Test create → execute → terminate workflow
- [ ] Test environment persistence
- [ ] Test directory navigation
- [ ] Test multiple sessions

**Coverage Target**: All critical workflows tested

---

### 7. E2E Tests ⏳

**Priority**: 🟢 Low
**Estimated Time**: 4 hours

#### 7.1 Real-world Scenarios
- [ ] File: `__tests__/e2e/scenarios/deployment-workflow.test.ts`
- [ ] Test complete deployment scenario
  ```typescript
  test('deploy Node.js application', async () => {
    // 1. Upload package.json
    // 2. Upload source files
    // 3. Execute npm install
    // 4. Execute npm test
    // 5. Execute npm start
    // 6. Verify process is running
  })
  ```
- [ ] Test development workflow (edit → test → run)
- [ ] Test CI/CD simulation
- [ ] Test error recovery scenarios

**Coverage Target**: Major use cases covered

---

## Testing Infrastructure

### Test Helpers

Create `__tests__/helpers/test-server.ts`:
```typescript
export class TestServer {
  private server: any
  
  async start(port: number = 3001) {
    // Start server on test port
  }
  
  async stop() {
    // Cleanup and stop server
  }
  
  async request(method: string, path: string, body?: any) {
    // Helper for making requests
  }
}
```

Create `__tests__/helpers/mock-data.ts`:
```typescript
export const mockFileRequest = (overrides = {}) => ({
  path: 'test.txt',
  content: 'hello world',
  encoding: 'utf8',
  ...overrides
})

export const mockProcessRequest = (overrides = {}) => ({
  command: 'echo',
  args: ['hello'],
  cwd: '/workspace',
  ...overrides
})
```

Create `__tests__/helpers/assertions.ts`:
```typescript
export function assertSuccessResponse(response: Response) {
  expect(response.status).toBe(200)
  const data = await response.json()
  expect(data.success).toBe(true)
}

export function assertErrorResponse(response: Response, errorCode: string) {
  const data = await response.json()
  expect(data.success).toBe(false)
  expect(data.error.code).toBe(errorCode)
}
```

---

## Files to Create/Modify

### Test Files Structure
```
packages/server/__tests__/
├── helpers/
│   ├── test-server.ts           # Test server helper
│   ├── mock-data.ts             # Mock data generators
│   └── assertions.ts            # Custom assertions
│
├── unit/
│   ├── core/
│   │   ├── container.test.ts    # ServiceContainer tests
│   │   ├── router.test.ts       # Router tests
│   │   ├── middleware.test.ts   # Middleware tests
│   │   ├── response-builder.test.ts
│   │   └── validation-middleware.test.ts
│   │
│   ├── handlers/
│   │   ├── files.test.ts        # FileHandler tests
│   │   ├── process.test.ts      # ProcessHandler tests
│   │   ├── session.test.ts      # SessionHandler tests
│   │   ├── health.test.ts       # HealthHandler tests
│   │   └── websocket.test.ts    # WebSocketHandler tests
│   │
│   ├── session/
│   │   ├── manager.test.ts      # SessionManager tests
│   │   └── session.test.ts      # Session tests
│   │
│   └── utils/
│       ├── process-tracker.test.ts
│       ├── path-validator.test.ts
│       └── file-watcher.test.ts
│
├── integration/
│   └── api/
│       ├── file-operations.test.ts
│       ├── process-execution.test.ts
│       └── session-workflow.test.ts
│
└── e2e/
    └── scenarios/
        ├── deployment-workflow.test.ts
        └── development-workflow.test.ts
```

### Configuration Files
- [ ] Update `vitest.config.ts`
- [ ] Update `package.json` (test scripts)
- [ ] Create `.coveragerc` (coverage config)

---

## Acceptance Criteria

### Code Coverage
- [ ] Overall coverage ≥80%
- [ ] Core architecture coverage ≥85%
- [ ] Handlers coverage ≥80%
- [ ] Utils coverage ≥85%

### Test Quality
- [ ] All tests pass consistently
- [ ] No flaky tests
- [ ] Tests run in <30 seconds
- [ ] Clear test descriptions
- [ ] Proper test isolation (no side effects)

### CI/CD Integration
- [ ] Tests run automatically on PR
- [ ] Coverage report generated
- [ ] Failed tests block merge
- [ ] Test results visible in CI dashboard

### Documentation
- [ ] Testing guide in README
- [ ] Test naming conventions documented
- [ ] How to run tests documented
- [ ] How to add new tests documented

---

## Success Metrics

**Quantitative**:
- ✅ Test coverage ≥80%
- ✅ All critical paths have tests
- ✅ Test suite runs in <30s
- ✅ 0 flaky tests

**Qualitative**:
- ✅ Tests are readable and maintainable
- ✅ Easy to add new tests
- ✅ Good test isolation
- ✅ Helpful error messages

---

## Dependencies

**Required Before Starting**:
- ✅ Phase 1-3 completed (core functionality implemented)
- ✅ Vitest configured
- ✅ Test directory structure

**Blocks**:
- Phase 4.2: Performance Testing (needs basic tests)
- Phase 4.3: Documentation (needs tested code)

---

## Implementation Order

### Day 1: Infrastructure + Core (Priority 🔴)
1. Setup testing infrastructure (2h)
2. Core architecture tests (6h)

### Day 2: Handlers (Priority 🔴)
3. Handler tests (8h)

### Day 3: Utils + Integration (Priority 🟡)
4. Utility tests (4h)
5. Session management tests (4h)

### Optional: Integration + E2E (Priority 🟢)
6. Integration tests (6h)
7. E2E tests (4h)

---

## Testing Best Practices

### 1. Test Structure (AAA Pattern)
```typescript
test('description', () => {
  // Arrange: Setup test data
  const input = { path: 'test.txt' }
  
  // Act: Execute the code
  const result = handler.process(input)
  
  // Assert: Verify the result
  expect(result).toBeDefined()
})
```

### 2. Test Isolation
- Each test should be independent
- Use `beforeEach` for setup
- Use `afterEach` for cleanup
- Don't share state between tests

### 3. Mock External Dependencies
```typescript
const mockLogger = {
  info: vi.fn(),
  error: vi.fn()
}
```

### 4. Test Edge Cases
- Empty inputs
- Null/undefined values
- Very large inputs
- Concurrent operations
- Error conditions

### 5. Descriptive Test Names
```typescript
// ✅ Good
test('validatePath rejects directory traversal attempts')

// ❌ Bad
test('test1')
```

---

## Resources

### Documentation
- [Vitest Documentation](https://vitest.dev/)
- [Bun Testing Guide](https://bun.sh/docs/cli/test)
- Testing best practices guide

### Tools
- Vitest: Test runner
- Bun test: Native Bun testing
- Coverage reporters: v8, istanbul

---

## Notes

- Focus on high-value tests first (critical paths)
- Don't aim for 100% coverage, aim for meaningful tests
- Integration tests are more valuable than unit tests for catching bugs
- Keep tests fast (<30s total runtime)
- Test behavior, not implementation details

---

## Related Tasks

- 0003: Phase 1 - Core Architecture (completed)
- 0004: Phase 2 - Core Handlers (completed)
- 0005: Phase 3 - Request Validation (completed)
- 0009: SDK Examples (pending)
- 0010: SDK-Server Integration (pending)

