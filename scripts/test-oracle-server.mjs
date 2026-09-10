// Starts the backend used by Playwright against the isolated Oracle test prefix. Keeping this
// wrapper in Node makes the test command work on Windows without shell-specific env syntax.
import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

loadEnv();
process.env.ORACLE_OBJECT_PREFIX = process.env.ORACLE_TEST_OBJECT_PREFIX ?? 'NEXUS_TEST_';
process.env.DATABASE_AUTO_SCHEMA = 'true';
// Fixture local do Playwright: permite que a SPA atravesse o login com um JWT real emitido pelo
// backend de teste. São valores deliberadamente não secretos e independentes do .env local.
process.env.AUTH_JWT_SECRET = 'playwright-oracle-test-jwt-secret';
process.env.ADMIN_EMAIL = 'playwright-admin@nexus.test';
process.env.ADMIN_PASSWORD = 'playwright-admin-password';
process.env.NODE_ENV = 'test';

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
