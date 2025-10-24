# 0002-PRD-Sealos Devbox SDK with SSH/SFTP Implementation [DEPRECATED]

> ⚠️ **此文档已废弃** - This document has been deprecated
> 
> **废弃原因**: 经过架构分析，决定采用 HTTP REST API 方案替代 SSH/SFTP 实现
> **Reason**: After architectural analysis, decided to adopt HTTP REST API approach instead of SSH/SFTP implementation
> 
> **替代方案**: 请参考 `0003-task-bun-server-phase1-architecture.md` 及相关任务文件
> **Alternative**: Please refer to `0003-task-bun-server-phase1-architecture.md` and related task files
> 
> **废弃日期**: 2025-10-23
> **Deprecated Date**: 2025-10-23

## Introduction/Overview

This document defines the requirements for building a comprehensive Sealos Devbox SDK using SSH/SFTP as the primary transport mechanism. Based on architectural analysis, this approach leverages existing Devbox SSH infrastructure to deliver zero-development-cost, rapid-deployment solution with proven stability. The SDK targets Phase 1 implementation (1-2 weeks) to enable fast MVP validation and immediate value delivery.

## Goals

1. **Deliver rapid MVP validation** through SSH/SFTP-based SDK with zero development cost
2. **Leverage existing SSH infrastructure** for maximum stability and reliability
3. **Provide high-performance file operations** optimized for AI Agent workloads and development tools
4. **Enable quick market entry** with 1-2 day basic functionality implementation
5. **Establish foundation for future RESTful API migration** while maintaining immediate value delivery

## User Stories

### Primary Users

**As an AI Agent developer, I want to:**

- Execute code in isolated Devbox environments through SSH/SFTP connections
- Upload/download project files and dependencies with optimal performance based on file size
- Monitor file changes and synchronize code in real-time through SSH-based file watching
- Manage multiple Devbox instances programmatically with connection pooling

**As a CI/CD platform operator, I want to:**

- Integrate SSH-based Devbox management into pipeline automation workflows
- Perform bulk file synchronization operations with batch upload/download capabilities
- Control Devbox lifecycle through Sealos API with automatic SSH connection establishment
- Monitor resource usage and execution status via SSH-based monitoring commands

**As a development tools provider, I want to:**

- Build IDE plugins that connect seamlessly to Devbox environments via SSH/SFTP
- Offer intelligent file synchronization with adaptive transfer strategies (small files via SFTP, large files via tar+SSH)
- Provide terminal access and command execution capabilities through SSH channels
- Support collaborative development workflows with concurrent connection management

### Core Functionality Stories

**SSH Connection Management:**

- As a developer, I want to establish SSH connections to Devbox instances with automatic authentication
- As a developer, I want to maintain a pool of reusable SSH connections for performance optimization
- As a developer, I want automatic reconnection when network interruptions occur
- As a developer, I want configurable timeouts and connection lifecycle management

**Adaptive File Operations:**

- As a developer, I want small files (<1MB) transferred directly via SFTP for minimal latency
- As a developer, I want large files (>1MB) transferred using tar packaging + SSH commands for optimal throughput
- As a developer, I want batch operations that automatically choose the best transfer strategy
- As a developer, I want progress tracking and resume capabilities for large file transfers

## Functional Requirements

### 1. Core SDK Architecture

1.1. **Language Priority**: TypeScript/Node.js SDK as primary implementation with Python SDK (paramiko-based) planned for Phase 3

1.2. **Authentication Integration**:

- Leverage existing Devbox SSH key management system
- Support for automatic SSH key distribution from Sealos user management
- Fallback authentication support for development environments

  1.3. **Connection Management**:

- Configurable connection pool supporting concurrent operations
- Intelligent connection reuse and automatic cleanup
- Connection lifecycle management with health checks

  1.4. **Error Handling**: Comprehensive SSH error handling with specific exception types for:

- Connection failures and timeouts
- Authentication issues
- File operation errors
- Network interruption recovery

  1.5. **Logging and Monitoring**: Built-in operation auditing and debugging logs with configurable verbosity

### 2. SSH Connection Management

2.1. **Connection Pool**:

- Support for 10+ concurrent SSH connections per SDK instance
- Configurable pool size based on expected workload
- Connection rotation and load balancing

  2.2. **Connection Lifecycle**:

- Automatic connection establishment on first use
- Idle connection timeout and cleanup
- Graceful connection termination on SDK shutdown

  2.3. **Resilience Features**:

- Automatic reconnection with exponential backoff
- Connection health monitoring and proactive replacement
- Circuit breaker pattern for cascade failure prevention

  2.4. **Configuration Management**:

- Configurable connection timeouts (default: 30s connection, 10s operations)
- Keep-alive settings for long-running connections
- Custom SSH client configuration support

