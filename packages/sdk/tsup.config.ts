import { defineConfig } from 'tsup'

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],

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
  bundle: true,
  splitting: false, // Libraries don't need code splitting

  // Optimization
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,

  // Target environment (matches package.json engines: node >= 22)
  target: ['es2022', 'node22'],
  platform: 'node',

  // Output file extensions
  outExtension(ctx) {
    return {
      dts: ctx.format === 'cjs' ? '.d.cts' : '.d.ts',
      js: ctx.format === 'cjs' ? '.cjs' : '.mjs'
    }
  },

  // External dependencies (don't bundle these)
  external: [
    'ws'
  ],

  // Build hooks
  onSuccess: async () => {
    console.log('✅ SDK built successfully')
  }
})