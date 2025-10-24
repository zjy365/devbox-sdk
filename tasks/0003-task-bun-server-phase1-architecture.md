# Task: Bun Server Phase 1 - Core Architecture

**Priority**: 🔴 Critical
**Estimated Time**: 2-3 hours
**Status**: Not Started

---

## Overview

Implement the foundational architecture for the Bun HTTP Server following Cloudflare Sandbox SDK patterns:
- Dependency Injection Container
- Router System with Pattern Matching
- Middleware Pipeline
- Response Builder

This establishes the architectural foundation that all handlers will build upon.

---

## Parent Task
- [ ] Phase 1: Core Architecture (2-3 hours)

---

## Sub-tasks

### 1.1 Create Dependency Injection Container
- [ ] Create file: `packages/server/src/core/container.ts`
- [ ] Implement `ServiceContainer` class
  - [ ] `register<T>(name: string, factory: () => T): void` - Register a service factory
  - [ ] `get<T>(name: string): T` - Get service instance (lazy initialization)
  - [ ] `has(name: string): boolean` - Check if service exists
  - [ ] `clear(): void` - Clear all services (for testing)
- [ ] Add TypeScript types for container
- [ ] Write unit tests: `packages/server/__tests__/core/container.test.ts`

**Acceptance Criteria**:
```typescript
const container = new ServiceContainer()
container.register('logger', () => createLogger())
const logger = container.get('logger')
expect(logger).toBeDefined()
```

---

### 1.2 Create Router System
- [ ] Create file: `packages/server/src/core/router.ts`
- [ ] Implement `Router` class
  - [ ] `register(method: string, pattern: string, handler: RouteHandler): void`
  - [ ] `match(method: string, path: string): RouteMatch | null`
  - [ ] Support for path parameters (e.g., `/process/:id`)
  - [ ] Support for query parameters
- [ ] Implement route handler type
- [ ] Write unit tests: `packages/server/__tests__/core/router.test.ts`

**Acceptance Criteria**:
```typescript
const router = new Router()
router.register('GET', '/files/:path', fileHandler)
const match = router.match('GET', '/files/app.js')
expect(match).toBeDefined()
expect(match.params.path).toBe('app.js')
```

---

### 1.3 Create Middleware System
- [ ] Create file: `packages/server/src/core/middleware.ts`
- [ ] Implement middleware types
  - [ ] `Middleware = (req: Request, next: NextFunction) => Promise<Response>`
- [ ] Create core middlewares:
  - [ ] `corsMiddleware()` - CORS headers
  - [ ] `loggerMiddleware()` - Request logging with TraceID
  - [ ] `errorHandlerMiddleware()` - Catch and format errors
- [ ] Implement middleware chain executor
- [ ] Write unit tests: `packages/server/__tests__/core/middleware.test.ts`

**Acceptance Criteria**:
```typescript
const middlewares = [
  loggerMiddleware(),
  corsMiddleware(),
  errorHandlerMiddleware()
]
const response = await executeMiddlewares(request, middlewares)
```

---

### 1.4 Create Response Builder
- [ ] Create file: `packages/server/src/core/response-builder.ts`
- [ ] Implement response helper functions
  - [ ] `successResponse<T>(data: T, status?: number): Response`
  - [ ] `errorResponse(error: DevboxError): Response`
  - [ ] `notFoundResponse(message: string): Response`
  - [ ] `validationErrorResponse(errors: ZodError): Response`
- [ ] Integrate with `@sealos/devbox-shared/errors`
- [ ] Write unit tests: `packages/server/__tests__/core/response-builder.test.ts`

**Acceptance Criteria**:
```typescript
const response = successResponse({ message: 'OK' })
expect(response.status).toBe(200)

const error = new DevboxError('Not found', ErrorCode.FILE_NOT_FOUND)
const errorResp = errorResponse(error)
expect(errorResp.status).toBe(404)
```

---

### 1.5 Integrate Container with Router
- [ ] Update `Router` to accept `ServiceContainer` in constructor
- [ ] Handlers can access services through container
- [ ] Create helper method: `router.getService<T>(name: string): T`
- [ ] Write integration tests

