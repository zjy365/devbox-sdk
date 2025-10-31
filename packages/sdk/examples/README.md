# Devbox SDK Examples

This directory contains example code demonstrating how to use the Devbox SDK.

## Phase 1 Examples

### Basic Usage (`basic-usage.ts`)

Demonstrates the core Phase 1 functionality:

1. ✅ SDK initialization
2. ✅ List existing devboxes
3. ✅ Create a new devbox
4. ✅ Wait for devbox to be ready
5. ✅ File operations (write/read)
6. ✅ Command execution
7. ✅ Health checks
8. ✅ Lifecycle management (pause/restart/delete)
9. ✅ Resource cleanup

## Running Examples

### Prerequisites

1. **Kubeconfig**: Ensure you have a valid kubeconfig file
   ```bash
   export KUBECONFIG=~/.kube/config
   ```

2. **Devbox API URL** (optional):
   ```bash
   export DEVBOX_API_URL=https://cloud.sealos.io
   ```

### Run Basic Usage Example

```bash
# From the SDK package directory
cd packages/sdk

# Install dependencies (if not already done)
npm install

# Build the SDK
npm run build

# Run the example
npm run example:basic
```

Or run directly with ts-node:

```bash
npx ts-node examples/basic-usage.ts
```

## Example Output

```
✅ SDK initialized

📋 Listing devboxes...
Found 3 devbox(es)

🚀 Creating devbox: test-devbox-1698765432123
✅ Devbox created: test-devbox-1698765432123

⏳ Waiting for devbox to be ready...
[DevboxInstance] Waiting for devbox 'test-devbox-1698765432123' to be ready...
[DevboxInstance] Current status: Pending, waiting...
[DevboxInstance] Current status: Running, waiting...
[DevboxInstance] Devbox 'test-devbox-1698765432123' is ready and healthy
✅ Devbox is ready and healthy

📝 Writing file...
✅ File written

📖 Reading file...
✅ File content: Hello from Devbox SDK!

⚡ Executing command...
✅ Command output: Hello from command execution
   Exit code: 0

🏥 Checking health...
✅ Health status: Healthy

📊 Getting detailed info...
✅ Status: Running
   Runtime: node.js
   Resources: {"cpu":1,"memory":2}

📂 Listing files...
✅ Found 2 file(s) in /workspace

🔄 Testing lifecycle operations...
   Pausing devbox...
   ✅ Devbox paused
   Restarting devbox...
   ✅ Devbox restarted
   ✅ Devbox ready after restart

🧹 Cleaning up...
✅ Devbox deleted

👋 Closing SDK...
[DevboxSDK] Closed all connections and cleaned up resources
✅ SDK closed
```

## Features Demonstrated

### ✅ Implemented in Phase 1

- **SDK Initialization**: Configure with kubeconfig and API endpoint
- **Devbox Lifecycle**: Create, start, pause, restart, delete
- **File Operations**: Read, write files with encoding support
- **Command Execution**: Execute commands and capture output
- **Health Checks**: Verify devbox is ready and healthy
- **Connection Management**: Automatic connection pooling and reuse
- **Error Handling**: Comprehensive error handling and retry logic
- **Resource Cleanup**: Proper cleanup of connections and resources

### 🚧 Coming in Phase 2

- **Session Management**: Persistent shell sessions
- **File Transfer**: Batch upload/download with progress
- **WebSocket Support**: Real-time file watching
- **Advanced Monitoring**: Detailed metrics and monitoring data
- **Release Management**: Create and deploy releases

### 🔮 Coming in Phase 3

- **Complete Examples**: More comprehensive example applications
- **Documentation**: Full API documentation
- **Best Practices**: Usage patterns and recommendations

## Error Handling

The SDK provides comprehensive error handling:

```typescript
try {
  const devbox = await sdk.getDevbox('my-devbox')
  await devbox.waitForReady()
} catch (error) {
  if (error instanceof DevboxSDKError) {
    console.error('SDK Error:', error.code, error.message)
  } else {
    console.error('Unexpected error:', error)
  }
}
```

## Configuration Options

```typescript
const sdk = new DevboxSDK({
  kubeconfig: '...',         // Required: Kubernetes config
  baseUrl: '...',            // Optional: API base URL
  timeout: 30000,            // Optional: Request timeout (ms)
  retries: 3,                // Optional: Number of retries
  connectionPool: {          // Optional: Connection pool config
    maxSize: 15,
    connectionTimeout: 30000,
    healthCheckInterval: 60000,
  },
})
```

## Next Steps

After running the basic example:

1. Try creating devboxes with different runtimes
2. Experiment with file operations
3. Test command execution with your own commands
4. Monitor connection pool statistics
5. Explore error handling scenarios

## Support

For issues or questions:
- Check the main README.md
- Review ARCHITECTURE.md for design details
- See tasks/ directory for implementation tracking

