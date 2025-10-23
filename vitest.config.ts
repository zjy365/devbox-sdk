import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/*.d.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/**/*.spec.ts',
        'packages/*/dist/**',
        '**/*.d.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@sdk': resolve(__dirname, 'packages/sdk/src'),
      '@server': resolve(__dirname, 'packages/server/src')
    }
  }
})