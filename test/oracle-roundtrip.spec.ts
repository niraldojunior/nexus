import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import { prefixed } from '../src/shared/persistence/oracle-object-names.js';
import {
  TEST_ORACLE_PREFIX,
  cleanupOracleTables,
  getOracleTestClient,
  isOracleTestConfigured,
} from './test-utils.js';

// End-to-end Oracle verification against a real instance. Skips unless ORACLE_* is configured, so
// the default database-free suite never tries to connect. Run it with `npm run test:oracle` after setting
// DATABASE_PROVIDER=oracle and the ORACLE_* connection in .env.
//
// It exercises the whole Oracle path at once: DDL generation with the NEXUS_TEST_ prefix
// (auto-schema), the `?`→`:n` + table-prefix translator, and a repository-shaped insert/select
// round-trip. If the prefix or the SQL translation were wrong, this fails against the server.

// Explicit opt-in: DATABASE_PROVIDER=oracle (set by `npm run test:oracle`). Creds alone are not
// enough — a plain `npm test` must never reach out to the corporate Oracle just because .env has the
// connection in it.
const oracleConfigured = isOracleTestConfigured() && process.env.DATABASE_PROVIDER === 'oracle';

// Auto-create the prefixed schema on initialize(). Only affects the NEXUS_TEST_ namespace.
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

test.skipIf(!oracleConfigured)(
  'cria o schema prefixado e faz round-trip em tmf_party',
  async () => {
    const client = await getOracleTestClient();

    const id = `oracle-roundtrip-${Date.now()}`;
    await client.execute('INSERT INTO tmf_party (id, name, party_type) VALUES (?, ?, ?)', [
      id,
      'Oracle Roundtrip Co',
      'Organization',
    ]);

    const row = await client.queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM tmf_party WHERE id = ?',
      [id],
    );
    assert.equal(row?.name, 'Oracle Roundtrip Co');
  },
);

test.skipIf(!oracleConfigured)(
  'os objetos vivem sob o prefixo de teste no schema único',
  async () => {
    const client = await getOracleTestClient();
    const expected = prefixed('tmf_party', TEST_ORACLE_PREFIX).toUpperCase();
    const found = await client.queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM user_tables WHERE table_name = ?',
      [expected],
    );
    assert.equal(Number(found?.n), 1);
  },
);