**Acceptance Criteria**:
```typescript
const container = new ServiceContainer()
container.register('fileHandler', () => new FileHandler())

const router = new Router(container)
router.register('POST', '/files/write', async (req) => {
  const handler = router.getService<FileHandler>('fileHandler')
  return handler.handleWriteFile(req)
})
```

---

## Testing Requirements

**Unit Tests** (`bun test`):
- [ ] ServiceContainer: register, get, has, clear
- [ ] Router: register, match, path params, query params
- [ ] Middleware: CORS, logger, error handler
- [ ] ResponseBuilder: success, error, validation responses

**Coverage Target**: ≥80%

---

## Files to Create

```
packages/server/src/core/
├── container.ts           # DI Container
├── router.ts              # Router System
├── middleware.ts          # Middleware Pipeline
└── response-builder.ts    # Response Helpers

packages/server/__tests__/core/
├── container.test.ts
├── router.test.ts
├── middleware.test.ts
└── response-builder.test.ts
```

---

## Dependencies

**From @sealos/devbox-shared**:
- `import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'`
- `import { createLogger } from '@sealos/devbox-shared/logger'`

**Bun APIs**:
- `Request`, `Response` from Bun

**External**:
- `zod` (for validation middleware)

---

## Example Implementation

### ServiceContainer

```typescript
export class ServiceContainer {
  private services = new Map<string, { factory: () => any; instance: any }>()

  register<T>(name: string, factory: () => T): void {
    this.services.set(name, { factory, instance: null })
  }

  get<T>(name: string): T {
    const service = this.services.get(name)
    if (!service) {
      throw new Error(`Service "${name}" not found`)
    }
    if (!service.instance) {
      service.instance = service.factory()
    }
    return service.instance as T
  }

  has(name: string): boolean {
    return this.services.has(name)
  }

  clear(): void {
    this.services.clear()
  }
}
```

### Router

```typescript
export class Router {
  private routes = new Map<string, Map<string, RouteHandler>>()

  constructor(private container?: ServiceContainer) {}

  register(method: string, pattern: string, handler: RouteHandler): void {
    if (!this.routes.has(method)) {
      this.routes.set(method, new Map())
    }
    this.routes.get(method)!.set(pattern, handler)
  }

  match(method: string, path: string): RouteMatch | null {
    const methodRoutes = this.routes.get(method)
    if (!methodRoutes) return null

    for (const [pattern, handler] of methodRoutes) {
      const params = this.matchPattern(pattern, path)
      if (params !== null) {
        return { handler, params }
      }
    }
    return null
  }

  private matchPattern(pattern: string, path: string): Record<string, string> | null {
    // Simple pattern matching with :param support
    const patternParts = pattern.split('/')
    const pathParts = path.split('/')

    if (patternParts.length !== pathParts.length) return null

    const params: Record<string, string> = {}
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i]
      } else if (patternParts[i] !== pathParts[i]) {
        return null
      }
    }
    return params
  }

  getService<T>(name: string): T {
    if (!this.container) {
      throw new Error('Container not provided to router')
    }
    return this.container.get<T>(name)
  }
}
```

---

## Definition of Done

- [ ] All sub-tasks completed
- [ ] All unit tests passing (`bun test`)
- [ ] Test coverage ≥80%
- [ ] Code follows project style (biome)
- [ ] No TypeScript errors (`bun run typecheck`)
- [ ] Simple integration test works:

```typescript
// Integration test
const container = new ServiceContainer()
const router = new Router(container)
const middlewares = [loggerMiddleware(), errorHandlerMiddleware()]

router.register('GET', '/health', async () => {
  return successResponse({ status: 'ok' })
})

const response = await handleRequest(request, router, middlewares)
expect(response.status).toBe(200)
```

---

## Next Phase

After completing Phase 1, proceed to:
- **Phase 2**: Core Handlers Implementation (FileHandler, ProcessHandler, SessionHandler)
