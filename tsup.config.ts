import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Main SDK library entry point
    entryPoints: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: { only: true },
    minify: false,
    outDir: 'dist/',
    clean: true,
    sourcemap: true,
    bundle: true,
    splitting: false,
    outExtension(ctx) {
      return {
        dts: ctx.format === 'cjs' ? '.d.cts' : '.d.ts',
        js: ctx.format === 'cjs' ? '.cjs' : '.mjs'
      }
    },
    treeshake: true,
    target: ['es2022', 'node18', 'node20'],
    platform: 'node',
    tsconfig: './tsconfig.json',
    cjsInterop: true,
    keepNames: false,
    skipNodeModulesBundle: false,
    external: [],
    onSuccess: async () => {
      console.log('✅ Devbox SDK build completed successfully')
      console.log('📦 Generated files:')
      console.log('   - dist/index.mjs (ESM)')
      console.log('   - dist/index.cjs (CommonJS)')
      console.log('   - dist/index.d.ts (TypeScript definitions)')
    }
  }
])
