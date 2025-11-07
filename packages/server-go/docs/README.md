# DevBox SDK Server API Documentation

Welcome to the DevBox SDK Server API documentation. This document provides comprehensive information about all available API endpoints, their usage, and examples.

## Overview

The DevBox SDK Server provides a comprehensive HTTP API for managing processes, sessions, files, and real-time monitoring capabilities. The server is built in Go and follows RESTful principles with support for real-time communication via WebSockets.

## Key Features

- **File Operations**: Complete CRUD operations for files with security constraints
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

1. **Health Check** (No authentication required):
   ```bash
   curl -X GET http://localhost:8080/health
   ```

2. **File Operations** (With authentication):
   ```bash
   # Write a file
   curl -X POST http://localhost:8080/api/v1/files/write \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"path": "/tmp/hello.txt", "content": "Hello, World!"}'

   # Read a file
   curl -X POST http://localhost:8080/api/v1/files/read \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"path": "/tmp/hello.txt"}'
   ```

3. **Process Management**:
   ```bash
   # Execute a command asynchronously
   curl -X POST http://localhost:8080/api/v1/process/exec \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"command": "ls", "args": ["-la", "/tmp"]}'
   ```

4. **Session Management**:
   ```bash
   # Create a session
   curl -X POST http://localhost:8080/api/v1/sessions/create \
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

## API Structure

The API is organized into several main categories:

- **Health**: `/health` - Service health and readiness checks
- **Files**: `/api/v1/files/*` - File operations and management
- **Processes**: `/api/v1/process/*` - Process execution and monitoring
- **Sessions**: `/api/v1/sessions/*` - Interactive session management
- **WebSocket**: `/ws` - Real-time log streaming and events

## Documentation Files

- [OpenAPI Specification](./openapi.yaml) - Complete API specification in OpenAPI 3.0 format
- [Examples Guide](./examples.md) - Detailed usage examples for common scenarios
- [WebSocket Protocol](./websocket.md) - WebSocket communication protocol details
- [Error Handling](./errors.md) - Error codes and handling strategies

## Error Handling

The API uses standard HTTP status codes and returns consistent error responses:

```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "timestamp": 1640995200000
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request
- `401` - Unauthorized
- `404` - Not found
- `409` - Conflict
- `500` - Internal server error


## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/labring/devbox-sdk).