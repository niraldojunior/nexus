import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { buildDevSqliteRuntimeEnv, ensureDevSqliteDataDir } from '../dist/src/shared/config/dev-sqlite-core.js';

const workspaceRoot = process.cwd();
const distPath = resolve(workspaceRoot, 'dist', 'src', 'main.js');

ensureDevSqliteDataDir(workspaceRoot);

const env = buildDevSqliteRuntimeEnv(process.env);
const port = Number(env.PORT || 4001);

if (!process.argv.includes('--start-only')) {
  console.log(`Starting Nexus dev server with SQLite defaults on http://localhost:${port}`);
}

if (!existsSync(distPath)) {
  console.error('dist/src/main.js not found. Run `npm run build` before starting the dev server.');
  process.exit(1);
}

const child = spawn(process.execPath, ['--watch', distPath], {
  stdio: 'inherit',
  env,
  shell: false,
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
