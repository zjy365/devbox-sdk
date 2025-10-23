import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  minify: false,
  outDir: 'dist',
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
  platform: 'node'
})