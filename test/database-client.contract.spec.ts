import assert from 'node:assert/strict';
import { test } from 'vitest';
import { OracleDatabase } from '../src/shared/persistence/oracle-database.js';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import type {
  DatabaseClient,
  DatabasePoolConfig,
} from '../src/shared/persistence/database-client.js';
import { createTestDatabase } from './test-utils.js';

const pool: DatabasePoolConfig = {
  min: 1,
  max: 4,
  increment: 1,
  queueTimeoutMs: 2_000,
  connectionTimeoutMs: 15_000,
};

test('PostgreSQL executa consultas independentes sem bloqueio da thread principal', async () => {
  const { databaseUrl } = createTestDatabase('nexus-async-contract-');
  const client = PostgresDatabase.getInstance(databaseUrl, pool);
  await client.initialize();

  const slow = client.queryOne('SELECT pg_sleep(1), 1 AS value').then(() => 'slow');
  await new Promise((resolve) => setTimeout(resolve, 25));
  const fast = client.queryOne<{ value: number }>('SELECT 2 AS value').then((row) => {
    assert.equal(row?.value, 2);
    return 'fast';
  });

  assert.equal(await Promise.race([slow, fast]), 'fast');
  await slow;
});

const oracleConfigured = Boolean(
  process.env.ORACLE_TEST_CONNECT_STRING &&
  process.env.ORACLE_TEST_USER &&
  process.env.ORACLE_TEST_PASSWORD,
);

test.skipIf(!oracleConfigured)(
  'Oracle Thin cumpre o contrato básico e rollback transacional',
  async () => {
    const client: DatabaseClient = new OracleDatabase({
      connectString: process.env.ORACLE_TEST_CONNECT_STRING!,
      user: process.env.ORACLE_TEST_USER!,
      password: process.env.ORACLE_TEST_PASSWORD!,
      pool,
      objectPrefix: process.env.ORACLE_TEST_OBJECT_PREFIX ?? 'NEXUS_TEST_',
    });
    process.env.DATABASE_AUTO_SCHEMA = 'false';
    await client.initialize();
    try {
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
    } finally {
      await client.close();
    }
  },
);
