# DevBox Server (Rust)

A high-performance, memory-efficient Rust server designed for local development environments. Built with Axum and Tokio, it provides comprehensive capabilities for file operations, process management, interactive shell sessions, port monitoring, real-time WebSocket communication, and health checks. The server is optimized for minimal binary size and maximum performance.

## 🚀 Features

### Core Capabilities
- **File Management**: Read, write, delete, list, move/rename files with batch upload support
- **Process Control**: Execute, monitor, terminate processes with comprehensive logging and state management
- **Shell Sessions**: Interactive shell sessions with environment management and directory navigation
- **Port Monitoring**: Lazy port detection and monitoring for running services
- **Real-time Communication**: WebSocket-based log streaming and event notifications
- **Health Monitoring**: Multiple health check endpoints for monitoring and readiness probes

### Architecture Highlights
- **High Performance**: Async/await with Tokio runtime for efficient concurrency
- **Memory Efficient**: Optimized for minimal memory footprint with aggressive compiler optimizations
- **Small Binary Size**: Release builds optimized with LTO, stripped symbols (~2-3MB compressed)
- **Type Safety**: Leveraging Rust's type system for compile-time guarantees
- **Security**: Path validation, authentication, and safe process handling
- **Production Ready**: Graceful shutdown, structured responses, and comprehensive error handling

## 📋 Prerequisites
- **Rust 1.70+** - Rust toolchain with Cargo
- **Git** - For cloning and version management
- **cross** - For cross-compilation (`cargo install cargo-cross`)

## 🏗️ Project Architecture

```
packages/server-rust/
├── src/
│   ├── main.rs                 # Application entry point
│   ├── config.rs               # Configuration management (env vars + CLI args)
│   ├── error.rs                # Custom error types and error handling
│   ├── response.rs             # Standardized API response builders
│   ├── router.rs               # Route definitions and handler registration
│   ├── handlers/               # HTTP/WebSocket request handlers
│   │   ├── mod.rs              # Handler module exports
│   │   ├── file.rs             # File operations (read/write/delete/list/move/batch-upload)
│   │   ├── process.rs          # Process management (exec/list/status/kill/logs)
│   │   ├── session.rs          # Shell session management (create/exec/env/cd/logs)
│   │   ├── port.rs             # Port monitoring (lazy detection)
│   │   ├── websocket.rs        # WebSocket connections for real-time logs
│   │   └── health.rs           # Health check endpoints
│   ├── middleware/             # HTTP middleware
│   │   ├── mod.rs              # Middleware exports
│   │   ├── auth.rs             # Authentication (Bearer token)
│   │   └── logging.rs          # Request logging with correlation IDs
│   ├── state/                  # Application state management
│   │   ├── mod.rs              # State exports
│   │   ├── process.rs          # Process state tracking
│   │   └── session.rs          # Session state management
│   ├── monitor/                # Background monitoring tasks
│   │   ├── mod.rs              # Monitor exports
│   │   └── port.rs             # Port monitoring implementation
│   └── utils/                  # Utility functions
│       ├── mod.rs              # Utility exports
│       ├── common.rs           # Common utilities (ID generation, formatting)
│       └── path.rs             # Path validation and security
├── test/                       # Comprehensive test suite
│   ├── run_all.sh              # Run all tests sequentially
│   ├── test_all_routes.sh      # Test all API endpoints
│   ├── test_exec_sync.sh       # Test process execution
│   ├── test_file_move_rename.sh # Test file operations
│   ├── test_json_format.sh     # Test JSON response formatting
│   ├── test_lazy_port_monitor.sh # Test port monitoring
│   ├── test_process_logs.sh    # Test process log streaming
│   ├── test_session_logs.sh    # Test session log retrieval
│   └── manual_test.http        # Manual HTTP test cases
├── Cargo.toml                  # Dependencies and build configuration
├── Makefile                    # Build automation and development commands
└── README.md                   # This file
```

## 🚀 Quick Start

### Build and Run
1. **Navigate to the project directory**:
   ```bash
   cd packages/server-rust
   ```

2. **Build an optimized release binary**:
   ```bash
  make build                               # defaults to TARGET=x86_64-unknown-linux-musl
  make build TARGET=aarch64-unknown-linux-musl
  # Binary will be created at: ./target/<target>/release/devbox-sdk-server
  # Build both release binaries at once: make build-all
   ```

3. **Build with UPX compression** (optional, requires UPX):
   ```bash
   make build-release-upx
   # Creates a smaller compressed binary
   ```

