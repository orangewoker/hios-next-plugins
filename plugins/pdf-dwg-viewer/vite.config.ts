import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'runtime',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: { input: resolve(__dirname, 'index.html') },
  },
});
