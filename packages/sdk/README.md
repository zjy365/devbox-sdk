# @labring/devbox-sdk

**Secure Sandbox SDK for Isolated Code Execution.** Execute AI-generated code, run automation tasks, and test untrusted code with zero risk to your infrastructure.

## Installation

```bash
npm install @labring/devbox-sdk
```

## Requirements

- Node.js >= 22.0.0
- Kubernetes configuration (`KUBECONFIG` environment variable or file path)

## Quick Start

### Secure Code Execution

```typescript
import { DevboxSDK } from '@labring/devbox-sdk'

// Initialize SDK
const sdk = new DevboxSDK({
  kubeconfig: process.env.KUBECONFIG
})

// Create a secure sandbox
const sandbox = await sdk.createDevbox({
  name: 'ai-task',
  runtime: 'python',
  resource: { cpu: 1, memory: 512 }
})

// Execute code safely in isolation
const result = await sandbox.codeRun('print("Hello from secure sandbox!")')
console.log(result.stdout) // "Hello from secure sandbox!"

// Clean up
await sandbox.delete()
await sdk.close()
```

## Features

### 🛡️ Secure Sandbox Execution

Execute code in isolated container environments with zero risk to your infrastructure:

```typescript
// Create isolated sandbox
const sandbox = await sdk.createDevbox({
  name: 'untrusted-code',
  runtime: 'node.js',
  resource: { cpu: 2, memory: 4096 }
})

// Execute AI-generated or untrusted code safely
const result = await sandbox.codeRun(aiGeneratedCode)

// Each sandbox is completely isolated
// - No access to host filesystem
// - Resource limits enforced
// - Network isolation
// - Automatic cleanup on deletion
```

**Security Features:**
- **Container Isolation** - Each sandbox runs in an isolated Kubernetes Pod
- **Path Validation** - Prevents directory traversal attacks
- **Resource Limits** - CPU and memory constraints
- **Access Control** - Kubeconfig-based authentication
- **HTTPS/TLS** - All communications encrypted

### ⚡ Fast Code Execution

Execute code synchronously or asynchronously with real-time output:

```typescript
// Synchronous execution (waits for completion)
const result = await sandbox.execSync({
  command: 'python script.py',
  cwd: '/workspace',
  timeout: 60000
})
console.log(result.stdout)
console.log(result.exitCode)

// Asynchronous execution (returns immediately)
const process = await sandbox.exec({
  command: 'npm run build',
  cwd: '/workspace'
})

// Get process status
const status = await sandbox.getProcessStatus(process.processId)

// Get real-time logs
const logs = await sandbox.getProcessLogs(process.processId, {
  lines: 100
})

// Kill process if needed
await sandbox.killProcess(process.processId)
```

**Code Execution Methods:**
- `codeRun(code, options?)` - Execute code string directly (Node.js/Python)
- `execSync(options)` - Synchronous command execution
- `exec(options)` - Asynchronous command execution
- `execSyncStream(options)` - Stream output in real-time (SSE)

### 📁 File Operations

Full CRUD operations with support for text and binary content:

```typescript
// Write text file
await sandbox.writeFile('app.js', 'console.log("Hello")')

// Write binary file
await sandbox.writeFile('image.png', imageBuffer)

// Read file
const content = await sandbox.readFile('app.js')
console.log(content.toString())

// List files
const files = await sandbox.listFiles('/workspace')
console.log(files.files)

// Batch upload
await sandbox.batchUpload({
  files: {
    'src/index.js': 'console.log("Hello")',
    'package.json': JSON.stringify({ name: 'my-app' })
  }
})

// Download file
const fileContent = await sandbox.downloadFile('app.js', {
  format: 'buffer' // or 'base64', 'text'
})

// Move and rename
await sandbox.moveFile({ from: '/old/path', to: '/new/path' })
await sandbox.renameFile({ path: '/old-name', newName: 'new-name' })
```

### 🔐 Git Integration

Clone, pull, push, and manage Git repositories securely:

```typescript
// Clone repository
await sandbox.git.clone({
  url: 'https://github.com/user/repo.git',
  path: '/workspace/repo',
  auth: {
    type: 'https',
    username: 'user',
    password: 'token'
  }
})

// Pull changes
await sandbox.git.pull({
  path: '/workspace/repo',
  auth: { /* ... */ }
})

// Push changes
await sandbox.git.push({
  path: '/workspace/repo',
  auth: { /* ... */ }
})

// Get status
const status = await sandbox.git.status('/workspace/repo')
console.log(status.branch)
console.log(status.changes)

// List branches
const branches = await sandbox.git.branches('/workspace/repo')
```

