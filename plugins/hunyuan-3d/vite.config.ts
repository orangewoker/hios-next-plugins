import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  plugins: [react()],
  base: './',
  build: {
    outDir: resolve(__dirname, 'app'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
});
