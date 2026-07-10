import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { buildDevNeonRuntimeEnv, ensureDevDataDir } from '../dist/src/shared/config/dev-neon-core.js';

loadEnv();

const workspaceRoot = process.cwd();
const distPath = resolve(workspaceRoot, 'dist', 'src', 'main.js');
const startOnly = process.argv.includes('--start-only');

ensureDevDataDir(workspaceRoot);

const env = buildDevNeonRuntimeEnv(process.env);
const port = Number(env.PORT || 4001);

if (!startOnly) {
  console.log(`Starting Nexus dev server with Neon/Postgres on http://localhost:${port}`);
}

if (!existsSync(distPath)) {
  console.error('dist/src/main.js not found. Run `npm run build` before starting the dev server.');
  process.exit(1);
}

const child = spawn(process.execPath, startOnly ? [distPath] : ['--watch', distPath], {
  stdio: 'inherit',
  env: {
    ...env,
    DATABASE_AUTO_SCHEMA: env.DATABASE_AUTO_SCHEMA ?? 'true',
    DATABASE_BRIDGE_TIMEOUT_MS: env.DATABASE_BRIDGE_TIMEOUT_MS ?? '120000',
    DATABASE_CONNECTION_TIMEOUT_MS: env.DATABASE_CONNECTION_TIMEOUT_MS ?? '60000',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
  },
  shell: false,
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
