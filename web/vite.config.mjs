import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { stripApiPrefix } from './proxy-rewrite.mjs';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5200,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
        rewrite: stripApiPrefix,
      },
      '/api/tmf-api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
        rewrite: stripApiPrefix,
      },
      '/v1': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
      },
      '/tmf-api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