4. **Run in development mode**:
   ```bash
   make run
   # Or using the built binary:
  ./target/<target>/release/devbox-sdk-server
   ```

### Multi-architecture builds

Cross-compilation is handled through `cargo cross`. Use the `TARGET` variable (defaults to `x86_64-unknown-linux-musl`) to select an architecture:

| TARGET | Platform | Output binary |
|--------|----------|----------------|
| `x86_64-unknown-linux-musl` | Linux x86_64 (glibc-compatible, fully static) | `./target/x86_64-unknown-linux-musl/release/devbox-sdk-server` |
| `aarch64-unknown-linux-musl` | Linux ARM64 (fully static) | `./target/aarch64-unknown-linux-musl/release/devbox-sdk-server` |

Run `make build TARGET=<triple>` to produce a single binary or `make build-all` to generate both release artifacts in one pass.

### Binary Size Optimizations
The release build is heavily optimized for size:
- **LTO**: Fat link-time optimization (`lto = "fat"`)
- **Opt Level**: Aggressive size optimization (`opt-level = "z"`)
- **Stripped**: All symbols removed (`strip = "symbols"`)
- **Panic**: Abort on panic for smaller binary (`panic = "abort"`)
- **Single Codegen Unit**: Better optimization at cost of build time

## ⚙️ Configuration

### Configuration Options
The server supports flexible configuration through environment variables and command-line arguments with the following priority: **command-line args > environment variables > defaults**.

| Variable | CLI Argument | Default | Description |
|----------|--------------|---------|-------------|
| `ADDR` | `--addr` | `0.0.0.0:9757` | Server listening address |
| `WORKSPACE_PATH` | `--workspace-path` | `/home/devbox/project` | Base workspace directory |
| `MAX_FILE_SIZE` | - | `104857600` | Max file size (100MB) |
| `TOKEN` | `--token` | auto-generated | Authentication token |
| `SEALOS_DEVBOX_JWT_TOKEN` | - | - | Alternative authentication token (fallback for TOKEN) |

### Usage Examples
```bash
# Using environment variables
export ADDR=0.0.0.0:9757
export WORKSPACE_PATH=/home/devbox/project
./server-rust

# Using command-line arguments
./server-rust --addr=0.0.0.0:9757 --workspace-path=/home/devbox/project --token=my-secret-token

# Mixed approach (CLI args take precedence)
ADDR=:8080 ./server-rust --addr=0.0.0.0:9757
```

## 🔐 Authentication

Most API routes require Bearer token authentication. Health check endpoints are exempt from authentication for Kubernetes probe compatibility.

**Token Management**:
- If no token is provided, a secure random token is auto-generated
- The auto-generated token is printed once at server startup for development use
- Health check endpoints (`/health`, `/health/ready`, `/health/live`) do **not** require authentication
- All other endpoints require Bearer token authentication via `Authorization: Bearer <token>` header

## 🛡️ Security Features

- **Path Validation**: Prevents directory traversal attacks with comprehensive path sanitization
- **Input Validation**: Type-safe request validation using Serde
- **File Size Limits**: Configurable maximum file size for uploads and writes
- **Authentication**: Bearer token-based authentication for all protected endpoints
- **Safe Process Handling**: Uses Unix signals safely via the `nix` crate
- **Memory Safety**: Rust's ownership system prevents memory vulnerabilities

## 📊 API Reference

Base URL: `http://localhost:9757`
API Prefix: `/api/v1`

### Health Check Endpoints
- `GET /health` - Basic health status with uptime and version (no authentication required)
- `GET /health/ready` - Readiness probe with filesystem validation (no authentication required)
- `GET /health/live` - Liveness probe for Kubernetes (no authentication required)

### File Management (`/api/v1/files/`)
- `POST /api/v1/files/write` - Write file with path validation and size limits
  - Body: `{ "path": "relative/path.txt", "content": "base64-encoded-content" }`
- `GET /api/v1/files/read?path=<file-path>` - Read file content as base64
- `POST /api/v1/files/delete` - Delete file or directory
  - Body: `{ "path": "relative/path" }`
- `POST /api/v1/files/batch-upload` - Multipart batch file upload with directory support
  - Supports nested directory structures via tar archive extraction
- `GET /api/v1/files/list?path=<dir-path>` - Directory listing
- `POST /api/v1/files/move` - Move or rename files/directories
  - Body: `{ "source": "old/path", "destination": "new/path" }`

