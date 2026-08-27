// Starts the backend used by Playwright against the isolated Oracle test prefix. Keeping this
// wrapper in Node makes the test command work on Windows and CI without shell-specific env syntax.
import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

loadEnv();
process.env.DATABASE_PROVIDER = 'oracle';
process.env.ORACLE_OBJECT_PREFIX = process.env.ORACLE_TEST_OBJECT_PREFIX ?? 'NEXUS_TEST_';
process.env.DATABASE_AUTO_SCHEMA = 'true';

const child = spawn(process.execPath, ['--use-system-ca', 'scripts/dev-database.mjs'], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
