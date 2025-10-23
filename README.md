# Devbox SDK

Enterprise TypeScript SDK for Sealos Devbox management with HTTP API + Bun runtime architecture.

## Overview

The Devbox SDK provides a comprehensive TypeScript library for programmatically managing Sealos Devbox instances. It enables AI agents, CI/CD platforms, and development tools to create, control, and interact with cloud development environments through a clean, intuitive API.

## Features

- 🚀 **High Performance**: HTTP API + Bun runtime for sub-50ms file operations
- 🔗 **Connection Pooling**: Optimized connection management with keep-alive and health monitoring
- 📁 **File Operations**: High-performance file read/write with streaming support
- 👀 **Real-time Watching**: WebSocket-based file monitoring and change notifications
- 🔐 **Secure**: kubeconfig-based authentication with built-in security validation
- 🏗️ **Enterprise Ready**: Modular architecture with comprehensive error handling
- 📊 **Monitoring**: Built-in resource monitoring and performance metrics
- 🎯 **Type Safe**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install devbox-sdk
```

## Quick Start

```typescript
import { DevboxSDK } from 'devbox-sdk'

// Initialize the SDK
const sdk = new DevboxSDK({
  kubeconfig: process.env.KUBECONFIG || 'your-kubeconfig-content'
})

// Create a new Devbox instance
const devbox = await sdk.createDevbox({
  name: 'my-nodejs-app',
  runtime: 'node.js',
  resource: { cpu: 1, memory: 2 },
  ports: [{ number: 3000, protocol: 'HTTP' }]
})

// Wait for the Devbox to be ready
await devbox.waitForReady()

// Write files to the Devbox
await devbox.writeFile(
  'package.json',
  JSON.stringify({
    name: 'my-app',
    version: '1.0.0',
    scripts: { start: 'node index.js' }
  })
)

await devbox.writeFile(
  'index.js',
  `
const http = require('http')
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Hello from Devbox!')
})
server.listen(3000, () => {
  console.log('Server running on port 3000')
})
`
)

// Start the Devbox
await devbox.start()

// Execute commands
const result = await devbox.executeCommand('npm install')
console.log('Install result:', result.stdout)

// Watch for file changes
const watcher = await devbox.watchFiles('/workspace', (event) => {
  console.log(`File ${event.path} ${event.type}`)
})
```

## API Reference

### Core SDK

#### `new DevboxSDK(config)`

Create a new SDK instance.

```typescript
const sdk = new DevboxSDK({
  kubeconfig: string,
  baseUrl: string,
  connectionPool: ConnectionPoolConfig,
  http: HttpClientConfig
})
```

#### `sdk.createDevbox(config)`

Create a new Devbox instance.

```typescript
const devbox = await sdk.createDevbox({
  name: string,
  runtime: string,
  resource: { cpu: number, memory: number },
  ports: Array<{ number: number; protocol: string }>,
  env: Record<string, string>
})
```

#### `sdk.getDevbox(name)`

Get an existing Devbox instance.

```typescript
const devbox = await sdk.getDevbox('my-devbox')
```

#### `sdk.listDevboxes()`

List all Devbox instances.

```typescript
const devboxes = await sdk.listDevboxes()
```

### Devbox Instance

#### `devbox.start()`

#### `devbox.pause()`

#### `devbox.restart()`

#### `devbox.delete()`

Manage Devbox lifecycle.

#### `devbox.writeFile(path, content, options?)`

#### `devbox.readFile(path, options?)`

File operations.

#### `devbox.uploadFiles(files, options?)`

Batch file upload.

```typescript
await devbox.uploadFiles({
  'package.json': fs.readFileSync('./package.json'),
  'src/index.js': fs.readFileSync('./src/index.js')
})
```

#### `devbox.executeCommand(command)`

Execute commands in the Devbox.

```typescript
const result = await devbox.executeCommand('ls -la')
console.log(result.stdout)
```

#### `devbox.watchFiles(path, callback)`

Watch for file changes.

```typescript
const watcher = await devbox.watchFiles('/workspace', (event) => {
  console.log(`File ${event.path} was ${event.type}`)
})
```

#### `devbox.getMonitorData(timeRange?)`

Get resource monitoring data.

```typescript
const data = await devbox.getMonitorData({
  start: Date.now() - 3600000, // 1 hour ago
  end: Date.now(),
  step: '1m'
})
```

## Configuration

### Connection Pool

```typescript
const sdk = new DevboxSDK({
  kubeconfig: process.env.KUBECONFIG,
  connectionPool: {
    maxSize: 15, // Maximum connections
    connectionTimeout: 30000, // Connection timeout
    keepAliveInterval: 60000, // Keep-alive interval
    healthCheckInterval: 60000 // Health check interval
  }
})
```

### HTTP Client

```typescript
const sdk = new DevboxSDK({
  kubeconfig: process.env.KUBECONFIG,
  http: {
    timeout: 30000, // Request timeout
    retries: 3, // Number of retries
    proxy: 'http://proxy:8080' // Optional proxy
  }
})
```

## Architecture

The SDK uses a modern HTTP API + Bun runtime architecture:

- **SDK Layer**: TypeScript/Node.js library for programmatic access
- **Connection Pool**: High-performance HTTP connection management
- **API Layer**: kubeconfig-based authentication and Devbox REST API integration
- **Container Layer**: Bun HTTP server (port 3000) running in Devbox containers
- **File Operations**: High-performance file I/O via Bun native APIs
- **Real-time**: WebSocket support for file watching and notifications

## Error Handling

The SDK provides comprehensive error handling with specific error types:

```typescript
import {
  DevboxSDKError,
  AuthenticationError,
  ConnectionError,
  FileOperationError
} from 'devbox-sdk'

try {
  await devbox.executeCommand('npm install')
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message)
  } else if (error instanceof ConnectionError) {
    console.error('Connection failed:', error.message)
  } else if (error instanceof DevboxSDKError) {
    console.error('SDK error:', error.code, error.message)
  }
}
```

## Performance

- **Small file operations**: <50ms latency
- **Large file transfers**: >15MB/s throughput
- **Connection reuse**: >98% efficiency
- **Concurrent operations**: 15+ simultaneous connections
- **Memory usage**: <80MB per container
- **Startup time**: <100ms cold start

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
npm run test:watch
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run linting and tests
6. Submit a pull request

## License

Apache-2.0 © [zjy365](https://github.com/zjy365)

## Support

- **Issues**: [GitHub Issues](https://github.com/zjy365/devbox-sdk/issues)
- **Documentation**: [Full API Docs](https://github.com/zjy365/devbox-sdk/docs)
- **Examples**: [Example Projects](https://github.com/zjy365/devbox-sdk/examples)

## Roadmap

- [ ] Python SDK support
- [ ] CLI tool for SDK operations
- [ ] Advanced monitoring dashboards
- [ ] Integration with popular CI/CD platforms
- [ ] Plugin architecture for custom runtime environments
