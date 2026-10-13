import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  computeNetwinUfSyncWindow,
  normalizeUfCode,
} from '../src/modules/reference-data/netwin-uf-sync-control-domain.js';
import { OracleNetwinUfSyncControlRepository } from '../src/modules/reference-data/netwin-uf-sync-control-repository.js';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';

test('normalizeUfCode normaliza e rejeita UF inválida', () => {
  assert.equal(normalizeUfCode(' rj '), 'RJ');
  assert.throws(() => normalizeUfCode('RJX'));
});

test('computeNetwinUfSyncWindow aplica a sobreposição ao último watermark', () => {
  const window = computeNetwinUfSyncWindow(
    { lastSuccessSourceAt: '2026-10-12T10:00:00.000Z', overlapSeconds: 600 },
    new Date('2026-10-12T11:00:00.000Z'),
  );
  assert.equal(window.from, '2026-10-12T09:50:00.000Z');
  assert.equal(window.to, '2026-10-12T11:00:00.000Z');
});

test('computeNetwinUfSyncWindow exige marco inicial e relógio monotônico', () => {
  assert.throws(
    () =>
      computeNetwinUfSyncWindow(
        { lastSuccessSourceAt: null, overlapSeconds: 0 },
        new Date('2026-10-12T11:00:00Z'),
      ),
    /rollout/,
  );
  assert.throws(
    () =>
      computeNetwinUfSyncWindow(
        { lastSuccessSourceAt: '2026-10-12T12:00:00.000Z', overlapSeconds: 0 },
        new Date('2026-10-12T11:00:00Z'),
      ),
    /retrocedeu/,
  );
});

test('acquireLease é um UPDATE condicional e devolve null sem linha afetada', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    run: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { changes: 0 };
    },
  } as unknown as DatabaseClient;
  const repo = new OracleNetwinUfSyncControlRepository(db);
  const lease = await repo.acquireLease('vtal', 'rj', { runId: 'r1', owner: 'p1' });
  assert.equal(lease, null);
  assert.match(calls[0]!.sql, /lease_expires_at < \?/);
  assert.ok(calls[0]!.params.includes('RJ'));
});

test('complete e fail são condicionados ao run_id da execução', async () => {
  const sqls: string[] = [];
  const db = {
    run: async (sql: string) => {
      sqls.push(sql);
      return { changes: 1 };
    },
  } as unknown as DatabaseClient;
  const repo = new OracleNetwinUfSyncControlRepository(db);
  assert.equal(await repo.complete('vtal', 'RJ', 'r1', { sourceAt: '2026-10-12T00:00:00Z' }), true);
  assert.equal(await repo.fail('vtal', 'RJ', 'r1', 'erro'), true);
  assert.ok(sqls.every((sql) => /run_id = \?/.test(sql)));
  assert.ok(!/last_success_source_at/.test(sqls[1]!), 'falha não avança o watermark');
});