### 3. File Operations API (SSH/SFTP-based)

3.1. **Basic File Operations**:

- `writeFile(path, content, options)`: Write files with automatic encoding detection
- `readFile(path, options)`: Read files with binary/text support
- `delete(path)`: Remove files or directories recursively
- `exists(path)`: Check file/directory existence
- `listDir(path, options)`: List directory contents with metadata

  3.2. **Directory Operations**:

- `makeDir(path, recursive)`: Create directories with parent creation
- `removeDir(path, recursive)`: Remove directories safely
- `copyPath(source, destination)`: Copy files/directories efficiently
- `movePath(source, destination)`: Move/rename operations

  3.3. **Batch Operations**:

- `uploadFiles(fileMap, options)`: Batch upload with adaptive strategy selection
- `downloadFiles(paths, options)`: Batch download with compression
- `syncDirectory(localPath, remotePath, options)`: Bidirectional synchronization

  3.4. **Large File Support**:

- `uploadLargeFile(path, options)`: Chunked upload with progress tracking
- `downloadLargeFile(path, options)`: Chunked download with resume capability
- `getFileInfo(path)`: Comprehensive file metadata retrieval
- `setFilePermissions(path, mode)`: File permission management

### 4. Performance Optimization Strategy

4.1. **Adaptive Transfer Algorithm**:

- Small files (<1MB): Direct SFTP transfer for minimal overhead
- Large files (>1MB): Tar packaging + SSH command execution
- Batch operations: Automatic grouping and optimal strategy selection

  4.2. **Compression Support**:

- Automatic compression for text files and compatible formats
- Configurable compression levels and thresholds
- Smart compression detection based on file type

  4.3. **Concurrent Operations**:

- Parallel upload/download for multiple files
- Configurable concurrency limits based on system resources
- Operation queuing and prioritization

  4.4. **Performance Targets**:

- Small file operations: Average latency < 100ms
- Large file transfers: Throughput > 5MB/s
- Concurrent connections: Support for 10+ simultaneous connections
- Batch operations: Handle 50+ files simultaneously

### 5. Devbox Lifecycle Management

5.1. **Instance Creation**:

- Integration with Sealos API for Devbox provisioning
- Automatic SSH connection info retrieval after creation
- Support for custom runtime configurations

  5.2. **Connection Establishment**:

- Automatic SSH endpoint discovery and connection
- Connection validation and readiness checks
- Fallback connection strategies for different network scenarios

  5.3. **State Management**:

- Real-time Devbox status monitoring via SSH commands
- Resource usage tracking (CPU, memory, disk)
- Process and service status monitoring

  5.4. **Resource Cleanup**:

- Graceful SSH connection termination
- Temporary file cleanup on Devbox
- Resource usage monitoring and alerting

## Non-Goals (Out of Scope)

1. **Direct Container Shell Access**: SDK provides file operations and command execution, not interactive shell access
2. **Custom SSH Key Management**: Leverages existing Sealos SSH infrastructure rather than implementing new key management
3. **Database Operations**: No built-in database connection or query capabilities
4. **Web Service Components**: SDK does not provide web interfaces or HTTP endpoints
5. **Kubernetes Cluster Management**: Direct cluster operations handled through Sealos API, not SDK

## Design Considerations

### API Design Principles

- **Interface Consistency**: API design mimics Node.js `fs` module patterns for familiarity
- **Async/Await Pattern**: All operations return Promises with consistent error handling
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Error Standardization**: Consistent error types across all operations

### Security Considerations

- **SSH Key Management**: Integration with existing Sealos user key distribution system
- **Path Validation**: Strict path traversal prevention and validation
- **File Size Limits**: Configurable upload/download size restrictions (default: 100MB)
- **Permission Validation**: Verification of user permissions for all Devbox operations
- **Audit Logging**: Comprehensive operation logging for security monitoring

### Performance Optimizations

- **Smart Transfer Selection**: Automatic algorithm selection based on file characteristics
- **Connection Pooling**: Efficient connection reuse and management
- **Compression Optimization**: Intelligent compression based on file type and size
- **Batch Processing**: Optimal grouping of file operations for reduced overhead

### Monitoring and Observability

- **Connection Status**: Real-time connection pool health monitoring
- **Operation Metrics**: Transfer speeds, success rates, and latency statistics
- **Resource Monitoring**: Memory usage, connection counts, and queue sizes
- **Health Checks**: Automated connectivity and availability verification

## Technical Considerations

### Dependencies and Libraries

#### Core Dependencies:

- **ssh2-sftp-client** or **node-ssh**: Primary SSH/SFTP implementation
- **tar**: Node.js tar streaming for large file operations
- **compressor**: File compression utilities
- **Sealos SDK/API**: Devbox lifecycle management integration

