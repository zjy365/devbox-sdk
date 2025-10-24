# Task: Bun Server Phase 3 - Request Validation

**Priority**: 🟡 Medium
**Estimated Time**: 2-3 hours
**Status**: Not Started

---

## Overview

Implement comprehensive request validation using Zod schemas for all API endpoints. This ensures type safety at runtime and provides clear error messages for invalid requests.

All validation schemas must match types from `@sealos/devbox-shared/types`.

---

## Parent Task
- [ ] Phase 3: Request Validation (2-3 hours)

---

## Sub-tasks

### 3.1 Create Zod Schemas for All Request Types
**Estimated**: 1-1.5 hours
**File**: `packages/server/src/validators/schemas.ts`

#### File Operation Schemas

- [ ] **WriteFileRequestSchema**
  ```typescript
  import { z } from 'zod'

  export const WriteFileRequestSchema = z.object({
    path: z.string().min(1),
    content: z.string(),
    encoding: z.enum(['utf8', 'base64', 'binary', 'hex']).optional(),
    permissions: z.string().optional()
  })
  ```

- [ ] **ReadFileRequestSchema**
  ```typescript
  export const ReadFileRequestSchema = z.object({
    path: z.string().min(1),
    encoding: z.enum(['utf8', 'base64', 'binary', 'hex']).optional()
  })
  ```

- [ ] **ListFilesRequestSchema**
  ```typescript
  export const ListFilesRequestSchema = z.object({
    path: z.string().min(1),
    recursive: z.boolean().optional(),
    includeHidden: z.boolean().optional()
  })
  ```

- [ ] **DeleteFileRequestSchema**
  ```typescript
  export const DeleteFileRequestSchema = z.object({
    path: z.string().min(1),
    recursive: z.boolean().optional()
  })
  ```

- [ ] **BatchUploadRequestSchema**
  ```typescript
  export const BatchUploadRequestSchema = z.object({
    files: z.array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
        encoding: z.enum(['utf8', 'base64', 'binary', 'hex']).optional()
      })
    ).min(1).max(100) // Limit: 100 files per batch
  })
  ```

#### Process Operation Schemas

- [ ] **ProcessExecRequestSchema**
  ```typescript
  export const ProcessExecRequestSchema = z.object({
    command: z.string().min(1).max(10000), // Max 10KB command
    shell: z.string().optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    timeout: z.number().int().min(1).max(600000).optional(), // Max 10 minutes
    sessionId: z.string().optional()
  })
  ```

- [ ] **StartProcessRequestSchema**
  ```typescript
  export const StartProcessRequestSchema = z.object({
    command: z.string().min(1).max(10000),
    shell: z.string().optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    sessionId: z.string().optional()
  })
  ```

- [ ] **KillProcessRequestSchema**
  ```typescript
  export const KillProcessRequestSchema = z.object({
    id: z.string().min(1),
    signal: z.string().optional()
  })
  ```

- [ ] **ProcessLogsRequestSchema**
  ```typescript
  export const ProcessLogsRequestSchema = z.object({
    id: z.string().min(1),
    tail: z.number().int().min(1).max(10000).optional(),
    follow: z.boolean().optional()
  })
  ```

#### Session Operation Schemas

- [ ] **CreateSessionRequestSchema**
  ```typescript
  export const CreateSessionRequestSchema = z.object({
    workingDir: z.string().optional(),
    env: z.record(z.string()).optional(),
    shell: z.string().optional()
  })
  ```

- [ ] **UpdateSessionEnvRequestSchema**
  ```typescript
  export const UpdateSessionEnvRequestSchema = z.object({
    id: z.string().min(1),
    env: z.record(z.string())
  })
  ```

- [ ] **TerminateSessionRequestSchema**
  ```typescript
  export const TerminateSessionRequestSchema = z.object({
    id: z.string().min(1)
  })
  ```

**Acceptance Criteria**:
```typescript
const result = WriteFileRequestSchema.safeParse({
  path: '/workspace/test.txt',
  content: 'Hello'
})
expect(result.success).toBe(true)

const invalid = WriteFileRequestSchema.safeParse({
  path: '',  // Invalid: empty path
  content: 'Hello'
})
expect(invalid.success).toBe(false)
```

---

### 3.2 Create Validation Middleware
**Estimated**: 30 minutes
**File**: `packages/server/src/core/validation-middleware.ts`

- [ ] **validateRequest**(schema: ZodSchema): Middleware
  - Parse request body as JSON
  - Validate against Zod schema
  - On success: attach validated data to request context
  - On failure: return 400 with detailed error messages

- [ ] **validateQueryParams**(schema: ZodSchema): Middleware
  - Parse query parameters from URL
  - Validate against Zod schema
  - On success: attach validated params to request context
  - On failure: return 400 with error details

**Implementation**:
```typescript
import { z } from 'zod'
import { validationErrorResponse } from './response-builder'

export function validateRequest<T extends z.ZodType>(
  schema: T
): (req: Request) => Promise<{ valid: true; data: z.infer<T> } | { valid: false; response: Response }> {
  return async (req: Request) => {
    try {
      const body = await req.json()
      const result = schema.safeParse(body)

      if (!result.success) {
        return {
          valid: false,
          response: validationErrorResponse(result.error)
        }
      }

      return { valid: true, data: result.data }
    } catch (error) {
      return {
        valid: false,
        response: Response.json(
          { error: 'Invalid JSON' },
          { status: 400 }
        )
      }
    }
  }
}

export function validateQueryParams<T extends z.ZodType>(
  schema: T
): (url: URL) => { valid: true; data: z.infer<T> } | { valid: false; response: Response } {
  return (url: URL) => {
    const params = Object.fromEntries(url.searchParams)
    const result = schema.safeParse(params)

    if (!result.success) {
      return {
        valid: false,
        response: validationErrorResponse(result.error)
      }
    }

    return { valid: true, data: result.data }
  }
}
```