### Process Management (`/api/v1/process/`)
- `POST /api/v1/process/exec` - Execute command with output capture
  - Body: `{ "command": "ls -la", "cwd": "/home/devbox/project" }`
- `GET /api/v1/process/list` - List all tracked processes with status
- `GET /api/v1/process/:id/status` - Get process status by ID
- `POST /api/v1/process/:id/kill` - Terminate process with signal support
  - Query param: `signal=SIGTERM` (optional, defaults to SIGTERM)
- `GET /api/v1/process/:id/logs` - Fetch process logs with pagination
  - Query params: `offset` (default: 0), `limit` (default: 100)

### Shell Sessions (`/api/v1/sessions/`)
- `POST /api/v1/sessions/create` - Create interactive shell session
  - Body: `{ "shell": "/bin/bash", "workingDir": "/home/devbox/project" }` (both optional)
- `GET /api/v1/sessions` - List all active sessions
- `GET /api/v1/sessions/:id` - Get session details by ID
- `POST /api/v1/sessions/:id/env` - Update session environment variables
  - Body: `{ "env": { "VAR": "value" } }`
- `POST /api/v1/sessions/:id/exec` - Execute command in session context
  - Body: `{ "command": "pwd" }`
- `POST /api/v1/sessions/:id/cd` - Change working directory
  - Body: `{ "path": "relative/or/absolute/path" }`
- `POST /api/v1/sessions/:id/terminate` - Terminate session gracefully
- `GET /api/v1/sessions/:id/logs` - Get session logs
  - Query params: `offset` (default: 0), `limit` (default: 100)

### Port Monitoring (`/api/v1/ports/`)
- `GET /api/v1/ports` - List all monitored ports
- `GET /api/v1/ports/:port` - Get specific port details

### WebSocket Communication
- `GET /ws` - Real-time WebSocket connection for log streaming
  - Subscribe to process/session logs in real-time
  - Automatic cleanup on disconnect

## 🧪 Testing

### Running Tests
The test suite includes comprehensive shell scripts for integration testing:

```bash
# Run all tests sequentially
./test/run_all.sh

# Run specific test suites
./test/test_all_routes.sh           # All API endpoints
./test/test_exec_sync.sh            # Process execution
./test/test_file_move_rename.sh     # File operations
./test/test_json_format.sh          # JSON response format
./test/test_lazy_port_monitor.sh    # Port monitoring
./test/test_process_logs.sh         # Process logs
./test/test_session_logs.sh         # Session logs
```

### Test Coverage
The project includes comprehensive integration tests covering:
- **API Endpoints**: All routes with success and error cases
- **File Operations**: Read, write, delete, list, move/rename, batch upload
- **Process Management**: Execution, monitoring, termination, log streaming
- **Session Management**: Creation, command execution, environment management
- **Port Monitoring**: Lazy detection and tracking
- **Error Handling**: Invalid inputs, missing resources, permission errors
- **WebSocket**: Real-time log streaming and cleanup

## 🛠️ Development Workflow

### Development Commands
```bash
# Development build and run
make run

# Production build (optimized)
make build

# Build with UPX compression
make build-release-upx

# Code quality checks
make fmt          # Format code with rustfmt
make check        # Run cargo check
make clippy       # Run clippy lints (strict)

# Clean build artifacts
make clean
```

### Code Quality Standards
- **Formatting**: `rustfmt` for consistent code style
- **Linting**: `clippy` with strict warnings (`-D warnings`)
- **Type Safety**: Leveraging Rust's strong type system
- **Error Handling**: Custom error types with proper HTTP status mapping
- **Async/Await**: Tokio-based async runtime for efficient concurrency

## 📦 Dependencies

### Production Dependencies
- **`axum` (0.8)**: High-performance web framework with WebSocket and multipart support
- **`tokio` (1.x)**: Async runtime with multi-threaded executor
- **`serde` (1.x)**: Serialization/deserialization framework
- **`serde_json` (1.x)**: JSON support
- **`base64` (0.22)**: Base64 encoding/decoding for binary data
- **`futures` (0.3)**: Async utilities and stream processing
- **`rand` (0.9)**: Random number generation for IDs
- **`tokio-util` (0.7)**: Tokio utility functions
- **`tokio-stream` (0.1)**: Stream utilities for async processing
- **`tar` (0.4)**: Tar archive processing for batch uploads
- **`flate2` (1.1)**: Compression support
- **`nix` (0.30)**: Unix system call wrappers for signal handling

### Development Dependencies
- **`cargo fmt`**: Code formatting
- **`cargo clippy`**: Linting and static analysis
- **`cargo test`**: Unit and integration testing

