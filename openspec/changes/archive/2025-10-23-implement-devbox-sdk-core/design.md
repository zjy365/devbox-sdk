# Design Document: Devbox SDK Core Architecture

## Context

The current project contains minimal scaffolding with a basic CLI tool and a simple `add()` function. We need to transform this into a comprehensive TypeScript SDK for managing Sealos Devbox instances. The SDK will use HTTP API communication with Bun runtime servers running inside Devbox containers, providing high-performance file operations and real-time capabilities.

### Technical Requirements
- TypeScript/Node.js SDK with dual ESM/CJS output
- HTTP API + Bun runtime architecture for container communication
- kubeconfig-based authentication for Sealos platform integration
- High-performance file operations with streaming support
- WebSocket-based real-time file watching
- Enterprise-grade error handling and monitoring
- Connection pooling for optimal performance

## Goals / Non-Goals

**Goals:**
- Provide a clean, intuitive TypeScript API for Devbox management
- Enable high-performance file operations through HTTP endpoints
- Support real-time file watching via WebSocket connections
- Implement robust connection management and error handling
- Create modular, extensible architecture for future enhancements
- Achieve sub-50ms latency for small file operations

**Non-Goals:**
- CLI tool functionality (removing existing CLI)
- Direct SSH access to containers (using HTTP API instead)
- GUI or web interface (pure SDK/library)
- Multi-language support (focus on TypeScript/Node.js)
- Container runtime management (handled by Sealos platform)

## Decisions

### 1. HTTP API + Bun Runtime Architecture
**Decision**: Use HTTP API communication between SDK and Bun HTTP servers running in Devbox containers.
**Rationale**:
- Lower latency than SSH for file operations (<50ms vs 100ms+)
- Better connection pooling and concurrent operation support
- Easier to implement WebSocket-based real-time features
- More secure and firewall-friendly than SSH tunnels

### 2. Connection Pool Management
**Decision**: Implement HTTP connection pooling with keep-alive and health monitoring.
**Rationale**:
- Reduces connection overhead for frequent operations
- Enables concurrent file operations across multiple Devboxes
- Provides automatic recovery from connection failures
- Maintains performance under high load scenarios

### 3. Modular Architecture Pattern
**Decision**: Organize code into focused modules (core, api, connection, files, websocket).
**Rationale**:
- Enables independent development and testing of components
- Makes the codebase more maintainable and extensible
- Supports future feature additions without architectural changes
- Aligns with enterprise-grade development practices

### 4. TypeScript Strict Mode
**Decision**: Use TypeScript strict mode with comprehensive type definitions.
**Rationale**:
- Provides compile-time error checking and improved IDE support
- Ensures API consistency and reduces runtime errors
- Enables better auto-completion and developer experience
- Supports future migration paths and API evolution

## Risks / Trade-offs

### Risk: Bun Runtime Maturity
**Risk**: Bun is a newer runtime with limited enterprise adoption.
**Mitigation**:
- Bun is used only inside containers, not in the SDK itself
- Bun shows excellent performance and stability metrics
- Container isolation prevents Bun issues from affecting the SDK
- Fall-back strategies can be implemented if needed

### Trade-off: HTTP API Complexity vs SSH Simplicity
**Trade-off**: HTTP API requires more infrastructure than direct SSH.
**Mitigation**:
- HTTP provides better performance and features for our use case
- Connection complexity is managed through connection pooling
- WebSocket support enables real-time features not possible with SSH
- HTTP is more firewall-friendly and enterprise-ready

### Risk: Container Startup Time
**Risk**: Bun HTTP server startup time could affect cold-start performance.
**Mitigation**:
- Bun has excellent startup performance (<100ms)
- Connection pooling provides warm connections for subsequent operations
- Health checks ensure servers are ready before operations
- Graceful degradation for startup failures

## Migration Plan

### Phase 1: Core Architecture (Week 1)
1. Set up modular TypeScript project structure
2. Implement core DevboxSDK class and basic types
3. Create API client with kubeconfig authentication
4. Set up build configuration for dual ESM/CJS output
5. Remove existing CLI scaffolding

### Phase 2: Connection Management (Week 2)
1. Implement HTTP connection pool and manager
2. Add health checking and keep-alive mechanisms
3. Create Devbox instance management
4. Implement basic file operations via HTTP
5. Add error handling and retry logic

### Phase 3: Advanced Features (Week 3)
1. Implement Bun HTTP server for containers
2. Add WebSocket file watching capabilities
3. Implement streaming file operations
4. Add security validation and sanitization
5. Create comprehensive test suite

## Open Questions

- **Authentication Scope**: Should the SDK support multiple authentication methods beyond kubeconfig?
- **Configuration Management**: How should SDK configuration be managed (environment variables, config files, programmatic)?
- **Error Handling Strategy**: What level of error detail should be exposed to SDK users?
- **Performance Monitoring**: What metrics should be built-in vs requiring external tools?
- **Version Compatibility**: How should the SDK handle different Sealos platform versions?