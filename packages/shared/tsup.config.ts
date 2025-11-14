import { defineConfig } from 'tsup'

export default defineConfig({
  // Multiple entry points for sub-path exports
  entry: {
    'errors/index': 'src/errors/index.ts',
    'types/index': 'src/types/index.ts',
    'logger/index': 'src/logger/index.ts'
  },

  // Output formats
  format: ['esm', 'cjs'],
  dts: {
    resolve: true,
    compilerOptions: {
      composite: false,
    },
  },
  tsconfig: './tsconfig.json',

  // Output configuration
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  splitting: false,

  // Optimization
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,

  // Target environment
  target: ['es2022', 'node22'],
  platform: 'node',

  // Output file extensions
  outExtension(ctx) {
    return {
      dts: ctx.format === 'cjs' ? '.d.cts' : '.d.ts',
      js: ctx.format === 'cjs' ? '.cjs' : '.js'
    }
  },

  // Build hooks
  onSuccess: async () => {
    console.log('✅ Shared package built successfully')
  }
})
