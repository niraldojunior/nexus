import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';
import {
  OracleInternalPlantRepository,
  escapeLike,
} from '../src/modules/resource/internal-plant-oracle-repository.js';

type Call = { sql: string; params: unknown[] };

const fakeDb = (responses: Array<unknown[]>) => {
  const calls: Call[] = [];
  const db = {
    all: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return responses.shift() ?? [];
    },
    get: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return (responses.shift() ?? [])[0];
    },
    run: async () => ({ changes: 0 }),
  } as unknown as DatabaseClient;
  return { db, calls };
};

const page = { tenantId: 'tenant-a', limit: 50, offset: 0 };

test('escapeLike escapa metacaracteres', () => {
  assert.equal(escapeLike('a%b_c!'), 'a!%b!_c!!');
});

test('roots monta Brasil/UF/município do diretório e a ramificação sintética', async () => {
  const { db, calls } = fakeDb([
    [
      {
        id: 'c1',
        country_code: 'BR',
        country_name: 'Brasil',
        state_code: 'RJ',
        city_name: 'Niterói',
      },
    ],
  ]);
  const nodes = await new OracleInternalPlantRepository(db).roots('tenant-a');
  assert.deepEqual(
    nodes.map((node) => [node.id, node.parentId]),
    [
      ['country:BR', null],
      ['uf:BR|RJ', 'country:BR'],
      ['city:c1', 'uf:BR|RJ'],
      ['uf:none', 'country:BR'],
      ['city:none', 'uf:none'],
    ],
  );
  assert.equal(calls.length, 1, 'uma única leitura, só do diretório');
  assert.doesNotMatch(calls[0]!.sql, /tmf_geographic_(address|site)/);
});

test('city devolve tipos de Site raiz com volume, isolado por tenant', async () => {
  const { db, calls } = fakeDb([[{ id: 'sp1', name: 'Central', n: 1234, total: 1 }]]);
  const result = await new OracleInternalPlantRepository(db).children('city:c1', page);
  assert.equal(result.nodes[0]?.id, 'site-type:c1|sp1');
  assert.equal(result.nodes[0]?.childCount, 1234);
  assert.equal(result.total, 1);
  assert.deepEqual(calls[0]?.params.slice(0, 2), ['tenant-a', 'c1']);
  assert.match(calls[0]!.sql, /parent_site_id IS NULL/);
});

test('site-type lista Sites raiz com hasChildren em lote', async () => {
  const { db, calls } = fakeDb([
    [
      { id: 'a', name: 'A', status: 'active', total: 2 },
      { id: 'b', name: 'B', status: 'active', total: 2 },
    ],
    [{ id: 'a', n: 3 }],
  ]);
  const result = await new OracleInternalPlantRepository(db).children('site-type:c1|sp1', page);
  assert.deepEqual(
    result.nodes.map((node) => [node.id, node.hasChildren, node.childCount]),
    [
      ['site:a', true, 3],
      ['site:b', false, 0],
    ],
  );
  assert.equal(calls.length, 2);
  assert.ok(calls[0]!.params.includes('sp1'));
  assert.match(calls[1]!.sql, /id <> parent_site_id/);
});

test('site lista só filhos imediatos e ignora auto-referência', async () => {
  const { db, calls } = fakeDb([[]]);
  const result = await new OracleInternalPlantRepository(db).children('site:s1', page);
  assert.deepEqual(result.nodes, []);
  assert.match(calls[0]!.sql, /id <> \?/);
  assert.deepEqual(calls[0]!.params.slice(0, 3), ['tenant-a', 's1', 's1']);
});

test('país e UF não consultam o banco', async () => {
  const { db, calls } = fakeDb([]);
  const result = await new OracleInternalPlantRepository(db).children('uf:BR|RJ', page);
  assert.equal(result.nodes.length, 0);
  assert.equal(calls.length, 0);
});

test('listResources filtra serving_site_id exato, sem CONNECT BY', async () => {
  const { db, calls } = fakeDb([[]]);
  await new OracleInternalPlantRepository(db).listResources({
    tenantId: 'tenant-a',
    siteId: 'site-1',
    limit: 50,
    offset: 0,
  });
  assert.match(calls[0]!.sql, /serving_site_id = \?/);
  assert.doesNotMatch(calls[0]!.sql, /CONNECT BY/);
  assert.ok(calls[0]!.params.includes('site-1'));
});
