import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

const distPath = resolve(process.cwd(), 'dist', 'src', 'main.js');
const startOnly = process.argv.includes('--start-only');
const provider = process.env.DATABASE_PROVIDER || 'postgres';
const port = Number(process.env.PORT || 4001);

if (!existsSync(distPath)) {
  console.error('dist/src/main.js not found. Run `npm run build` before starting the dev server.');
  process.exit(1);
}

if (!startOnly) console.log(`Starting Nexus with ${provider} on http://localhost:${port}`);

const child = spawn(process.execPath, startOnly ? [distPath] : ['--watch', distPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_PROVIDER: provider,
    DATABASE_AUTO_SCHEMA: process.env.DATABASE_AUTO_SCHEMA ?? 'true',
  },
  shell: false,
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
