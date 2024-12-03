import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  minify: true,
  outDir: 'dist',
  target: 'node16',
  external: ['@kubernetes/client-node', 'nanoid', '@types/node', 'bufferutil'],
  onSuccess: 'tsc --emitDeclarationOnly --declaration',
  sourcemap: process.env.NODE_ENV === 'development',
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.js',
    };
  },
  esbuildOptions(options) {
    options.drop = ['console'];
  },
});
