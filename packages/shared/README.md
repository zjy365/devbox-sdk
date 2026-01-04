# devbox-shared

Shared types, errors, and utilities for Sealos Devbox SDK.

## Overview

This package provides the **single source of truth** for all type definitions, error codes, and utilities used across the Devbox SDK ecosystem. It ensures type consistency between the SDK client and Bun server.

## Features

### 🚨 Error System
- **Standardized error codes** with HTTP status mapping
- **Error contexts** providing detailed information
- **DevboxError class** with TraceID support
- **Error suggestions** for common issues

### 📦 Type Definitions
- **File operations**: Request/response types for file management
- **Process execution**: Types for command execution and process management
- **Session management**: Types for persistent shell sessions
- **Devbox lifecycle**: Types for Devbox creation, management, and monitoring
- **Server types**: Health checks, configuration, and metrics

### 📝 Logger
- **Structured logging** with multiple log levels
- **TraceID support** for distributed tracing
- **Child loggers** for context propagation
- **JSON and human-readable** output formats

## Installation

```bash
npm install devbox-shared
```

## Usage

### Error Handling

```typescript
import { DevboxError, ErrorCode } from 'devbox-shared/errors'

// Create a custom error
throw new DevboxError('File not found', ErrorCode.FILE_NOT_FOUND, {
  details: {
    path: '/workspace/file.txt',
    operation: 'read'
  },
  traceId: 'trace_abc123'
})

// Convert to error response
const errorResponse = error.toResponse()
// {
//   error: {
//     message: 'File not found',
//     code: 'FILE_NOT_FOUND',
//     httpStatus: 404,
//     details: { path: '/workspace/file.txt', operation: 'read' },
//     suggestion: 'Check that the file path is correct and the file exists',
//     traceId: 'trace_abc123'
//   }
// }
```

### Type Definitions

```typescript
import type {
  WriteFileRequest,
  ProcessExecRequest,
  SessionInfo,
  DevboxInfo
} from '@sealos/devbox-shared/types'

const writeRequest: WriteFileRequest = {
  path: '/workspace/app.js',
  content: 'console.log("Hello")',
  encoding: 'utf8'
}

const execRequest: ProcessExecRequest = {
  command: 'npm install',
  cwd: '/workspace',
  timeout: 30000,
  sessionId: 'session_123'
}
```

### Logging

```typescript
import { createLogger, createTraceContext } from 'devbox-shared/logger'

const logger = createLogger({
  level: 'info',
  enableConsole: true,
  enableJson: false
})

// Set trace context
const traceContext = createTraceContext()
logger.setTraceContext(traceContext)

// Log with trace information
logger.info('Processing file upload', {
  fileName: 'app.js',
  size: 1024
})
// Output: [2025-01-23T10:30:00.000Z] INFO: [trace:trace_abc123] Processing file upload {"fileName":"app.js","size":1024}

// Create child logger
const childLogger = logger.child({ spanId: 'span_456' })
childLogger.debug('Starting validation')
```

## Package Structure

```
src/
├── errors/
│   ├── codes.ts       # Error code definitions and HTTP status mapping
│   ├── context.ts     # Error context interfaces
│   ├── response.ts    # ErrorResponse and DevboxError class
│   └── index.ts       # Public exports
├── types/
│   ├── file.ts        # File operation types
│   ├── process.ts     # Process execution types
│   ├── session.ts     # Session management types
│   ├── devbox.ts      # Devbox lifecycle types
│   ├── server.ts      # Server-specific types
│   └── index.ts       # Public exports
└── logger/
    ├── trace.ts       # TraceID generation and management
    ├── logger.ts      # Logger implementation
    └── index.ts       # Public exports
```

## Sub-path Exports

This package uses sub-path exports for better tree-shaking:

```typescript
// Import only what you need
import { DevboxError, ErrorCode } from 'devbox-shared/errors'
import type { WriteFileRequest } from 'devbox-shared/types'
import { createLogger } from 'devbox-shared/logger'
```

## Type Safety

All types are fully typed with TypeScript strict mode:
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`

## License

Apache-2.0
