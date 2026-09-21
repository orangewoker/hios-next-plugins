import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/runtime'),
  base: './',
  build: { outDir: resolve(__dirname, 'runtime'), emptyOutDir: true, target: 'es2022' },
});
