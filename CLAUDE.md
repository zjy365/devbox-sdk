# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Devbox SDK is an enterprise TypeScript monorepo for Sealos Devbox management with HTTP API + Bun runtime architecture. The project consists of:

- **@sealos/devbox-sdk**: TypeScript/Node.js SDK for Devbox lifecycle management, connection pooling, and file operations
- **@sealos/devbox-server**: High-performance HTTP server running inside Devbox containers (Bun runtime)
- **@sealos/devbox-shared**: Shared types and utilities

**Current Status** (as of 2025-11-03): Core implementation complete, Phase 4 testing in progress.

## Build and Development Commands

### Building

```bash
# Build all packages
npm run build

# Build specific packages
npm run build:sdk
npm run build:server

# Clean build artifacts
npm run clean
```

### Testing

```bash
# Run all tests (requires .env file with DEVBOX_API_URL and KUBECONFIG)
npm test

# Run tests in watch mode (SDK only)
cd packages/sdk && npm run test:watch

# Run E2E tests (requires live Devbox environment)
npm run test:e2e

# Run benchmarks
cd packages/sdk && npm test -- --run benchmarks
```

**Test Requirements**: Tests require environment variables `DEVBOX_API_URL` and `KUBECONFIG` in a `.env` file at the root. Tests interact with real Devbox instances and include automatic cleanup.

### Linting and Type Checking

```bash
# Lint all packages (Biome)
npm run lint

# Fix linting issues
npm run lint:fix

# Type check
npm run typecheck
```

### Development

```bash
# Run server in development mode
npm run dev

# Or run server directly
cd packages/server && bun run src/index.ts
```

## Architecture

### SDK Architecture (`packages/sdk/`)

The SDK follows a layered architecture:

1. **Core Layer** (`src/core/`):
   - `DevboxSDK.ts`: Main SDK class, factory for DevboxInstance objects
   - `DevboxInstance.ts`: Represents individual Devbox containers with file ops, command execution, monitoring
   - `types.ts`: Core type definitions
   - `constants.ts`: Default configuration values

2. **API Integration Layer** (`src/api/`):
   - `client.ts`: DevboxAPI class - REST client for Sealos Devbox API with 17 endpoints
   - `auth.ts`: Kubeconfig-based authentication via `KubeconfigAuthenticator`
   - `endpoints.ts`: API endpoint definitions
   - Uses custom `SimpleHTTPClient` for HTTP requests

3. **HTTP Connection Layer** (`src/http/`):
   - `manager.ts`: `ConnectionManager` handles pool lifecycle
   - `pool.ts`: `ConnectionPool` implements intelligent connection reuse (>98% reuse rate)
   - `types.ts`: Connection-related types
   - Connections are pooled per Devbox instance URL

4. **Transfer Engine** (`src/transfer/`):
   - `engine.ts`: Adaptive file transfer strategies
   - Planned support for batch uploads, compression, progress tracking

5. **Security** (`src/security/`):
   - `adapter.ts`: Security policy enforcement
   - Path validation and access control

6. **Monitoring** (`src/monitoring/`):
   - `metrics.ts`: Performance metrics collection
   - Connection pool stats, transfer metrics

### Server Architecture (`packages/server/`)

The server runs inside Devbox containers on Bun runtime:

1. **Core** (`src/core/`):
   - `server.ts`: Main HTTP server (deprecated, being refactored)
   - `container.ts`: DI container (`ServiceContainer`)
   - `router.ts`: Pattern-based routing
   - `middleware.ts`: CORS, logging, error handling, timeout
   - `response-builder.ts`: Standardized API responses
   - `validation-middleware.ts`: Zod-based request validation

2. **Handlers** (`src/handlers/`):
   - `files.ts`: File operations (read, write, delete, list, batch-upload)
   - `process.ts`: Command execution and process management
   - `session.ts`: Interactive shell sessions with stateful context
   - `health.ts`: Health checks and metrics
   - `websocket.ts`: Real-time file watching via WebSocket

3. **Session Management** (`src/session/`):
   - `manager.ts`: `SessionManager` - manages multiple shell sessions
   - `session.ts`: `ShellSession` - individual session with environment, cwd tracking

4. **Utilities**:
   - `utils/process-tracker.ts`: Background process lifecycle tracking
   - `utils/file-watcher.ts`: Chokidar-based file watching
   - `validators/schemas.ts`: Zod validation schemas

**Entry Point**: `src/index.ts` bootstraps `DevboxHTTPServer` with environment config.

### Key Architectural Patterns

**Connection Pooling**: SDK maintains per-URL connection pools with health checks, automatic cleanup, and high reuse rates. The `ConnectionManager` coordinates multiple pools, while `ConnectionPool` handles individual pool lifecycle.

