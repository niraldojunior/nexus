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

const cityRow = {
  id: 'c1',
  country_code: 'BR',
  country_name: 'Brasil',
  state_code: 'RJ',
  city_name: 'Niterói',
};

test('roots monta Brasil/UF/município só com Sites ativos e omite o ramo sem município', async () => {
  const { db, calls } = fakeDb([[cityRow], [{ n: 0 }]]);
  const nodes = await new OracleInternalPlantRepository(db).roots('tenant-a');
  assert.deepEqual(
    nodes.map((node) => [node.id, node.parentId]),
    [
      ['country:BR', null],
      ['uf:BR|RJ', 'country:BR'],
      ['city:c1', 'uf:BR|RJ'],
    ],
  );
  assert.match(calls[0]!.sql, /geographic_administrative_city_tenant/);
  assert.match(calls[0]!.sql, /active_site_count > 0/);
  assert.deepEqual(calls[0]!.params, ['tenant-a']);
});

test('roots inclui o ramo sintético quando há Site raiz ativo sem município', async () => {
  const { db } = fakeDb([[cityRow], [{ n: 5 }], [{ n: 4 }]]);
  const nodes = await new OracleInternalPlantRepository(db).roots('tenant-a');
  assert.deepEqual(nodes.map((node) => [node.id, node.parentId]).slice(3), [
    ['uf:none', 'country:BR'],
    ['city:none', 'uf:none'],
  ]);
});

test('roots sem nenhum Site ativo devolve árvore vazia', async () => {
  const { db } = fakeDb([[], [{ n: 0 }], [{ n: 0 }]]);
  assert.deepEqual(await new OracleInternalPlantRepository(db).roots('tenant-a'), []);
});

test('city devolve tipos de Site raiz com volume, isolado por tenant', async () => {
  const { db, calls } = fakeDb([[{ id: 'sp1', name: 'Central', n: 1234, total: 1 }]]);
  const result = await new OracleInternalPlantRepository(db).children('city:c1', page);
  assert.equal(result.nodes[0]?.id, 'site-type:c1|sp1');
  assert.equal(result.nodes[0]?.childCount, 1234);
  assert.equal(result.total, 1);
  assert.deepEqual(calls[0]?.params.slice(0, 2), ['tenant-a', 'c1']);
  assert.doesNotMatch(calls[0]!.sql, /geographic_site_administrative_city|UNION ALL/);
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

test('getSiteContext devolve a cadeia raiz→site e o endereço do site selecionado', async () => {
  const { db, calls } = fakeDb([
    [
      {
        id: 'building-1',
        name: 'Prédio A',
        specification_name: 'Prédio',
        site_specification_id: 'building-spec',
        geographic_address_id: null,
        street_type: null,
        street_name: null,
        street_nr: null,
        locality: null,
        city: null,
        state_or_province: null,
        postcode: null,
        administrative_city_id: 'c1',
        country_code: 'BR',
        state_code: 'RJ',
        lvl: 3,
      },
      {
        id: 'site-1',
        name: 'Sala Técnica',
        specification_name: 'Sala Técnica',
        site_specification_id: 'room-spec',
        geographic_address_id: 'a1',
        street_type: 'Rua',
        street_name: 'Cinco de Julho',
        street_nr: '237',
        locality: null,
        city: 'Niterói',
        state_or_province: 'RJ',
        postcode: '24220110',
        lvl: 1,
      },
    ],
    [{ site_specification_id: 'room-spec', icon_code: 'Room', icon_asset_id: null }],
  ]);
  const result = await new OracleInternalPlantRepository(db).getSiteContext('site-1', 'tenant-a');
  assert.deepEqual(
    result?.hierarchy.map((item) => item.name),
    ['Prédio A', 'Sala Técnica'],
  );
  assert.deepEqual(result?.site.visualIdentity, { kind: 'system', iconCode: 'Room' });
  assert.equal(result?.site.id, 'site-1');
  assert.equal(result?.address?.city, 'Niterói');
  assert.match(calls[0]!.sql, /CONNECT BY NOCYCLE/);
  assert.deepEqual(calls[0]!.params, ['site-1', 'tenant-a']);
  assert.deepEqual(result?.treePath, [
    'country:BR',
    'uf:BR|RJ',
    'city:c1',
    'site-type:c1|building-spec',
    'site:building-1',
    'site:site-1',
  ]);
});

test('getSiteContext usa o ramo "none" quando a raiz não tem município', async () => {
  const { db } = fakeDb([
    [
      {
        id: 'site-1',
        name: 'Central',
        specification_name: 'Central',
        site_specification_id: 'co-spec',
        geographic_address_id: null,
        administrative_city_id: null,
        country_code: null,
        state_code: null,
        lvl: 1,
      },
    ],
    [],
  ]);
  const result = await new OracleInternalPlantRepository(db).getSiteContext('site-1', 'tenant-a');
  assert.deepEqual(result?.treePath, [
    'country:BR',
    'uf:none',
    'city:none',
    'site-type:none|co-spec',
    'site:site-1',
  ]);
});

test('listSites busca por prefixo escapado, exclui Retired e enriquece em lote', async () => {
  const { db, calls } = fakeDb([
    [
      {
        id: 'sub-1',
        name: 'Sala 10%',
        status: 'Active',
        spec_id: 'room-spec',
        spec_name: 'Sala',
        street_type: 'Rua',
        street_name: 'Cinco de Julho',
        street_nr: '237',
        city: 'Niterói',
        state_or_province: 'RJ',
        postcode: '24220110',
        total: 1,
      },
    ],
    [{ site_specification_id: 'room-spec', icon_code: 'Room', icon_asset_id: null }],
    [{ site_id: 'sub-1', state_code: 'RJ', city_name: 'Niterói' }],
  ]);
  const result = await new OracleInternalPlantRepository(db).listSites({
    q: 'Sala 10%',
    tenantId: 'tenant-a',
    limit: 25,
    offset: 0,
  });
  assert.equal(calls[0]!.params[1], 'sala 10!%%');
  assert.match(calls[0]!.sql, /status <> 'Retired'/);
  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0], {
    id: 'sub-1',
    name: 'Sala 10%',
    status: 'Active',
    siteSpecification: { id: 'room-spec', name: 'Sala' },
    visualIdentity: { kind: 'system', iconCode: 'Room' },
    address: 'Rua Cinco de Julho, nº 237, Niterói, RJ, 24220110',
    stateOrProvince: 'RJ',
    city: 'Niterói',
  });
  assert.match(calls[2]!.sql, /CONNECT BY NOCYCLE/);
});

