# DevBox SDK Server API Documentation

Welcome to the DevBox SDK Server API documentation. This document provides comprehensive information about all available API endpoints, their usage, and examples.

## Overview

The DevBox SDK Server provides a comprehensive HTTP API for managing processes, sessions, files, and real-time monitoring capabilities. The server is built in Rust and follows RESTful principles with support for real-time communication via WebSockets.

## Key Features

- **File Operations**: Complete CRUD operations with smart routing
  - JSON mode for text and small files with optional base64 encoding
  - Binary streaming mode for large files and media
  - Multipart FormData mode for browser-native uploads
  - Multiple upload methods: multipart, JSON, or direct binary
  - File search by filename (case-insensitive pattern matching)
  - File content search (unordered results, binary-skipping)
  - Replace in files (UTF-8 text only; binaries skipped)
- **Process Management**: Execute processes synchronously or asynchronously with comprehensive log monitoring
- **Session Management**: Create and manage interactive shell sessions with environment and directory management
- **Real-time Communication**: WebSocket connections for live log streaming and event subscriptions
- **Health Monitoring**: Built-in health check and readiness endpoints for service monitoring
- **Security**: Bearer token authentication for all sensitive operations

## Quick Start

### Prerequisites

- Bearer token for authentication
- HTTP client or API testing tool

### Basic Usage

**Note**: The default port is `:9757`, which can be changed via the `ADDR` environment variable or `-addr` flag.

1. **Health Check** (No authentication required):
   ```bash
   curl -X GET http://localhost:9757/health
   ```

2. **File Operations** (With authentication):
   ```bash
   # Write a text file (JSON mode)
   curl -X POST http://localhost:9757/api/v1/files/write \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"path": "/tmp/hello.txt", "content": "Hello, World!"}'

   # Upload binary file (Binary mode - optimal for large files)
   curl -X POST http://localhost:9757/api/v1/files/write?path=/tmp/image.png \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: image/png" \
     --data-binary @image.png

   # Upload with FormData (Multipart mode - browser-compatible)
   curl -X POST http://localhost:9757/api/v1/files/write \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "file=@document.pdf" \
     -F "path=/tmp/document.pdf"

   # Read a file
   curl -X GET "http://localhost:9757/api/v1/files/read?path=/tmp/hello.txt" \
     -H "Authorization: Bearer YOUR_TOKEN"

   # Search files by filename
   curl -X POST http://localhost:9757/api/v1/files/search \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"dir": ".", "pattern": "config"}'

   # Find files by content
   curl -X POST http://localhost:9757/api/v1/files/find \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"dir": ".", "keyword": "TODO"}'

   # Replace text in files
   curl -X POST http://localhost:9757/api/v1/files/replace \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"files": ["/tmp/hello.txt"], "from": "Hello", "to": "Hi"}'
   ```

3. **Process Management**:
   ```bash
   # Execute a command asynchronously
   curl -X POST http://localhost:9757/api/v1/process/exec \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"command": "ls", "args": ["-la", "/tmp"]}'
   ```

4. **Session Management**:
   ```bash
   # Create a session
   curl -X POST http://localhost:9757/api/v1/sessions/create \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"workingDir": "/home/user", "shell": "/bin/bash"}'
   ```

## Authentication

All API endpoints (except health checks) require Bearer token authentication:

```http
Authorization: Bearer <your-token>
```

Include this header in all authenticated requests.

## Configuration

The server can be configured using environment variables or command-line flags:

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADDR` | `0.0.0.0:9757` | Server listening address |
| `WORKSPACE_PATH` | `/home/devbox/project` | Base workspace directory |
| `MAX_FILE_SIZE` | `104857600` (100MB) | Maximum file size in bytes |
| `TOKEN` | (auto-generated) | Authentication token |
| `DEVBOX_JWT_SECRET` | - | Alternative token source (fallback) |
| `MAX_CONCURRENT_READS` | `CPU cores × 2` (1-32) | Concurrent file reads for search/replace |

### Command-Line Flags

```bash
devbox-sdk-server \
  --addr=0.0.0.0:8080 \
  --workspace-path=/custom/path \
  --max-file-size=52428800 \
  --token=your_secret_token \
  --max-concurrent-reads=16
```

**Note**: Command-line flags override environment variables.

**Concurrency Auto-tuning**:
- Automatically detects CPU limits in containers (Kubernetes, Docker)
- Defaults to `2 × CPU cores` for I/O-bound file operations
- Clamped between 1 and 32 to prevent resource exhaustion
- Example: 4 CPU cores → 8 concurrent reads

## API Structure

The API is organized into several main categories:

- **Health**: `/health` - Service health and readiness checks
- **Files**: `/api/v1/files/*` - File operations and management
- **Processes**: `/api/v1/process/*` - Process execution and monitoring
- **Sessions**: `/api/v1/sessions/*` - Interactive session management
- **WebSocket**: `/ws` - Real-time log streaming and events

## Documentation Files

- [OpenAPI Specification](./openapi.yaml) - Complete API specification in OpenAPI 3.1.0 format
- [Examples Guide](./examples.md) - Detailed usage examples for common scenarios
- [WebSocket Protocol](./websocket.md) - WebSocket communication protocol details
- [Error Handling](./errors.md) - Error codes and handling strategies

## Error Handling

The API uses standard HTTP status codes and returns consistent error responses:

```json
{
  "status": 1400,
  "message": "Error description",
  "data": {}
}
```

Common HTTP status codes:
- `200` - Success (with internal status code)
- `500` - Internal server error (Panic)

See [Error Handling](./errors.md) for details on internal status codes (14xx, 15xx).

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/labring/devbox-sdk).