## 🔄 Build System

### Makefile Targets
| Target | Description |
|--------|-------------|
| `build` | Optimized release build with size optimizations |
| `build-release-upx` | Build and compress with UPX |
| `run` | Development mode execution |
| `test` | Run Rust unit/integration tests |
| `fmt` | Format all Rust source files |
| `check` | Run cargo check |
| `clippy` | Run clippy lints with strict warnings |
| `clean` | Remove build artifacts |

### Build Features
- **Aggressive Size Optimization**: `opt-level = "z"` for minimal binary size
- **Link-Time Optimization**: Fat LTO for better inlining and dead code elimination
- **Single Codegen Unit**: Better optimization at the cost of longer build times
- **Symbol Stripping**: All debug symbols removed in release builds
- **Panic Abort**: Smaller binary by unwinding-free panic handling
- **No Debug Info**: Zero debug information in release builds

## 🏢 Production Deployment

### Docker Deployment (Multi-stage Build)
```dockerfile
# Build stage
FROM rust:1.70-alpine AS builder
WORKDIR /app
RUN apk add --no-cache musl-dev
COPY . .
RUN cargo build --release

# Runtime stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/target/release/server-rust .
EXPOSE 9757
CMD ["./server-rust"]
```

### Static Linking (Optional)
For fully static binaries (no runtime dependencies):
```bash
# Install musl target
rustup target add x86_64-unknown-linux-musl

# Build static binary
cargo build --release --target x86_64-unknown-linux-musl
```

### Environment Configuration
```bash
# Production environment variables
export ADDR=0.0.0.0:9757
export WORKSPACE_PATH=/home/devbox/project
export MAX_FILE_SIZE=52428800  # 50MB
export TOKEN=your-secure-token
```

## 📝 Architecture Principles

### Async-First Design
- **Tokio Runtime**: Multi-threaded async executor for efficient concurrency
- **Non-blocking I/O**: All I/O operations are async (file, network, process)
- **Streaming**: Efficient memory usage with streaming for large files and logs

### State Management
- **Shared State**: Arc-wrapped state for thread-safe sharing across handlers
- **Process Tracking**: In-memory HashMap for process lifecycle management
- **Session Management**: Stateful shell sessions with environment and directory tracking

### Error Handling
- **Custom Error Types**: `AppError` enum with mapped HTTP status codes
- **Type-Safe**: Leveraging Rust's Result type for explicit error handling
- **Informative**: Detailed error messages with context for debugging

### Type Safety
- **Strong Types**: Leveraging Rust's type system for compile-time guarantees
- **Serde Integration**: Type-safe JSON serialization/deserialization
- **No Unsafe Code**: Pure safe Rust (except in dependencies)

## 🔍 Observability

### Logging
- **Structured Logging**: Simple println-based logging (tracing removed for size optimization)
- **Request IDs**: Correlation IDs for tracking requests across handlers
- **Process/Session IDs**: UUID-based IDs for resource tracking

### Monitoring Endpoints
- Health checks for load balancer integration
- Process status monitoring with comprehensive state info
- Session lifecycle tracking
- Port monitoring for running services
- Real-time log streaming via WebSocket

## 🚀 Performance Characteristics

### Binary Size
- **Release Build**: ~8-12MB (uncompressed, with symbols stripped)
- **With UPX**: ~2-3MB (compressed)
- **Static Build**: ~10-15MB (musl target, fully static)

### Memory Usage
- **Idle**: ~5-10MB
- **Under Load**: Scales with active connections/processes
- **Efficient**: Zero-copy streaming where possible

### Concurrency
- **Multi-threaded**: Tokio runtime with work-stealing scheduler
- **Async I/O**: Non-blocking operations for high throughput
- **Connection Pooling**: Efficient resource management

## 🤝 Contributing

### Development Setup
1. Clone the repository
2. Install Rust 1.70 or later (`rustup`)
3. Run `make check` to verify the setup
4. Make changes with corresponding tests
5. Ensure `make fmt && make clippy` passes before submitting

### Code Standards
- Follow Rust idioms and best practices
- Use `rustfmt` for consistent formatting
- Pass `clippy` lints with `-D warnings`
- Write comprehensive tests for new features
- Use type-safe error handling with `Result`
- Document public APIs with rustdoc comments

---

**Note**: This server is designed for high performance and minimal resource usage, making it ideal for containerized development environments. The Rust implementation provides memory safety, fearless concurrency, and excellent performance characteristics.
