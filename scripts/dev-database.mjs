import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

const distPath = resolve(process.cwd(), 'dist', 'src', 'main.js');
const startOnly = process.argv.includes('--start-only');
const port = Number(process.env.PORT || 4001);

if (!existsSync(distPath)) {
  console.error('dist/src/main.js not found. Run `npm run build` before starting the dev server.');
  process.exit(1);
}

if (!startOnly) console.log(`Starting Nexus with Oracle on http://localhost:${port}`);

// Teto de heap explícito (issue #291): o servidor HTTP nunca deveria precisar de mais que o
// default do Node 22 (~4GB) — se precisar, é sintoma de uma query sem limite, não motivo para
// dobrar o teto (isso só tornaria a mesma morte mais lenta). Scripts de migração legitimamente
// usam 8192 (package.json); aqui, nunca.
const heapFlag = '--max-old-space-size=4096';
const child = spawn(
  process.execPath,
  startOnly ? [heapFlag, distPath] : [heapFlag, '--watch', distPath],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_AUTO_SCHEMA: process.env.DATABASE_AUTO_SCHEMA ?? 'false',
    },
    shell: false,
  },
);

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