#### System Requirements:

- **Node.js**: Version 14+ for async/await and modern features
- **TypeScript**: Version 4+ for type safety and development experience
- **Memory**: Sufficient memory for connection pooling and file buffering
- **Network**: Access to Devbox SSH endpoints and Sealos API

### Integration Points

- **Sealos API**: Devbox creation, management, and SSH endpoint discovery
- **SSH Infrastructure**: Existing Devbox SSH services and key management
- **Monitoring Systems**: Integration points for metrics and logging
- **CI/CD Platforms**: Hook points for pipeline integration

### Error Handling Strategy

- **Connection Errors**: Automatic retry with exponential backoff
- **Authentication Failures**: Clear error messages with troubleshooting guidance
- **File Operation Errors**: Detailed error context with file path and operation details
- **Network Interruptions**: Automatic reconnection with operation resume where possible

## Success Metrics

### Performance Metrics

1. **Small File Operations**: Average latency < 100ms for files < 1MB
2. **Large File Transfers**: Sustained throughput > 5MB/s for files > 1MB
3. **Concurrent Operations**: Support for 10+ simultaneous SSH connections
4. **Batch Processing**: Handle 50+ files in single batch operation
5. **Connection Success Rate**: > 99% successful connection establishment

### Quality Metrics

1. **SDK Adoption**: Installation and usage statistics tracking
2. **Error Rate**: < 1% operation failure rate across all functions
3. **User Satisfaction**: Developer feedback scoring and issue resolution time
4. **Documentation Coverage**: > 95% API documentation completeness

### Reliability Metrics

1. **Service Availability**: > 99.5% overall SDK availability
2. **Recovery Success**: > 95% automatic recovery from transient failures
3. **Connection Reliability**: > 99% successful connection maintenance
4. **Data Integrity**: 100% file transfer integrity verification

## Implementation Phases

### Phase 1: TypeScript SDK Foundation (Week 1-2)

**Week 1: Core Infrastructure**

- TypeScript/Node.js SDK project setup and configuration
- SSH connection pool implementation and management
- Basic SSH/SFTP connection establishment and authentication
- Integration with existing Sealos SSH key management system
- Comprehensive error handling and logging framework

**Week 2: Core File Operations**

- Basic file operations (read, write, delete, exists, listDir)
- Devbox lifecycle API integration for SSH endpoint discovery
- Connection resilience features (reconnection, health checks)
- Unit and integration test coverage
- Basic documentation and usage examples

### Phase 2: Advanced Features and Optimization (Week 3-4)

**Week 3: Advanced File Operations**

- Batch upload/download operations with adaptive strategy selection
- Large file support with chunked transfer and progress tracking
- Directory operations and management capabilities
- Compression support and automatic optimization
- Performance benchmarking and optimization

**Week 4: Production Readiness**

- Python SDK architecture design based on paramiko
- Comprehensive error handling and retry mechanisms
- Performance optimization and connection tuning
- Complete documentation, tutorials, and examples
- Production deployment preparation and monitoring setup

### Phase 3: Enhancement and Expansion (Week 5-6)

**Week 5: Python SDK Implementation**

- Python SDK development using paramiko
- Feature parity with TypeScript SDK
- Cross-platform compatibility testing
- Performance comparison and optimization

**Week 6: Advanced Features**

- File watching and real-time synchronization
- Advanced monitoring and metrics collection
- Integration with popular development tools and IDEs
- Community feedback incorporation and improvements

## Target Audience

This PRD is primarily written for:

- **Development Team**: Engineers implementing SSH-based SDK functionality and file operations
- **Product Managers**: Stakeholders responsible for rapid MVP delivery and feature prioritization
- **DevOps Engineers**: Teams responsible for SSH infrastructure and deployment configuration
- **QA Engineers**: Testing teams responsible for validation of SSH connections and file operations
- **Security Teams**: Personnel reviewing SSH authentication and security implementation

The requirements are structured to be explicit enough for junior developers to implement the SSH-based file operations while providing sufficient technical context for senior engineers to make architectural decisions about connection management and performance optimization.

## Open Questions

1. **SSH Key Integration**: What is the exact mechanism for accessing existing Sealos SSH key management? (API endpoint, configuration file, etc.)
2. **Connection Pool Limits**: What are the optimal default values for connection pool size and timeout settings?
3. **File Size Thresholds**: Should the 1MB threshold for adaptive transfer be configurable based on network conditions?
4. **Monitoring Integration**: What monitoring and logging systems should the SDK integrate with for production observability?
5. **Python SDK Priority**: Is Python SDK implementation critical for Phase 1, or can it be deferred based on TypeScript SDK success metrics?
