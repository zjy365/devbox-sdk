import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'

 
const envPath = resolve(__dirname, '.env')
if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: true })
  console.log('[vitest] Loaded environment variables from .env')
} else {
  console.warn('[vitest] Warning: .env file not found at', envPath)
}

const currentEnv = { ...process.env }

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    silent: false,  
    include: ['packages/**/tests/**/*.{test,bench}.ts'],
    exclude: ['node_modules', 'dist', '**/*.d.ts'],
    testTimeout: 300000, 
    hookTimeout: 180000, 
    env: currentEnv,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/**/*.spec.ts',
        'packages/*/src/**/*.bench.ts',
        'packages/*/dist/**',
        '**/types/**',
        '**/*.d.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    benchmark: {
      include: ['packages/**/tests/**/*.bench.ts'],
      exclude: ['node_modules', 'dist'],
    }
  },
  resolve: {
    alias: {
      '@sdk': resolve(__dirname, 'packages/sdk/src'),
      '@shared': resolve(__dirname, 'packages/shared/src')
    }
  }
})