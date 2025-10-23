<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `devbox-sdk`, a Node.js TypeScript CLI tool and library that provides development utilities. The project is configured as a dual-package (CommonJS + ESM) with comprehensive tooling for development, testing, and publishing.

## Architecture

The project follows a standard TypeScript CLI/library structure:

- **`src/main.ts`** - Main library exports (currently contains basic utility functions)
- **`src/bin/cli.ts`** - CLI entry point with hashbang shebang, imports from main library
- **`__tests__/`** - Test files using Node.js native test runner
- **`dist/`** - Build output directory (generated, not in source control)

The build system uses `tsup` to bundle both CJS and ESM formats with TypeScript declaration files. The CLI is published as `./dist/bin/cli.cjs` while the library exports support dual module systems.

## Development Commands

### Essential Commands

```bash
# Install dependencies
npm install

# Development (run CLI directly)
npm start

# Build project
npm run build

# Run tests
npm test

# Watch tests
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Single Test Execution

The project uses Node.js native test runner. Run specific test files:

```bash
node --import tsx --test __tests__/app.test.ts
```

## Build System

The project uses `tsup` for bundling with the following configuration:

- Dual format output (CJS and ESM)
- TypeScript declaration generation
- Node.js platform targeting ES2022
- Bundled dependencies (skipNodeModulesBundle: false)
- Output in `dist/` directory

Build process: `tsc && tsup` - TypeScript compilation followed by bundling.

## Code Quality Standards

- **ESLint**: Uses `neostandard` with TypeScript support and security plugins
- **Prettier**: Configured with `.prettierrc.json`
- **Husky**: Git hooks for pre-commit and pre-push validation
- **Testing**: Native Node.js test runner with `c8` coverage
- **Security**: ESLint security plugin enabled with strict rules

## Testing

Tests use Node.js native test runner with `tsx` for TypeScript support. Coverage reports are generated in `coverage/` directory. Test files should follow the pattern `__tests__/**/*.test.ts`.

## Publishing

The project uses `changesets` for version management and publishing:

```bash
npm run version    # Bump version based on changesets
npm run release    # Publish to npm
```

The package is configured with provenance and public access.
