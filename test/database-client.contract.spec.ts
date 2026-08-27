import assert from 'node:assert/strict';
import { test } from 'vitest';
import { getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

const oracleConfigured = isOracleTestConfigured() && process.env.DATABASE_PROVIDER === 'oracle';

test.skipIf(!oracleConfigured)(
  'Oracle Thin cumpre o contrato básico e rollback transacional',
  async () => {
    const client = await getOracleTestClient();
    const health = await client.healthCheck();
    assert.equal(health.healthy, true);
    const row = await client.queryOne<{ value: string }>('SELECT 1 AS "value" FROM DUAL');
    assert.equal(Number(row?.value), 1);
    await assert.rejects(
      client.transaction(async (session) => {
        await session.queryOne('SELECT 1 FROM DUAL');
        throw new Error('rollback-contract');
      }),
      /rollback-contract/,
    );
  },
);
