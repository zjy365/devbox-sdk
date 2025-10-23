# Sealos Devbox SDK Project Context

## Purpose

The Sealos Devbox SDK is an enterprise-grade monorepo providing a comprehensive TypeScript SDK and HTTP server for programmatically managing Sealos Devbox instances. It enables developers, AI Agents, and third-party tools to create, control, and interact with cloud development environments through a clean, intuitive API that leverages HTTP API + Bun runtime architecture for optimal performance.

## Tech Stack

- **Architecture**: Monorepo with two main packages using Turbo for build orchestration
- **Primary Language**: TypeScript with strict mode throughout
- **Package Management**: npm workspaces with scoped packages (@sealos/*)
- **Container Runtime**: Bun (JavaScript runtime with native file I/O) for server package
- **Build System**: tsup for dual CJS/ESM bundling with unified configuration
- **Code Quality**: Biome for unified formatting, linting, and type checking
- **Testing**: Vitest for unit and integration testing with c8 coverage
- **Process Management**: Turbo for efficient monorepo build pipelines
- **Authentication**: kubeconfig-based authentication via Devbox API
- **File Operations**: HTTP API with adaptive transfer strategies
- **Real-time Communication**: WebSocket for file watching and monitoring

## Project Conventions

### Code Style

- Use Biome for unified formatting, linting, and type checking
- TypeScript strict mode enabled across all packages
- Async/await patterns for all API operations
- Promise-based error handling over callbacks
- JSDoc comments for all public APIs
- Bun-specific patterns for container server code (@sealos/devbox-server)
- HTTP status codes and proper error responses
- Consistent import paths and module organization

### Architecture Patterns

- **Monorepo Architecture**: Two main packages (@sealos/devbox-sdk, @sealos/devbox-server)
- **Package Separation**: SDK for external API, Server for container runtime
- **Dual-layer Architecture**: TypeScript SDK + Bun HTTP Server
- **Container-based Design**: HTTP Server runs inside Devbox containers
- **Connection Pooling**: HTTP Keep-Alive connections for performance
- **Adaptive Transfer**: Smart file transfer strategies based on size and type
- **WebSocket Integration**: Real-time file watching and monitoring
- **Unified Build Pipeline**: Turbo orchestrates build, test, and lint across packages
- **Configuration via Environment**: kubeconfig and server environment variables

### Testing Strategy

- Unit tests with Vitest across all packages
- Integration tests between SDK and mock HTTP servers
- Package-level testing with focused test suites
- Coverage target: >90% for all packages
- Performance benchmarks for file operations
- WebSocket connection testing
- Connection pool behavior testing
- Cross-package integration testing

### Git Workflow

- Main branch for stable releases
- Feature branches for new capabilities
- Conventional commits for changelog generation
- Semantic versioning for releases
- OpenSpec-driven development workflow

## Domain Context

### Devbox Concepts

- **Devbox**: Containerized development environment with embedded Bun HTTP Server
- **Runtime**: Pre-built environment templates (Node.js, Python, Go, Java, React, etc.)
- **HTTP Server**: Bun-based server (port 3000) running inside each Devbox container
- **File Operations**: High-performance file operations via HTTP API with Bun.file() native I/O
- **Resource Management**: CPU, memory, and port configuration
- **WebSocket Support**: Real-time file watching and change notifications
- **Connection Pooling**: Keep-Alive connections for optimized performance

### HTTP Server Architecture

- **Container Server**: Bun HTTP Server runs inside Devbox containers (port 3000)
- **File API Endpoints**: `/files/*` for file operations using Bun.file() native API
- **Process API**: `/process/*` for command execution
- **WebSocket API**: `/ws` for real-time file watching
- **Health Check**: `/health` for server health monitoring
- **Streaming Support**: Large file streaming with chunked transfer
- **Security Features**: Path validation and input sanitization
- **Environment Configuration**: Configurable via environment variables

### Target Users

- **AI Agent Developers**: Need programmatic code execution environments with real-time file watching
- **CI/CD Platforms**: Require automated Devbox lifecycle management via HTTP API
- **Development Tools**: IDE plugins and developer tooling integration
- **Enterprise DevOps**: Batch Devbox management and automation

### Performance Requirements

- Small file operations: <50ms latency (HTTP API advantage)
- Large file support: Up to 100MB with streaming transfers
- Batch operations: Optimized with HTTP connection pooling
- Real-time file watching: <100ms notification latency via WebSocket
- Connection reuse: >95% connection pool efficiency
- Competitive performance vs E2B, Daytona, Cloudflare

## Important Constraints

### Technical Constraints

- **File size limit**: 100MB per file (streaming for large files)
- **Authentication**: Must use kubeconfig environment variable
- **Performance**: Sub-50ms latency for small file operations
- **Compatibility**: Support 40+ runtime environments
- **Container Requirements**: Each Devbox must run Bun HTTP Server (port 3000)
- **Network**: HTTP/HTTPS communication only between SDK and containers
- **Memory**: Bun server memory footprint <80MB per container
- **Startup Time**: Bun server cold start <100ms

### Business Constraints

- Must provide competitive advantage over E2B, Daytona, Cloudflare
- Focus on TypeScript/Node.js SDK initially
- API compatibility with existing Sealos Devbox REST API
- Container-based architecture for better isolation and performance
- Real-time capabilities via WebSocket (competitive differentiator)

### Security Constraints

- Path validation to prevent traversal attacks in HTTP endpoints
- File size validation and limits in all upload endpoints
- Secure HTTPS/TLS transmission between SDK and containers
- Permission validation for all operations
- WebSocket connection authentication and authorization
- Container isolation for security boundaries

## External Dependencies

### Required Dependencies

- **Sealos Devbox API**: RESTful API for Devbox management
- **Kubernetes**: Backend infrastructure for Devbox instances
- **Node.js Runtime**: Primary execution environment for SDK
- **Bun Runtime**: Container server execution environment
- **kubeconfig**: Authentication mechanism for API access

### Container Server Dependencies (@sealos/devbox-server)

- **Bun**: JavaScript runtime with native file I/O performance
- **chokidar**: File watching for real-time change detection
- **ws**: WebSocket server implementation
- **zod**: Runtime type validation for API requests
- **mime-types**: Content type detection for file transfers

### SDK Dependencies (@sealos/devbox-sdk)

- **node-fetch**: HTTP client for API communication
- **ws**: WebSocket client for real-time connections
- **p-queue**: Queue management for concurrent operations
- **p-retry**: Retry logic for resilient operations
- **form-data**: Form data handling for multipart requests

### Optional Dependencies

- **Compression libraries**: For optimizing file transfers (gzip, brotli)
- **Progress tracking libraries**: For large file upload progress
- **WebSocket client libraries**: For SDK WebSocket connections
- **HTTP client libraries**: For optimized HTTP connections (keep-alive, pooling)

### API Endpoints

- **Sealos Devbox API**: Base URL configurable (default: Sealos cloud endpoints)
- **Container HTTP Servers**: Internal communication (http://pod-ip:3000)
- **Authentication**: kubeconfig-based for external API
- **Internal Authentication**: Network-level security for container communication
- **Rate limiting**: Respect API limits with retry logic
- **Health Monitoring**: Regular health checks for container servers

## File Operation Architecture

### Transfer Strategies

- **Small Files (<1MB)**: Direct HTTP transfer for minimal overhead
- **Large Files (1MB-100MB)**: Adaptive strategies with streaming when needed
- **Batch Operations**: HTTP connection pooling and optimized batching
- **Real-time Operations**: WebSocket-based file watching and notifications
- **Security**: Path validation and content sanitization for all transfers

### Container Server Operations

- **File Write**: POST /files/write with Base64 content
- **File Read**: GET /files/read with streaming response
- **File List**: GET /files/list for directory contents
- **Batch Upload**: POST /files/batch-upload for multiple files
- **File Watch**: WebSocket /ws with file change notifications
- **Process Execution**: POST /process/exec for command running

### Security Considerations

- Path validation in all HTTP endpoints to prevent traversal attacks
- File size validation and upload limits
- Secure HTTPS/TLS transmission for all external communications
- Permission validation for all operations
- WebSocket connection authentication
- Container network isolation for internal communications
