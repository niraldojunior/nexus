import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runOutboxRelayOnce, type OutboxMessage } from '../src/shared/runtime/outbox-relay.js';
import type { DatabaseClient, DatabaseRunResult } from '../src/shared/persistence/database-client.js';

// Fake mínimo de DatabaseClient sobre um array em memória — só `run`/`get`/`all` importam para
// o relay; o resto da interface (transaction/close/healthCheck/...) nunca é chamado por ele.
type FakeOutboxRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  topic: string;
  payload: string;
  status: 'pending' | 'published' | 'failed';
  created_at: string;
  published_at: string | null;
};

const createFakeDb = (rows: FakeOutboxRow[]): DatabaseClient => {
  const db = {
    async run(sql: string, params: unknown[] = []): Promise<DatabaseRunResult> {
      if (sql.includes("UPDATE tmf_outbox SET status = 'published'")) {
        const [publishedAt, id] = params as [string, string];
        const row = rows.find((item) => item.id === id);
        if (row) {
          row.status = 'published';
          row.published_at = publishedAt;
        }
        return { changes: row ? 1 : 0 };
      }
      throw new Error(`unexpected run(): ${sql}`);
    },
    async get<T>(): Promise<T | undefined> {
      throw new Error('unexpected get()');
    },
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes("FROM tmf_outbox")) {
        const [limit] = params as [number];
        return rows.filter((row) => row.status === 'pending').slice(0, limit) as unknown as T[];
      }
      throw new Error(`unexpected all(): ${sql}`);
    },
  } as unknown as DatabaseClient;
  return db;
};

const buildRow = (overrides: Partial<FakeOutboxRow> = {}): FakeOutboxRow => ({
  id: 'outbox-1',
  tenant_id: 'default',
  event_id: 'event-1',
  topic: 'tmf688.resource',
  payload: JSON.stringify({ hello: 'world' }),
  status: 'pending',
  created_at: new Date().toISOString(),
  published_at: null,
  ...overrides,
});

test('runOutboxRelayOnce publica linhas pendentes e marca published_at', async () => {
  const rows = [buildRow()];
  const db = createFakeDb(rows);
  const published: OutboxMessage[] = [];

  const result = await runOutboxRelayOnce(db, (message) => {
    published.push(message);
  });

  assert.equal(result.published, 1);
  assert.equal(result.failed, 0);
  assert.equal(published.length, 1);
  assert.equal(published[0]?.topic, 'tmf688.resource');
  assert.deepEqual(published[0]?.payload, { hello: 'world' });
  assert.equal(rows[0]?.status, 'published');
  assert.ok(rows[0]?.published_at);
});

test('runOutboxRelayOnce deixa a linha pending quando o publish falha (retry na próxima varredura)', async () => {
  const rows = [buildRow({ id: 'outbox-2' })];
  const db = createFakeDb(rows);

  const result = await runOutboxRelayOnce(db, () => {
    throw new Error('sink indisponível');
  });

  assert.equal(result.published, 0);
  assert.equal(result.failed, 1);
  assert.equal(rows[0]?.status, 'pending');
  assert.equal(rows[0]?.published_at, null);
});

test('runOutboxRelayOnce ignora linhas já publicadas', async () => {
  const rows = [buildRow({ id: 'outbox-3', status: 'published', published_at: '2026-01-01T00:00:00.000Z' })];
  const db = createFakeDb(rows);
  let calls = 0;

  const result = await runOutboxRelayOnce(db, () => {
    calls += 1;
  });

  assert.equal(result.published, 0);
  assert.equal(calls, 0);
});