### 📊 Monitoring

Monitor sandbox resource usage and metrics:

```typescript
// Get monitor data
const monitorData = await sdk.getMonitorData('sandbox-name', {
  start: Date.now() - 3600000, // 1 hour ago
  end: Date.now()
})

monitorData.forEach(data => {
  console.log('CPU:', data.cpu)
  console.log('Memory:', data.memory)
  console.log('Timestamp:', data.timestamp)
})
```

### 🔄 Lifecycle Management

Create, start, pause, restart, and delete sandboxes:

```typescript
// Create sandbox
const sandbox = await sdk.createDevbox({
  name: 'my-sandbox',
  runtime: 'node.js',
  resource: { cpu: 2, memory: 4096 }
})

// Control lifecycle
await sandbox.start()
await sandbox.pause()
await sandbox.restart()
await sandbox.shutdown()
await sandbox.delete()

// List all sandboxes
const sandboxes = await sdk.listDevboxes()

// Get existing sandbox
const existing = await sdk.getDevbox('my-sandbox')
```

## Use Cases

### AI Agents & Code Generation

```typescript
// Execute AI-generated code safely
const aiCode = await llm.generateCode(prompt)
const result = await sandbox.codeRun(aiCode)

if (result.exitCode !== 0) {
  console.error('Execution failed:', result.stderr)
} else {
  console.log('Result:', result.stdout)
}
```

### Automation & Testing

```typescript
// Run untrusted automation scripts in isolation
await sandbox.execSync({
  command: 'npm test',
  cwd: '/workspace',
  timeout: 60000
})
```

### CI/CD Tasks

```typescript
// Execute build tasks in isolated environment
await sandbox.git.clone({ url: repoUrl, path: '/workspace' })
await sandbox.execSync({ command: 'npm install' })
await sandbox.execSync({ command: 'npm run build' })
```

## Configuration

### SDK Configuration

```typescript
const sdk = new DevboxSDK({
  // Required: Kubernetes config
  kubeconfig: process.env.KUBECONFIG, // or file path
  
  // Optional: API base URL
  baseUrl: 'https://api.sealos.io',
  
  // Optional: HTTP client configuration
  http: {
    timeout: 30000,        // Request timeout in milliseconds
    retries: 3,            // Number of retry attempts
    rejectUnauthorized: true // SSL certificate verification
  }
})
```

### Sandbox Creation Options

```typescript
await sdk.createDevbox({
  name: 'my-sandbox',           // Required: Unique name
  runtime: 'node.js',          // Required: Runtime environment
  resource: {                  // Required: Resource allocation
    cpu: 2,                    // CPU cores
    memory: 4096              // Memory in MB
  },
  ports: [                     // Optional: Port mappings
    { containerPort: 3000, servicePort: 3000 }
  ],
  env: [                       // Optional: Environment variables
    { name: 'NODE_ENV', value: 'production' }
  ]
})
```

## API Reference

### DevboxSDK

Main SDK class for managing sandboxes.

#### Methods

- `createDevbox(config: DevboxCreateConfig): Promise<DevboxInstance>` - Create a new sandbox
- `getDevbox(name: string): Promise<DevboxInstance>` - Get an existing sandbox
- `listDevboxes(): Promise<DevboxInstance[]>` - List all sandboxes
- `getMonitorData(devboxName: string, timeRange?: TimeRange): Promise<MonitorData[]>` - Get monitoring data
- `close(): Promise<void>` - Close all connections and cleanup

### DevboxInstance

Represents a single sandbox instance with methods for code execution, file operations, and more.

#### Properties

- `name: string` - Sandbox name
- `status: string` - Current status
- `runtime: DevboxRuntime` - Runtime environment
- `resources: ResourceInfo` - Resource allocation
- `git: Git` - Git operations interface

#### Methods

**Code Execution:**
- `codeRun(code: string, options?: CodeRunOptions): Promise<SyncExecutionResponse>`
- `execSync(options: ProcessExecOptions): Promise<SyncExecutionResponse>`
- `exec(options: ProcessExecOptions): Promise<ProcessExecResponse>`
- `execSyncStream(options: ProcessExecOptions): Promise<ReadableStream>`