test('listSites cai para substring quando o prefixo não encontra nada', async () => {
  const { db, calls } = fakeDb([[], [{ n: 0 }], []]);
  const result = await new OracleInternalPlantRepository(db).listSites({
    q: 'cari',
    tenantId: 'tenant-a',
    limit: 25,
    offset: 0,
  });
  assert.equal(result.total, 0);
  assert.equal(calls[0]!.params[1], 'cari%');
  assert.ok(calls.some((call) => call.params[1] === '%cari%'));
});

test('listResources herda o fabricante da ResourceSpecification e a localização administrativa do Site', async () => {
  const { db, calls } = fakeDb([
    [
      {
        id: 'resource-1',
        entity_type: 'PhysicalResource',
        name: 'OLT-01',
        spec_id: 'spec-1',
        status: 'active',
        status_code: null,
        place_id: 'site-1',
        total: 1,
      },
    ],
    [
      {
        spec_id: 'spec-1',
        spec_name: 'MA5800',
        related_party: JSON.stringify([
          { id: 'manufacturer-1', name: 'Huawei', role: 'manufacturer' },
        ]),
        type_id: 'type-1',
        type_code: 'OLT',
        type_name: 'OLT',
        icon_code: null,
        icon_asset_id: null,
      },
    ],
    [{ id: 'site-1', state_code: 'RJ', city_name: 'Niterói' }],
  ]);
  const result = await new OracleInternalPlantRepository(db).listResources({
    tenantId: 'tenant-a',
    siteId: 'site-1',
    limit: 50,
    offset: 0,
  });
  assert.deepEqual(result.items[0]?.resourceSpecification.manufacturer, {
    id: 'manufacturer-1',
    name: 'Huawei',
  });
  assert.equal(result.items[0]?.stateOrProvince, 'RJ');
  assert.equal(result.items[0]?.city, 'Niterói');
  assert.match(calls[2]!.sql, /geographic_site/);
  assert.match(calls[2]!.sql, /administrative_city_id/);
  assert.match(calls[2]!.sql, /geographic_administrative_city/);
  assert.match(calls[2]!.sql, /s\.id IN \(\?\)/);
  assert.doesNotMatch(calls[2]!.sql, /CONNECT BY/);
  assert.deepEqual(calls[2]!.params, ['tenant-a', 'site-1']);
});

test('listResources filtra place_id exato, sem resolução de endereço', async () => {
  const { db, calls } = fakeDb([[]]);
  await new OracleInternalPlantRepository(db).listResources({
    tenantId: 'tenant-a',
    siteId: 'site-1',
    limit: 50,
    offset: 0,
  });
  assert.match(calls[0]!.sql, /\bplace_id = \?/);
  assert.doesNotMatch(calls[0]!.sql, /CONNECT BY/);
  assert.ok(calls[0]!.params.includes('site-1'));
});
