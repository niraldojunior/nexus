import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const localChromiumPath = existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    : undefined;

export default defineConfig({
  testDir: './test/system',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    // 5200 é a porta de desenvolvimento interativo; a regressão usa 5201 para nunca reutilizar
    // uma sessão local nem disputar o fallback do backend nessa porta.
    baseURL: 'http://127.0.0.1:5201',
    launchOptions:
      process.env.CI || !localChromiumPath ? {} : { executablePath: localChromiumPath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'node --use-system-ca scripts/test-oracle-server.mjs',
      url: 'http://127.0.0.1:4001/health',
      // O backend precisa ser o que fixa NEXUS_TEST_; não reutilize uma sessão local.
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run web:dev -- --host 127.0.0.1 --port 5201 --strictPort',
      url: 'http://127.0.0.1:5201',
      // Não anexe a uma resposta arbitrária em 5200 (ex.: o fallback HTML do backend).
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
