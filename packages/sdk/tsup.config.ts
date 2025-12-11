import { defineConfig } from 'tsup'
import { readdirSync, statSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

// Recursively remove empty directories
function removeEmptyDirs(dir: string): boolean {
  const entries = readdirSync(dir, { withFileTypes: true })
  let isEmpty = true

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Recursively check subdirectories
      if (removeEmptyDirs(fullPath)) {
        // Remove the empty subdirectory
        rmdirSync(fullPath)
      } else {
        isEmpty = false
      }
    } else {
      isEmpty = false
    }
  }

  return isEmpty
}

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],

  // Output formats
  format: ['esm', 'cjs'],
  dts: {
    resolve: true,
  },
  tsconfig: './tsconfig.build.json',

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
  // Note: devbox-shared is bundled, only ws is external
  external: [
    'ws'
  ],

  // Clean up empty directories after build
  onSuccess: async () => {
    removeEmptyDirs('dist')
    console.log('✓ Cleaned up empty directories')
  }
})