**Acceptance Criteria**:
```typescript
const validator = validateRequest(WriteFileRequestSchema)
const result = await validator(request)

if (result.valid) {
  // result.data is fully typed
  const { path, content } = result.data
} else {
  // result.response is error response
  return result.response
}
```

---

### 3.3 Update Handlers to Use Validation
**Estimated**: 1 hour

- [ ] Update **FileHandler** methods
  - Add schema validation to each method
  - Remove manual type assertions
  - Use validated data with full type safety

- [ ] Update **ProcessHandler** methods
  - Add schema validation
  - Validate timeout ranges
  - Validate command length

- [ ] Update **SessionHandler** methods
  - Add schema validation
  - Validate session IDs

**Example**:
```typescript
// Before
async handleWriteFile(request: WriteFileRequest): Promise<Response> {
  const fullPath = this.resolvePath(request.path)
  // ...
}

// After
async handleWriteFile(request: Request): Promise<Response> {
  const validation = await validateRequest(WriteFileRequestSchema)(request)
  if (!validation.valid) {
    return validation.response
  }

  const { path, content, encoding } = validation.data
  const fullPath = this.resolvePath(path)
  // ...
}
```

---

### 3.4 Enhance Response Builder for Validation Errors
**Estimated**: 30 minutes
**File**: `packages/server/src/core/response-builder.ts`

- [ ] **validationErrorResponse**(error: ZodError): Response
  - Parse Zod errors into user-friendly format
  - Include field path and error message
  - Return 400 status code
  - Use `DevboxError` with `VALIDATION_ERROR` code

**Implementation**:
```typescript
import { z } from 'zod'
import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'

export function validationErrorResponse(error: z.ZodError): Response {
  const errors = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }))

  const devboxError = new DevboxError(
    'Request validation failed',
    ErrorCode.VALIDATION_ERROR,
    {
      details: {
        field: 'request',
        value: errors,
        constraint: 'schema_validation'
      }
    }
  )

  return errorResponse(devboxError)
}
```

**Acceptance Criteria**:
```typescript
const zodError = new z.ZodError([
  {
    code: 'too_small',
    minimum: 1,
    path: ['path'],
    message: 'String must contain at least 1 character(s)'
  }
])

const response = validationErrorResponse(zodError)
expect(response.status).toBe(400)

const body = await response.json()
expect(body.error.code).toBe('VALIDATION_ERROR')
expect(body.error.details).toBeDefined()
```

---

## Testing Requirements

**Unit Tests**:
- [ ] All Zod schemas validate correct data
- [ ] All Zod schemas reject invalid data
- [ ] Validation middleware handles valid requests
- [ ] Validation middleware returns proper errors
- [ ] Response builder formats validation errors correctly

**Integration Tests**:
- [ ] End-to-end validation flow
  - Send invalid request
  - Receive 400 with clear error message
  - Send valid request
  - Receive 200 with expected data

**Coverage Target**: ≥80%

---

## Files to Create/Update

```
packages/server/src/
├── validators/
│   └── schemas.ts                 # ⭐ New file - All Zod schemas
│
├── core/
│   ├── validation-middleware.ts   # ⭐ New file
│   └── response-builder.ts        # ✏️ Add validationErrorResponse
│
└── handlers/
    ├── files.ts                   # ✏️ Add validation
    ├── process.ts                 # ✏️ Add validation
    ├── session.ts                 # ✏️ Add validation
    └── health.ts                  # ✏️ Add validation (if needed)

packages/server/__tests__/validators/
└── schemas.test.ts                # ⭐ New file
```

---

## Dependencies

```typescript
import { z } from 'zod'
import { DevboxError, ErrorCode } from '@sealos/devbox-shared/errors'
import type { ValidationErrorContext } from '@sealos/devbox-shared/errors'
```

---

## Example Usage

### Complete Flow

```typescript
// In Router setup
router.register('POST', '/files/write', async (req) => {
  const validation = await validateRequest(WriteFileRequestSchema)(req)
  if (!validation.valid) {
    return validation.response
  }

  const fileHandler = router.getService<FileHandler>('fileHandler')
  return fileHandler.handleWriteFile(validation.data)
})

// Client receives
// Success: { success: true, path: '...', size: 123 }
// Error: {
//   error: {
//     code: 'VALIDATION_ERROR',
//     message: 'Request validation failed',
//     details: {
//       field: 'path',
//       constraint: 'min_length',
//       message: 'String must contain at least 1 character(s)'
//     }
//   }
// }
```

---

## Definition of Done

- [ ] All sub-tasks completed
- [ ] All Zod schemas created and tested
- [ ] Validation middleware implemented
- [ ] All handlers updated to use validation
- [ ] All tests passing
- [ ] Test coverage ≥80%
- [ ] No TypeScript errors
- [ ] Integration test: Invalid request → 400 with clear error

**Key Test**:
```typescript
// Send invalid request
const response = await fetch('http://localhost:3000/files/write', {
  method: 'POST',
  body: JSON.stringify({ path: '' }) // Invalid: empty path
})

expect(response.status).toBe(400)
const error = await response.json()
expect(error.error.code).toBe('VALIDATION_ERROR')
expect(error.error.details.field).toBe('path')
```

---

## Next Phase

After completing Phase 3, proceed to:
- **Phase 4**: Integration, Testing, and Server Refactoring