**Process Management:**
- `getProcessStatus(processId: string): Promise<GetProcessStatusResponse>`
- `getProcessLogs(processId: string, options?: { lines?: number }): Promise<GetProcessLogsResponse>`
- `killProcess(processId: string, options?: KillProcessOptions): Promise<void>`
- `listProcesses(): Promise<ListProcessesResponse>`

**File Operations:**
- `writeFile(path: string, content: string | Buffer, options?: WriteOptions): Promise<void>`
- `readFile(path: string, options?: ReadOptions): Promise<Buffer>`
- `listFiles(path: string): Promise<ListFilesResponse>`
- `batchUpload(options: BatchUploadOptions): Promise<TransferResult>`
- `downloadFile(path: string, options?: DownloadFileOptions): Promise<Buffer | string>`
- `moveFile(options: MoveFileOptions): Promise<MoveFileResponse>`
- `renameFile(options: RenameFileOptions): Promise<RenameFileResponse>`

**File Watching:**
- `watchFiles(path: string, callback: (event: FileChangeEvent) => void): Promise<FileWatchWebSocket>`

**Git Operations:**
- `git.clone(options: GitCloneOptions): Promise<void>`
- `git.pull(options: GitPullOptions): Promise<void>`
- `git.push(options: GitPushOptions): Promise<void>`
- `git.status(path: string): Promise<GitStatus>`
- `git.branches(path: string): Promise<GitBranchInfo[]>`

**Lifecycle:**
- `start(): Promise<void>`
- `pause(): Promise<void>`
- `restart(): Promise<void>`
- `shutdown(): Promise<void>`
- `delete(): Promise<void>`
- `refreshInfo(): Promise<void>`

## Error Handling

The SDK provides comprehensive error types:

```typescript
import {
  DevboxSDKError,
  AuthenticationError,
  ConnectionError,
  FileOperationError,
  DevboxNotFoundError,
  ValidationError
} from '@labring/devbox-sdk'

try {
  await sandbox.writeFile('/invalid/path', 'content')
} catch (error) {
  if (error instanceof FileOperationError) {
    console.error('File operation failed:', error.message)
  } else if (error instanceof ValidationError) {
    console.error('Validation error:', error.message)
  }
}
```

## Security Best Practices

1. **Always validate input** before executing in sandbox
2. **Set resource limits** to prevent resource exhaustion
3. **Use HTTPS** for all communications
4. **Clean up sandboxes** after use to free resources
5. **Monitor resource usage** to detect anomalies
6. **Use path validation** for all file operations

## Examples

### Complete AI Agent Workflow

```typescript
import { DevboxSDK } from '@labring/devbox-sdk'

async function runAIAgent() {
  const sdk = new DevboxSDK({
    kubeconfig: process.env.KUBECONFIG
  })

  try {
    // Create secure sandbox
    const sandbox = await sdk.createDevbox({
      name: 'ai-agent',
      runtime: 'python',
      resource: { cpu: 2, memory: 4096 }
    })

    // Execute AI-generated code
    const aiCode = await llm.generateCode(userPrompt)
    const result = await sandbox.codeRun(aiCode)

    if (result.exitCode === 0) {
      console.log('Success:', result.stdout)
    } else {
      console.error('Error:', result.stderr)
    }

    // Clean up
    await sandbox.delete()
  } finally {
    await sdk.close()
  }
}

runAIAgent()
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
  DevboxSDKConfig,
  DevboxCreateConfig,
  DevboxInfo,
  FileMap,
  ProcessExecOptions,
  GitCloneOptions
} from '@labring/devbox-sdk'
```

## Performance

- **Connection Pooling**: Efficient HTTP connection reuse (>98% reuse rate)
- **Adaptive Transfer**: Smart file transfer strategies based on file size
- **Fast Creation**: Quick sandbox initialization
- **Type Safety**: Full TypeScript support prevents runtime errors

## License

Apache-2.0

## Links

- [GitHub Repository](https://github.com/zjy365/devbox-sdk)
- [Documentation](https://github.com/zjy365/devbox-sdk/tree/main/apps/docs)
- [Issue Tracker](https://github.com/zjy365/devbox-sdk/issues)
