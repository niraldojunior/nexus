// Runs the Oracle-facing specs against a real Oracle instance. Sets DATABASE_PROVIDER=oracle (the
// explicit opt-in the Oracle specs gate on) and forces a single worker, because DEV/HML/PRD/TEST
// share one schema — the whole suite runs under the one NEXUS_TEST_ prefix, so parallel workers
// would collide on the same objects.
//
// Prerequisites in .env: ORACLE_CONNECTION_STRING, ORACLE_USER, ORACLE_PASSWORD, and a test prefix
// (ORACLE_OBJECT_PREFIX / ORACLE_TEST_OBJECT_PREFIX ending in _TEST_). The run auto-creates the
// prefixed schema, so the Oracle user needs DDL privileges.

import { spawnSync } from 'node:child_process';

process.env.DATABASE_PROVIDER = 'oracle';

const result = spawnSync(
  process.execPath,
  [
    '--use-system-ca',
    'node_modules/vitest/vitest.mjs',
    'run',
    '--pool',
    'threads',
    '--no-file-parallelism',
    '--config',
    'vitest.config.ts',
    'test/oracle-dialect.spec.ts',
    'test/database-client.contract.spec.ts',
    'test/oracle-roundtrip.spec.ts',
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
