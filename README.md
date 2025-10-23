# Devbox SDK

Enterprise TypeScript SDK for Sealos Devbox management with HTTP API + Bun runtime architecture.

## 🏗️ Architecture

This project is a monorepo containing two main packages:

- **@sealos/devbox-sdk** - TypeScript SDK for Devbox management
- **@sealos/devbox-server** - HTTP server for Devbox runtime (Bun-based)

## 📦 Packages

### @sealos/devbox-sdk

TypeScript/Node.js SDK providing high-level APIs for Devbox management:

- Devbox lifecycle management
- HTTP connection pooling
- File transfer with adaptive strategies
- Security and monitoring

### @sealos/devbox-server

High-performance HTTP server running in Devbox containers:

- File operations API
- Process execution
- Real-time file watching via WebSocket
- Built on Bun runtime

## 🚀 Quick Start

### Installation

```bash
npm install @sealos/devbox-sdk
```

### Basic Usage

```typescript
import { DevboxSDK } from '@sealos/devbox-sdk'

const sdk = new DevboxSDK({
  kubeconfig: process.env.KUBECONFIG
})

// Create a Devbox
const devbox = await sdk.createDevbox({
  name: 'my-app',
  runtime: 'node.js',
  resource: { cpu: 1, memory: 2 }
})

// Write files
await devbox.writeFile('index.js', 'console.log("Hello World")')

// Execute commands
const result = await devbox.executeCommand('node index.js')
console.log(result.stdout)
```

## 🛠️ Development

### Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Lint code
npm run lint:fix
```

### Package Scripts

```bash
# Build SDK only
npm run build:sdk

# Build server only
npm run build:server

# Run in development mode
npm run dev
```

## 📁 Project Structure

```
devbox-sdk/
├── packages/
│   ├── sdk/              # Main SDK package
│   │   ├── src/
│   │   │   ├── core/     # Core SDK functionality
│   │   │   ├── api/      # API integration
│   │   │   ├── http/     # HTTP client
│   │   │   ├── transfer/ # File transfer
│   │   │   ├── security/ # Security features
│   │   │   └── monitoring/ # Metrics & logging
│   │   └── dist/         # Built output
│   └── server/           # HTTP server package
│       ├── src/
│       │   ├── handlers/ # Request handlers
│       │   ├── utils/    # Server utilities
│       │   └── types/    # Type definitions
│       └── dist/         # Built output
├── openspec/             # OpenSpec specifications
├── tasks/                # Task documentation
├── docs/                 # Additional documentation
└── dist/                 # Build outputs
```

## ⚡ Performance

- **Connection Pooling**: Efficient HTTP connection reuse
- **Adaptive Transfer**: Smart file transfer strategies
- **Bun Runtime**: High-performance server runtime
- **TypeScript**: Full type safety and IDE support

## 🔧 Configuration

### Environment Variables

#### Server (@sealos/devbox-server)
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `WORKSPACE_PATH` - Workspace directory (default: /workspace)
- `ENABLE_CORS` - Enable CORS (default: false)
- `MAX_FILE_SIZE` - Max file size in bytes (default: 100MB)

#### SDK (@sealos/devbox-sdk)
- `KUBECONFIG` - Kubernetes configuration for Devbox API access

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e
```

## 📚 Documentation

- [API Reference](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Architecture Overview](./REFACTOR_PLAN.md)

## 📄 License

Apache-2.0

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the documentation
- Contact the maintainers