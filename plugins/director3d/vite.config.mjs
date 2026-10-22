import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ base: './', plugins: [vue()], build: { outDir: 'runtime', emptyOutDir: true, rollupOptions: { input: ['index.html', 'app.html'] } } });
