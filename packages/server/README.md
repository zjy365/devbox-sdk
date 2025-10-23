# @sealos/devbox-server

HTTP Server for Sealos Devbox runtime built with Bun.

## Overview

This server provides a high-performance HTTP API for Devbox containers, enabling file operations, process execution, and real-time file watching.

## Features

- **File Operations**: Read, write, and batch file operations
- **Process Management**: Execute commands and monitor processes
- **Real-time Watching**: WebSocket-based file change notifications
- **Bun Runtime**: High-performance JavaScript runtime
- **Security**: Path validation and input sanitization

## API Endpoints

### Health Check
- `GET /health` - Server health status

### File Operations
- `POST /files/write` - Write files
- `GET /POST /files/read` - Read files
- `POST /files/batch-upload` - Batch upload files
- `DELETE /POST /files/delete` - Delete files

### Process Management
- `POST /process/exec` - Execute commands
- `GET /process/status?pid=<id>` - Get process status

### WebSocket
- `WS /` - Real-time file watching

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `WORKSPACE_PATH` | `/workspace` | Workspace directory |
| `ENABLE_CORS` | `false` | Enable CORS |
| `MAX_FILE_SIZE` | `104857600` | Max file size (100MB) |

## Usage

```bash
# Development
bun run dev

# Start (production)
bun run start

# Or directly
bun run src/index.ts
```

## Docker Usage

```bash
# Build image
docker build -t devbox-server .

# Run container
docker run -p 3000:3000 -v /workspace:/workspace devbox-server
```