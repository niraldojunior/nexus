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
    // NEXUS_NO_HMR=1 desliga o HMR *e* o WebSocket do Vite (issue #182). `hmr: false` sozinho
    // não basta: o @vite/client continua sendo injetado e abrindo o socket, e quando a aba volta
    // a ficar visível depois de uma queda de conexão ele chama `location.reload()`
    // (waitForSuccessfulPing) — era esse o refresh que apagava a posição/endereço do mapa Geo
    // antes de existir persistência (ver utils/geoViewState.ts). Sem servidor WS o socket nunca
    // abre, então o par disconnect → ping → reload não acontece. Opt-in, não default: sem a
    // flag, o dev mantém Fast Refresh e overlay de erro.
    ...(process.env.NEXUS_NO_HMR
      ? { hmr: false, ws: false }
      : { hmr: { overlay: true, timeout: 60_000 } }),
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
