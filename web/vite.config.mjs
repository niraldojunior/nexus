import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      },
      '/api/tmf-api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
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
