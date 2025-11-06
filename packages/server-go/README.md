# DevBox Server (Go)

A lightweight, production-ready Go server designed for local development environments. It provides comprehensive capabilities for file operations, process management, interactive shell sessions, real-time WebSocket communication, and health monitoring. The server follows a clean architecture with no Docker dependencies and minimal configuration requirements.

## 🚀 Features

### Core Capabilities
- **File Management**: Read, write, delete, list files with batch upload support
- **Process Control**: Execute, monitor, terminate processes with comprehensive logging
- **Shell Sessions**: Interactive shell sessions with environment management and directory navigation
- **Real-time Communication**: WebSocket-based log streaming and event notifications
- **Health Monitoring**: Multiple health check endpoints for monitoring and readiness probes

### Architecture Highlights
- **Clean Architecture**: Modular design with clear separation of concerns
- **Dependency Injection**: Proper initialization without global state
- **Security**: Authentication, path validation, and input sanitization
- **Observability**: Structured logging with trace ID tracking
- **Production Ready**: Graceful shutdown, optimized builds, and comprehensive testing

## 📋 Prerequisites
- **Go 1.25+** - Modern Go version with latest features
- **Git** - For cloning and version management

## 🏗️ Project Architecture

```
packages/server-go/
├── cmd/server/                 # Application entry point
│   └── main.go                 # Main application lifecycle and setup
├── internal/server/            # Server initialization and dependency injection
│   ├── server.go               # Main server struct and middleware setup
│   └── handlers.go             # Route registration and handler instantiation
├── pkg/
│   ├── config/                 # Configuration management
│   │   └── config.go           # Flags, environment variables, defaults
│   ├── errors/                 # Error handling and API responses
│   │   └── errors.go           # Structured error types and helpers
│   ├── handlers/               # HTTP/WebSocket handlers
│   │   ├── common/             # Shared types and utilities
│   │   │   ├── common.go       # Generic response helpers
│   │   │   └── types.go        # WebSocket and log types
│   │   ├── file/               # File operation handlers
│   │   │   ├── handler.go      # Handler struct
│   │   │   ├── manage.go       # File operations (read/write/delete/list)
│   │   │   ├── upload.go       # Batch file upload
│   │   │   └── utils.go        # Path validation and security
│   │   ├── process/            # Process management handlers
│   │   │   ├── handler.go      # Process handler struct
│   │   │   ├── manage.go       # Process lifecycle management
│   │   │   ├── exec.go         # Process execution
│   │   │   ├── monitor.go      # Process monitoring
│   │   │   └── utils.go        # Process utilities
│   │   ├── session/            # Shell session handlers
│   │   │   ├── handler.go      # Session handler struct
│   │   │   ├── create.go       # Session creation
│   │   │   ├── manage.go       # Session management
│   │   │   ├── logs.go         # Session logging
│   │   │   ├── monitor.go      # Session monitoring
│   │   │   └── terminate.go    # Session termination
│   │   ├── websocket/          # WebSocket handlers
│   │   │   ├── websocket.go    # WebSocket implementation
│   │   │   └── handler.go      # WebSocket handler struct
│   │   └── health.go           # Health check handlers
│   ├── middleware/             # HTTP middleware
│   │   └── middleware.go       # Logging, recovery, authentication
│   └── router/                 # Custom HTTP router
│       └── router.go           # Route matching and parameter extraction
├── Makefile                    # Build automation and development commands
├── go.mod                      # Go module dependencies
├── go.sum                      # Dependency checksums
└── test/                       # Comprehensive test suite
```

## 🚀 Quick Start

### Build and Run
1. **Navigate to the project directory**:
   ```bash
   cd packages/server-go
   ```

2. **Build an optimized binary**:
   ```bash
   make build
   # Binary will be created at: ./build/devbox-server
   ```

3. **Run in development mode**:
   ```bash
   make run
   # Or using the built binary:
   ./build/devbox-server
   ```

