import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

// 加载 .env 文件
loadEnv()

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    silent: false, // 显示 console 输出
    include: ['packages/**/__tests__/**/*.{test,bench}.ts'],
    exclude: ['node_modules', 'dist', '**/*.d.ts'],
    testTimeout: 300000, // 5 minutes for complex tests
    hookTimeout: 180000, // 3 minutes for setup/teardown
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
      include: ['packages/**/__tests__/**/*.bench.ts'],
      exclude: ['node_modules', 'dist'],
    }
  },
  resolve: {
    alias: {
      '@sdk': resolve(__dirname, 'packages/sdk/src'),
      '@server': resolve(__dirname, 'packages/server/src'),
      '@shared': resolve(__dirname, 'packages/shared/src')
    }
  }
})