**Two-Layer Communication**:
1. SDK → Sealos Devbox API (REST): Lifecycle management (create, delete, list, SSH info, monitoring)
2. SDK → Devbox Container Server (HTTP/WS): File operations, command execution via the Bun server running at `http://{podIP}:3000`

**Error Handling**: Custom `DevboxSDKError` with typed error codes (`ERROR_CODES`) for consistent error handling across SDK and server.

**Type Safety**: Shared types in `@sealos/devbox-shared` ensure contract consistency between SDK and server.

## Configuration

### SDK Configuration

Environment variables (for tests):
- `DEVBOX_API_URL`: Sealos Devbox API endpoint
- `KUBECONFIG`: Kubernetes configuration for authentication

### Server Configuration

Environment variables:
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `WORKSPACE_PATH`: Workspace directory (default: /workspace)
- `ENABLE_CORS`: Enable CORS (default: false)
- `MAX_FILE_SIZE`: Max file size in bytes (default: 100MB)

## Build System

- **Monorepo**: Turborepo with npm workspaces
- **SDK Build**: tsup (ESM + CJS, ~44KB each), outputs to `packages/sdk/dist/`
- **Server Build**: `bun build --compile` creates standalone binaries
  - `npm run build`: Current platform
  - `npm run build:linux`: Linux x64
  - `npm run build:macos`: macOS ARM64
- **Linting**: Biome (configured in `biome.json`) - use single quotes, 100 char line width, semicolons "asNeeded"
- **Type Checking**: TypeScript 5.5+, target ES2022, Node 22+

## Testing Strategy

Tests are organized by type:

1. **Unit Tests** (`__tests__/unit/`): Test individual components in isolation
   - `connection-pool.test.ts`: Connection pool behavior
   - `devbox-sdk.test.ts`: SDK core functionality
   - `devbox-instance.test.ts`: Instance operations

2. **Integration Tests** (`__tests__/integration/`): Test component interactions
   - `api-client.test.ts`: API client integration
   - `workflow.test.ts`: End-to-end workflows
   - `concurrency.test.ts`: Concurrent operations

3. **E2E Tests** (`__tests__/e2e/`): Test against live Devbox
   - `file-operations.test.ts`: File operations
   - `app-deployment.test.ts`: Application deployment scenarios

4. **Benchmarks** (`__tests__/benchmarks/`): Performance testing
   - `performance.bench.ts`: Connection pool, file transfer benchmarks

**Test Helpers** (`__tests__/setup.ts`):
- `TestHelper`: Manages test Devbox lifecycle with automatic cleanup
- `globalHelper`: Singleton instance for shared test resources
- Use `waitForDevboxReady()` to ensure Devbox is running before tests

## Important Notes

### Running Tests

- Tests require a live Sealos Devbox environment
- Set `DEVBOX_API_URL` and `KUBECONFIG` in `.env`
- Tests create real Devbox instances (prefixed with `test-{timestamp}-{random}`)
- Cleanup is automatic via `TestHelper.cleanup()` in `afterAll` hooks
- Test timeouts: 5 minutes for tests, 3 minutes for hooks

### Testing Single Files

Run a specific test file:
```bash
cd packages/sdk && npm test -- __tests__/unit/connection-pool.test.ts
```

### SDK Development

- Main exports from `packages/sdk/src/index.ts`: `DevboxSDK`, `DevboxInstance`, types
- To add new API endpoints: Update `api/client.ts`, `api/endpoints.ts`, and `api/types.ts`
- Connection pool config in `core/constants.ts` (`DEFAULT_CONFIG`)

### Server Development

- Server binds to all interfaces (0.0.0.0) by default for container networking
- Use `SessionHandler` for stateful shell interactions (maintains cwd, env)
- Use `ProcessHandler` for one-off commands
- All handlers return standardized responses via `ResponseBuilder`

### Bun-Specific Code

The server package uses Bun-specific APIs:
- `Bun.write()`, `Bun.file()` for file operations
- `Bun.spawn()` for process execution
- WebSocket is Bun's native implementation

Do not use Bun APIs in the SDK package (Node.js runtime).

## Code Style

- **Formatting**: Enforced by Biome (semicolons "asNeeded", single quotes, 100 char width)
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Imports**: Use path aliases (`@sdk/`, `@server/`, `@shared/`) in tests
- **Exports**: Prefer named exports over default exports
- **Error Handling**: Use `DevboxSDKError` with appropriate `ERROR_CODES`

## Documentation

- Main README: `/README.md`
- Package READMEs: `packages/*/README.md`
- Task tracking: `tasks/` directory with PRDs and implementation plans
- Architecture docs: `plans/REFACTOR_PLAN.md`
- API specs: `openspec/` directory

## Release Process

- Changesets are configured (`@changesets/cli`)
- Version bumping: `npm run version`
- Publishing: `npm run release`
- CI/Release workflows currently disabled (manual trigger only)
