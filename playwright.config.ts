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
    baseURL: 'http://127.0.0.1:5200',
    launchOptions: process.env.CI || !localChromiumPath ? {} : { executablePath: localChromiumPath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'npm run dev:sqlite',
      url: 'http://127.0.0.1:4001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run web:dev',
      url: 'http://127.0.0.1:5200',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