### Experimental Green Tea GC (Go 1.25+)
For enhanced garbage collection performance and json/v2 support:
```bash
make build-exp
```

## ⚙️ Configuration

### Configuration Options
The server supports flexible configuration through command-line flags and environment variables with the following priority: **flags > environment variables > defaults**.

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `ADDR` | `-addr` | `:9757` | Server listening address |
| `LOG_LEVEL` | `-log_level` | `INFO` | Log level (DEBUG\|INFO\|WARN\|ERROR) |
| `WORKSPACE_PATH` | `-workspace_path` | `/workspace` | Base workspace directory |
| `MAX_FILE_SIZE` | `-max_file_size` | `104857600` | Max file size (100MB) |
| `TOKEN` | `-token` | auto-generated | Authentication token |

### Usage Examples
```bash
# Using environment variables
export LOG_LEVEL=DEBUG
export ADDR=:8080
./devbox-server

# Using command-line flags
./devbox-server -log_level=DEBUG -addr=:8080 -workspace_path=/my/workspace

# Mixed approach (flags take precedence)
LOG_LEVEL=INFO ./devbox-server -log_level=DEBUG -addr=:8080
```

## 🔐 Authentication

All API routes require Bearer token authentication:

```bash
curl -H "Authorization: Bearer your-token" http://localhost:9757/health
```

**Token Management**:
- If no token is provided, a secure random token is auto-generated
- The auto-generated token is logged once at server startup for development use
- Health endpoints also require authentication
- Configure via `TOKEN` environment variable or `-token` flag

## 🛡️ Security Features

- **Path Validation**: Prevents directory traversal attacks
- **Input Sanitization**: Comprehensive input validation across all endpoints
- **File Size Limits**: Configurable maximum file size for uploads and writes
- **Authentication**: Bearer token-based authentication for all endpoints
- **Secure Defaults**: Sensible default configurations for production use

## 📊 API Reference

Base URL: `http://localhost:9757`
API Prefix: `/api/v1`

### Health Check Endpoints
- `GET /health` - Basic health status with uptime and version
- `GET /health/ready` - Readiness probe with filesystem validation
- `GET /health/live` - Liveness probe

### File Management (`/api/v1/files/`)
- `POST /api/v1/files/write` - Write file with path validation and size limits
- `POST /api/v1/files/read` - Read file (supports query parameter or JSON body)
- `POST /api/v1/files/delete` - Delete file or directory with recursive option
- `POST /api/v1/files/batch-upload` - Multipart batch file upload
- `GET /api/v1/files/list` - Directory listing with pagination and filtering

### Process Management (`/api/v1/process/`)
- `POST /api/v1/process/exec` - Execute command with output capture
- `GET /api/v1/process/list` - List running processes
- `GET /api/v1/process/:id/status` - Get process status by ID
- `POST /api/v1/process/:id/kill` - Terminate process with signal support
- `GET /api/v1/process/:id/logs` - Fetch process logs with streaming option

### Shell Sessions (`/api/v1/sessions/`)
- `POST /api/v1/sessions/create` - Create interactive shell session
- `GET /api/v1/sessions` - List all active sessions
- `GET /api/v1/sessions/:id` - Get session details by ID
- `POST /api/v1/sessions/:id/env` - Update session environment variables
- `POST /api/v1/sessions/:id/exec` - Execute command in session context
- `POST /api/v1/sessions/:id/cd` - Change working directory
- `POST /api/v1/sessions/:id/terminate` - Terminate session gracefully
- `GET /api/v1/sessions/:id/logs` - Get session logs with filtering options

### WebSocket Communication
- `GET /ws` - Real-time WebSocket connection for log streaming and event subscriptions

## 🧪 Testing

### Running Tests
```bash
# Run all tests
make test

# Run with coverage
go test -v -cover ./...

# Run specific test packages
go test -v ./pkg/handlers/file/
go test -v ./pkg/handlers/process/
go test -v ./pkg/handlers/session/
```

### Test Coverage
The project includes 24+ comprehensive test files covering:
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end API workflows
- **Concurrent Tests**: Multi-threading scenarios
- **Benchmark Tests**: Performance validation
- **Error Handling Tests**: Edge cases and failure scenarios

## 🛠️ Development Workflow

### Development Commands
```bash
# Development build and run
make run

# Production build
make build

# Code quality checks
make fmt          # Format code
make vet          # Static analysis
make check        # Combined fmt + vet + test

# Clean build artifacts
make clean

# Experimental build with Green Tea GC
make build-exp
```

### Code Quality Standards
- **Formatting**: `gofmt` for consistent code style
- **Static Analysis**: `go vet` for bug detection
- **Testing**: Comprehensive test coverage with unit and integration tests
- **Error Handling**: Structured error types with proper HTTP status codes
- **Logging**: Structured logging with trace ID correlation

## 📦 Dependencies

### Production Dependencies
- `github.com/google/uuid v1.6.0` - UUID generation for sessions and processes
- `github.com/gorilla/websocket v1.5.3` - WebSocket support for real-time communication

### Development Dependencies
- `github.com/stretchr/testify v1.11.1` - Testing framework and assertions
- `go-spew` - Pretty printing for test output
- `go-difflib` - Difference computation for test comparisons

## 🔄 Build System

### Makefile Targets
| Target | Description |
|--------|-------------|
| `build` | Optimized production build for Linux AMD64 |
| `build-exp` | Experimental build with Green Tea GC |
| `run` | Development mode execution |
| `test` | Run all tests with coverage |
| `fmt` | Format all Go source files |
| `vet` | Run static analysis |
| `check` | Combined fmt + vet + test |
| `clean` | Remove build artifacts |

### Build Features
- **Optimized Builds**: Stripped binaries with reduced size
- **Cross-compilation**: Linux AMD64 target for consistency
- **Build-time Information**: Version and build time injection
- **CGO Disabled**: Docker-friendly builds
- **Path Trimming**: Clean build artifacts

## 🏢 Production Deployment

### Docker Deployment (Optional)
```dockerfile
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY . .
RUN make build

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/build/devbox-server .
EXPOSE 9757
CMD ["./devbox-server"]
```

### Environment Configuration
```bash
# Production environment variables
export LOG_LEVEL=INFO
export ADDR=0.0.0.0:9757
export WORKSPACE_PATH=/data/workspace
export MAX_FILE_SIZE=52428800  # 50MB
export TOKEN=your-secure-token
```

## 📝 Architecture Principles

### Clean Architecture Implementation
1. **Dependency Inversion**: Core business logic doesn't depend on infrastructure
2. **Single Responsibility**: Each package has one clear purpose
3. **Separation of Concerns**: Clear boundaries between layers
4. **Testability**: Easy to unit test with dependency injection

### Key Design Patterns
- **Repository Pattern**: Clean data access abstraction
- **Middleware Chain**: Composable request processing pipeline
- **Handler Pattern**: Consistent HTTP request handling
- **Factory Pattern**: Structured component initialization

## 🔍 Observability

### Structured Logging
- **Format**: JSON-based structured logging using `slog`
- **Trace Correlation**: `X-Trace-ID` header for request tracking
- **Log Levels**: DEBUG, INFO, WARN, ERROR with configurable levels
- **Source Information**: File and line number inclusion in debug mode

### Monitoring Endpoints
- Health checks for load balancer integration
- Process status monitoring with resource usage
- Session lifecycle tracking
- Real-time log streaming via WebSocket

## 🤝 Contributing

### Development Setup
1. Clone the repository
2. Install Go 1.25 or later
3. Run `make check` to verify the setup
4. Make changes with corresponding tests
5. Ensure all tests pass before submitting

### Code Standards
- Follow Go idioms and best practices
- Write comprehensive tests for new features
- Use structured logging with appropriate levels
- Maintain backward compatibility for API changes
- Document public APIs and complex business logic

---

**Note**: This server is designed to be lightweight and dependency-free, focusing on providing essential development tools with a clean, maintainable architecture.