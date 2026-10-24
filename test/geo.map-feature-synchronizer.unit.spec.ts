import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'vitest';
import { MAP_DENSITY_ZOOMS, coarsenTile } from '../src/modules/geo/map-density.js';
import {
  GeoMapFeatureSynchronizer,
  MAP_FEATURE_POINT_INSERT_SQL,
  candidatesSql,
  densityDelta,
} from '../src/modules/geo/map-feature-synchronizer.js';
import { MAP_TILE_ZOOM, tileForPoint } from '../src/modules/geo/map-tile.js';
import { INTERNAL_RESOURCE_TYPES } from '../src/modules/geo/map-visibility.js';
import type { DatabaseClient, DatabaseSession } from '../src/shared/persistence/database-client.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loaderDbUrl = `${pathToFileURL(resolve(rootDir, 'scripts/loader-db.mjs')).href}?test`;

// O write-through monta o INSERT de `geographic_map_feature` à mão, com a lista de colunas e a de
// VALUES em linhas separadas. Um `?` a mais não quebra typecheck nem lint — estoura só em
// runtime ("INSERT has more expressions than target columns"), no primeiro recurso pontual que
// passar pelo sincronizador. Foi o que aconteceu: a suíte só pegou pelo caminho indireto do
// MCP (geo.create_condominium), ~9 min adentro da rodada. Estes testes conferem a aridade
// direto no SQL exportado, em milissegundos.

const parts = MAP_FEATURE_POINT_INSERT_SQL.match(/\(([^)]+)\)\s*VALUES \(([^)]+)\)/s);

const split = (chunk: string): string[] =>
  chunk
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

test('VALUES tem exatamente uma expressão por coluna', () => {
  assert.ok(parts, 'não consegui separar colunas e VALUES do INSERT');
  const columns = split(parts[1]!);
  const values = split(parts[2]!);
  assert.equal(
    values.length,
    columns.length,
    `VALUES tem ${values.length} expressões para ${columns.length} colunas`,
  );
});

// As três expressões constantes são deliberadas (ver o comentário do SQL); travar a contagem
// evita que alguém troque um literal por `?` sem acrescentar o parâmetro correspondente.
test('16 placeholders + 3 expressões constantes (shape, geometry, rank)', () => {
  assert.ok(parts);
  const values = split(parts[2]!);
  const placeholders = values.filter((value) => value === '?').length;
  assert.equal(placeholders, 16, `esperava 16 placeholders, achei ${placeholders}`);
  assert.equal(values.length - placeholders, 3);
});

// Regressão da divergência que deixou Porta de Splitter vazar no mapa (issue de "portas de
// splitter não devem ser exibidas no mapa"): o write-through só excluía 'Splitter'. A régua
// certa vem de map-visibility.ts (fonte única, ver também build-map-features.mjs e
// tree-service.ts); estes testes conferem o SQL de candidatos direto no texto, sem banco.
const CANDIDATES_SQL = candidatesSql('?,?');

test('candidatesSql exclui todo tipo de recurso interno (Splitter e Porta)', () => {
  assert.deepEqual([...INTERNAL_RESOURCE_TYPES].sort(), ['Port', 'Splitter']);
  for (const type of INTERNAL_RESOURCE_TYPES) {
    assert.ok(
      CANDIDATES_SQL.includes(`'${type}'`),
      `esperava a exclusão de '${type}' no SQL de candidatos`,
    );
  }
});

test('candidatesSql filtra recurso por map_presence do ResourceType canônico vinculado por FK', () => {
  assert.match(CANDIDATES_SQL, /JOIN resource_type rt\s+ON rt\.id = rs\.resource_type_id/);
  assert.doesNotMatch(CANDIDATES_SQL, /rt\.tenant_id = rs\.tenant_id/);
  assert.doesNotMatch(CANDIDATES_SQL, /rt\.code = rs\.resource_type/);
  assert.match(CANDIDATES_SQL, /COALESCE\(rt\.map_presence, 1\) = 1/);
});

test('candidatesSql exige o tenant da entidade sem exigir o tenant da Location compartilhada', () => {
  assert.match(CANDIDATES_SQL, /r\.tenant_id = \?/);
  assert.match(CANDIDATES_SQL, /s\.tenant_id = \?/);
  assert.doesNotMatch(CANDIDATES_SQL, /l\.tenant_id = \?/);
  assert.match(
    CANDIDATES_SQL,
    /rs\.id = r\.resource_specification_id AND rs\.tenant_id = r\.tenant_id/,
  );
});

// Regressão do bug relatado: trocar o Endereço de um recurso via PlacePicker grava um
// GeographicAddress (ou GeographicSite) em `place_id`, não uma GeographicLocation direta. Um JOIN
// direto `l.id = r.place_id` não acha linha e o recurso some do mapa ao fechar o painel (caso
// relatado: CDOE-3952). A resolução tem que espelhar resolveDetailLocation
// (oracle-repository.ts) — mesma régua usada por viewportBlock em tree-service.ts.
test('candidatesSql resolve a Location por Site ou Address quando place_id não aponta direto', () => {
  assert.match(
    CANDIDATES_SQL,
    /LEFT JOIN geographic_site place_site\s+ON place_site\.id = r\.place_id AND place_site\.tenant_id = r\.tenant_id/,
  );
  assert.match(
    CANDIDATES_SQL,
    /LEFT JOIN geographic_address place_address\s+ON place_address\.id = r\.place_id/,
  );
  assert.match(
    CANDIDATES_SQL,
    /JOIN geographic_location l\s+ON l\.id = COALESCE\(place_site\.geographic_location_id, place_address\.geographic_location_id, r\.place_id\)/,
  );
});

test('candidatesSql restringe site a category = Site, fora de projeto em curso', () => {
  assert.match(CANDIDATES_SQL, /spec\.category = 'Site'/);
  assert.doesNotMatch(CANDIDATES_SQL, /'SubSite'/);
  assert.match(CANDIDATES_SQL, /project_site/);
  assert.match(CANDIDATES_SQL, /p\.status <> 'terminated'/);
});

test('syncEntity consulta e grava somente no tenant informado', async () => {
  const calls: Array<{ operation: 'all' | 'execute'; sql: string; params: unknown[] }> = [];
  const session = {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      calls.push({ operation: 'all', sql, params });
      return [];
    },
    async execute(sql: string, params: unknown[] = []) {
      calls.push({ operation: 'execute', sql, params });
      return { changes: 0 };
    },
  } as unknown as DatabaseSession;
  const db = {
    async transaction<T>(work: (current: DatabaseSession) => Promise<T>): Promise<T> {
      return await work(session);
    },
  } as unknown as DatabaseClient;

  await new GeoMapFeatureSynchronizer(db).syncEntity('resource-1', 'vtal');

  const candidates = calls.find((call) => call.sql.includes('UNION ALL'));
  assert.deepEqual(candidates?.params, ['resource-1', 'vtal', 'resource-1', 'vtal']);
  for (const call of calls.filter((entry) => entry.sql.includes('geographic_map_feature'))) {
    assert.equal(call.params[0], 'vtal');
  }
});

// Issue #425: o write-through não regrava traçado de cabo (LOD vem do rebuild batch), então um
// DELETE sem filtro de shape fazia o cabo editado sumir do mapa até o próximo rebuild.
test('write-through só apaga a linha pontual; traçado de cabo sai apenas quando terminado', async () => {
  const deletes: string[] = [];
  const session = {
    async all<T>(): Promise<T[]> {
      return [];
    },
    async execute(sql: string) {
      if (/DELETE FROM geographic_map_feature/.test(sql)) deletes.push(sql);
      return { changes: 0 };
    },
  } as unknown as DatabaseSession;
  const db = {
    async transaction<T>(work: (current: DatabaseSession) => Promise<T>): Promise<T> {
      return await work(session);
    },
  } as unknown as DatabaseClient;

  await new GeoMapFeatureSynchronizer(db).syncEntity('cable-1', 'vtal');

  assert.equal(deletes.length, 2);
  assert.match(deletes[0]!, /shape = 'point'/);
  assert.match(deletes[1]!, /shape = 'line'/);
  assert.match(deletes[1]!, /status = 'terminated'/);
  for (const sql of deletes) assert.match(sql, /shape = '(point|line)'/);
});

type FakeDensity = Map<
  string,
  { features: number; resources: number; sites: number; lng: number; lat: number }
>;

// Banco falso só com o que o write-through toca: linhas pontuais antigas, candidatos e a tabela
// de densidade (com UPDATE/DELETE/INSERT aplicados de verdade sobre um Map).
function densityHarness(input: {
  previous: Array<{
    feature_kind: string;
    tile_x: number;
    tile_y: number;
    lng: number;
    lat: number;
  }>;
  candidates: Array<{
    entity_id: string;
    feature_kind: 'resource' | 'site';
    lng: number;
    lat: number;
  }>;
  density: FakeDensity;
}) {
  const session = {
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('UNION ALL')) {
        return input.candidates.map((candidate) => ({
          ...candidate,
          entity_type: candidate.feature_kind === 'site' ? 'GeographicSite' : 'PhysicalResource',
          geometry: JSON.stringify({ type: 'Point', coordinates: [candidate.lng, candidate.lat] }),
          label: candidate.entity_id,
        })) as T[];
      }
      if (sql.includes('FROM geographic_map_feature')) return input.previous as T[];
      return [];
    },
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('FROM geographic_map_density'))
        return (input.density.size > 0 ? { found: 1 } : undefined) as T | undefined;
      return undefined;
    },
    async execute(sql: string, params: unknown[] = []) {
      if (sql.startsWith('UPDATE geographic_map_density')) {
        const [sumLng, , sumLat, , features, resources, sites, , z, x, y] = params as number[];
        const key = `${z}/${x}/${y}`;
        const cell = input.density.get(key);
        if (!cell || cell.features + features! <= 0) return { changes: 0 };
        const total = cell.features + features!;
        input.density.set(key, {
          lng: (cell.lng * cell.features + sumLng!) / total,
          lat: (cell.lat * cell.features + sumLat!) / total,
          features: total,
          resources: cell.resources + resources!,
          sites: cell.sites + sites!,
        });
        return { changes: 1 };
      }
      if (sql.trimStart().startsWith('DELETE FROM geographic_map_density')) {
        const [, z, x, y, features] = params as number[];
        const key = `${z}/${x}/${y}`;
        const cell = input.density.get(key);
        if (!cell || cell.features + features! > 0) return { changes: 0 };
        input.density.delete(key);
        return { changes: 1 };
      }
      if (sql.trimStart().startsWith('INSERT INTO geographic_map_density')) {
        const [, z, x, y, features, resources, sites, lng, lat] = params as number[];
        input.density.set(`${z}/${x}/${y}`, {
          features: features!,
          resources: resources!,
          sites: sites!,
          lng: lng!,
          lat: lat!,
        });
      }
      return { changes: 1 };
    },
  } as unknown as DatabaseSession;
  return {
    async transaction<T>(work: (current: DatabaseSession) => Promise<T>): Promise<T> {
      return await work(session);
    },
  } as unknown as DatabaseClient;
}

const NITEROI: [number, number] = [-43.1, -22.9];
const RECIFE: [number, number] = [-34.9, -8.05];

function pointRow(kind: string, [lng, lat]: [number, number]) {
  const tile = tileForPoint([lng, lat], MAP_TILE_ZOOM);
  return { feature_kind: kind, tile_x: tile.x, tile_y: tile.y, lng, lat };
}

function cellKey(point: [number, number], zoom: (typeof MAP_DENSITY_ZOOMS)[number]): string {
  const tile = coarsenTile(tileForPoint(point, MAP_TILE_ZOOM), zoom);
  return `${tile.z}/${tile.x}/${tile.y}`;
}

// Issue #425: mover um recurso no mapa tem que mover também a densidade agregada (z13/z10/z7),
// sem esperar o rebuild batch — por delta, nunca por GROUP BY de uma célula de milhões de linhas.
test('mover um recurso tira 1 da célula antiga e soma 1 na nova em cada nível de densidade', async () => {
  const density: FakeDensity = new Map();
  for (const zoom of MAP_DENSITY_ZOOMS) {
    density.set(cellKey(NITEROI, zoom), {
      features: 3,
      resources: 2,
      sites: 1,
      lng: NITEROI[0],
      lat: NITEROI[1],
    });
  }
  const db = densityHarness({
    previous: [pointRow('resource', NITEROI)],
    candidates: [
      { entity_id: 'resource-1', feature_kind: 'resource', lng: RECIFE[0], lat: RECIFE[1] },
    ],
    density,
  });

  await new GeoMapFeatureSynchronizer(db).syncEntity('resource-1', 'vtal');

  for (const zoom of MAP_DENSITY_ZOOMS) {
    const old = density.get(cellKey(NITEROI, zoom));
    assert.deepEqual(
      { features: old?.features, resources: old?.resources, sites: old?.sites },
      { features: 2, resources: 1, sites: 1 },
    );
    const moved = density.get(cellKey(RECIFE, zoom));
    assert.deepEqual(moved, {
      features: 1,
      resources: 1,
      sites: 0,
      lng: RECIFE[0],
      lat: RECIFE[1],
    });
  }
});

test('célula que zera é removida; edição sem mover não toca a densidade', async () => {
  const density: FakeDensity = new Map();
  for (const zoom of MAP_DENSITY_ZOOMS) {
    density.set(cellKey(NITEROI, zoom), {
      features: 1,
      resources: 0,
      sites: 1,
      lng: NITEROI[0],
      lat: NITEROI[1],
    });
    density.set(cellKey(RECIFE, zoom), {
      features: 1,
      resources: 1,
      sites: 0,
      lng: RECIFE[0],
      lat: RECIFE[1],
    });
  }
  // Site terminado: some do índice e a célula com ele só fica vazia.
  await new GeoMapFeatureSynchronizer(
    densityHarness({ previous: [pointRow('site', NITEROI)], candidates: [], density }),
  ).syncEntity('site-1', 'vtal');
  for (const zoom of MAP_DENSITY_ZOOMS) assert.equal(density.has(cellKey(NITEROI, zoom)), false);

  // Recurso renomeado no mesmo lugar: delta nulo, célula intacta.
  const before = JSON.stringify([...density]);
  await new GeoMapFeatureSynchronizer(
    densityHarness({
      previous: [pointRow('resource', RECIFE)],
      candidates: [
        { entity_id: 'resource-2', feature_kind: 'resource', lng: RECIFE[0], lat: RECIFE[1] },
      ],
      density,
    }),
  ).syncEntity('resource-2', 'vtal');
  assert.equal(JSON.stringify([...density]), before);
});

test('tenant sem densidade construída não ganha células avulsas do write-through', async () => {
  const density: FakeDensity = new Map();
  await new GeoMapFeatureSynchronizer(
    densityHarness({
      previous: [],
      candidates: [
        { entity_id: 'resource-1', feature_kind: 'resource', lng: RECIFE[0], lat: RECIFE[1] },
      ],
      density,
    }),
  ).syncEntity('resource-1', 'vtal');
  assert.equal(density.size, 0);
});

test('densityDelta reproduz contagem e centroide da agregação batch', () => {
  const cells = densityDelta(
    [],
    [pointRow('resource', NITEROI), pointRow('site', [-43.1002, -22.9002])],
  );
  const z7 = cells.find((cell) => cell.z === 7);
  assert.equal(z7?.features, 2);
  assert.equal(z7?.resources, 1);
  assert.equal(z7?.sites, 1);
  assert.ok(Math.abs(z7!.sumLng / z7!.features - -43.1001) < 1e-9);
});

test('syncEntities divide listas grandes em lotes abaixo do limite de IN do Oracle', async () => {
  const batchSizes: number[] = [];
  const session = {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes('FROM geographic_map_feature')) batchSizes.push(params.length - 1);
      return [];
    },
    async execute() {
      return { changes: 0 };
    },
  } as unknown as DatabaseSession;
  const db = {
    async transaction<T>(work: (current: DatabaseSession) => Promise<T>): Promise<T> {
      return await work(session);
    },
  } as unknown as DatabaseClient;

  const ids = Array.from({ length: 1201 }, (_, index) => `resource-${index}`);
  await new GeoMapFeatureSynchronizer(db).syncEntities(ids, 'vtal');

  assert.deepEqual(batchSizes, [500, 500, 201]);
});

test('syncLocation procura dependentes no tenant informado mesmo com Location compartilhada', async () => {
  const lookupCalls: Array<{ sql: string; params: unknown[] }> = [];
  const session = {
    async all<T>(): Promise<T[]> {
      return [];
    },
    async execute(): Promise<{ changes: number }> {
      return { changes: 0 };
    },
  } as unknown as DatabaseSession;
  const db = {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      lookupCalls.push({ sql, params });
      return [];
    },
    async transaction<T>(work: (current: DatabaseSession) => Promise<T>): Promise<T> {
      return await work(session);
    },
  } as unknown as DatabaseClient;

  await new GeoMapFeatureSynchronizer(db).syncLocation('location-default', 'vtal');

  assert.deepEqual(lookupCalls[0]?.params, [
    'vtal',
    'location-default',
    'location-default',
    'location-default',
    'location-default',
    'vtal',
  ]);
  assert.match(lookupCalls[0]?.sql ?? '', /r\.tenant_id = \?/);
});

// Issue #425: o place canônico de recurso é o Site (às vezes Address). Mover a Location só
// reposicionava recurso com place_id = Location — os de dentro do Site ficavam no ponto antigo.
test('syncLocation inclui recursos cujo place é Site ou Address naquela Location', async () => {
  let lookupSql = '';
  const synced: unknown[][] = [];
  const session = {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes('FROM geographic_map_feature')) synced.push(params.slice(1));
      return [];
    },
    async execute(): Promise<{ changes: number }> {
      return { changes: 0 };
    },
  } as unknown as DatabaseSession;
  const db = {
    async all<T>(sql: string): Promise<T[]> {
      lookupSql = sql;
      return [{ id: 'site-1' }, { id: 'resource-in-site' }, { id: 'resource-at-address' }] as T[];
    },
    async transaction<T>(work: (current: DatabaseSession) => Promise<T>): Promise<T> {
      return await work(session);
    },
  } as unknown as DatabaseClient;

  await new GeoMapFeatureSynchronizer(db).syncLocation('location-1', 'vtal');

  assert.match(
    lookupSql,
    /SELECT s\.id FROM geographic_site s WHERE s\.geographic_location_id = \?/,
  );
  assert.match(
    lookupSql,
    /SELECT a\.id FROM geographic_address a WHERE a\.geographic_location_id = \?/,
  );
  assert.deepEqual(synced, [['site-1', 'resource-in-site', 'resource-at-address']]);
});

test('syncSite ressincroniza o Site e os recursos instalados nele', async () => {
  const synced: unknown[][] = [];
  const session = {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes('FROM geographic_map_feature')) synced.push(params.slice(1));
      return [];
    },
    async execute(): Promise<{ changes: number }> {
      return { changes: 0 };
    },
  } as unknown as DatabaseSession;
  const db = {
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      assert.match(sql, /resource_physical WHERE place_id = \? AND tenant_id = \?/);
      assert.deepEqual(params, ['site-1', 'vtal']);
      return [{ id: 'olt-1' }, { id: 'dio-1' }] as T[];
    },
    async transaction<T>(work: (current: DatabaseSession) => Promise<T>): Promise<T> {
      return await work(session);
    },
  } as unknown as DatabaseClient;

  await new GeoMapFeatureSynchronizer(db).syncSite('site-1', 'vtal');

  assert.deepEqual(synced, [['site-1', 'olt-1', 'dio-1']]);
});

test('resolveLoaderEnvironment prioriza --environment, normaliza e mantém o fallback da sessão', async () => {
  const { resolveLoaderEnvironment } = await import(loaderDbUrl);
  const previous = process.env.ORACLE_OBJECT_PREFIX;
  try {
    process.env.ORACLE_OBJECT_PREFIX = 'NEXUS_DEV_';
    assert.equal(resolveLoaderEnvironment(['--environment', 'nx_demo_']), 'NX_DEMO_');
    assert.equal(process.env.ORACLE_OBJECT_PREFIX, 'NX_DEMO_');

    process.env.ORACLE_OBJECT_PREFIX = 'nexus_dev_';
    assert.equal(resolveLoaderEnvironment([]), 'NEXUS_DEV_');
  } finally {
    if (previous === undefined) delete process.env.ORACLE_OBJECT_PREFIX;
    else process.env.ORACLE_OBJECT_PREFIX = previous;
  }
});

test('resolveLoaderEnvironment rejeita valor ausente e prefixos inválidos', async () => {
  const { resolveLoaderEnvironment } = await import(loaderDbUrl);
  const previous = process.env.ORACLE_OBJECT_PREFIX;
  try {
    assert.throws(
      () => resolveLoaderEnvironment(['--environment']),
      /--environment exige um prefixo Oracle/,
    );
    assert.throws(
      () => resolveLoaderEnvironment(['--environment', '123demo']),
      /Ambiente Oracle inválido/,
    );
  } finally {
    if (previous === undefined) delete process.env.ORACLE_OBJECT_PREFIX;
    else process.env.ORACLE_OBJECT_PREFIX = previous;
  }
});

test('rebuild do índice inclui somente PhysicalResource, compatível com ResourcePanel', async () => {
  const script = await readFile(resolve(rootDir, 'scripts/build-map-features.mjs'), 'utf8');
  assert.match(script, /resourceSource\('PhysicalResource', scopeWhere\)/);
  assert.doesNotMatch(script, /resourceSource\('LogicalResource', scopeWhere\)/);
});

test('rebuilds resolvem explicitamente o ambiente antes de abrir o loader Oracle', async () => {
  for (const file of ['build-map-features.mjs', 'build-map-density.mjs']) {
    const script = await readFile(resolve(rootDir, 'scripts', file), 'utf8');
    assert.match(
      script,
      /import \{ openLoaderDb, resolveLoaderEnvironment \} from '\.\/loader-db\.mjs';/,
    );
    const resolvedAt = script.indexOf('const ENVIRONMENT = resolveLoaderEnvironment(argv);');
    const openedAt = script.indexOf('await openLoaderDb();');
    assert.ok(resolvedAt >= 0, `${file} não resolve --environment`);
    assert.ok(openedAt > resolvedAt, `${file} abre o loader antes de resolver --environment`);
    assert.match(script, /console\.log\(`Ambiente : \$\{ENVIRONMENT\}`\);/);
  }
});

test('rebuild filtra a entidade pelo tenant e preserva Location compartilhada', async () => {
  const script = await readFile(resolve(rootDir, 'scripts/build-map-features.mjs'), 'utf8');
  assert.match(script, /const params = \[TENANT\]/);
  assert.match(script, /WHERE r\.tenant_id = \$1/);
  assert.match(script, /WHERE s\.tenant_id = \$1/);
  assert.doesNotMatch(script, /l\.tenant_id = \$1/);
  assert.match(script, /sourceModelId: row\.resource_type/);
});

test('rebuild de densidade com --apply aborta antes de limpar tenant sem features', async () => {
  const script = await readFile(resolve(rootDir, 'scripts/build-map-density.mjs'), 'utf8');
  const emptyGuard = script.indexOf('if (sourceRows === 0)');
  const deleteTenant = script.indexOf('DELETE FROM geographic_map_density WHERE tenant_id');
  assert.ok(emptyGuard >= 0);
  assert.ok(deleteTenant > emptyGuard);
  assert.match(script, /if \(APPLY\) throw new Error\(`Rebuild de densidade abortado:/);
});

test('loaders Netwin preservam tenant, map_presence e identidade publicada do ResourceType', async () => {
  for (const file of ['migrate-netwin-osp.ts', 'migrate-netwin-infranode.ts']) {
    const script = await readFile(resolve(rootDir, 'src/scripts', file), 'utf8');
    assert.match(script, /JOIN \$\{t\('resource_specification'\)\} rs/);
    assert.match(script, /JOIN \$\{t\('resource_type'\)\} rt ON rt\.id=rs\.resource_type_id/);
    assert.match(script, /COALESCE\(rt\.map_presence, 1\) = 1/);
    assert.match(script, /source_model_type/);
    assert.match(script, /source_model_id/);
    assert.match(script, /r\.tenant_id=:tenantId/);
  }
});

test('loaders Netwin mantêm CDOI e CDOE em ResourceTypes canônicos distintos', async () => {
  const osp = await readFile(resolve(rootDir, 'src/scripts/migrate-netwin-osp.ts'), 'utf8');
  assert.match(osp, /517: \{ resourceType: 'category:CDOI', specName: 'Netwin CDOI' \}/);
  assert.match(osp, /518: \{ resourceType: 'category:CDOE', specName: 'Netwin CDOE' \}/);
  assert.doesNotMatch(osp, /51[78]: \{ resourceType: 'CTO'/);

  const infranode = await readFile(
    resolve(rootDir, 'src/scripts/migrate-netwin-infranode.ts'),
    'utf8',
  );
  assert.match(infranode, /spec: 'Netwin CDOI', resourceType: 'category:CDOI'/);
  assert.match(infranode, /spec: 'Netwin CDOE', resourceType: 'category:CDOE'/);
});

test('loader OSP cria Specifications no tenant do Resource e reutiliza tipos compartilhados', async () => {
  const loader = await readFile(resolve(rootDir, 'src/scripts/migrate-netwin-osp.ts'), 'utf8');
  const kit = await readFile(resolve(rootDir, 'src/scripts/netwin-migration-kit.ts'), 'utf8');
  assert.doesNotMatch(loader, /resourceSpecId\([^;]+, 'Infrastructure\./s);
  assert.match(loader, /classified\.resourceType,\s+input\.tenantId,/s);
  assert.match(loader, /specName, resourceType, input\.tenantId/);
  assert.match(loader, /`Netwin \$\{resourceType\}`,\s+resourceType,\s+input\.tenantId,/s);
  assert.match(kit, /tenant_id IN \(:tenantId,'default'\)/);
  assert.doesNotMatch(kit, /tenantId = 'vtal'/);
  assert.match(loader, /tenant_id: input\.tenantId/g);
  assert.match(loader, /osp-cable-route-v2-resource-type-identity/);
  assert.match(loader, /mappingVersion: MAPPING_VERSION, node/);
});

test('loader infranode versiona a mudança canônica e grava tenant no Resource', async () => {
  const script = await readFile(
    resolve(rootDir, 'src/scripts/migrate-netwin-infranode.ts'),
    'utf8',
  );
  assert.match(script, /dl-infranode-v2-resource-type-identity/);
  assert.match(script, /tenant_id: args\.tenantId,\s+name: cut\(item\.name, 255\),/);
  assert.match(script, /resourceSpecIdShared\(target, t, name, resourceType, args\.tenantId\)/);
  assert.match(script, /mappingVersion: MAPPING_VERSION, row/);
});

test('repositório de Resource não consulta a coluna textual resource_type removida da specification', async () => {
  const repository = await readFile(
    resolve(rootDir, 'src/modules/resource/oracle-repository.ts'),
    'utf8',
  );
  assert.doesNotMatch(repository, /\b(?:ps|ss|ctos|rs|ds|os)\.resource_type\b/);
  assert.match(repository, /prt\.code AS resource_type/);
  assert.match(repository, /srt\.code = 'Splitter'/);
  assert.match(repository, /drt\.code = 'DropCable'/);
  assert.match(repository, /ort\.code = 'ONT'/);
});

test('rebuild preserva o rank dos trechos de cabo e a chave inclui o ordinal', async () => {
  const script = await readFile(resolve(rootDir, 'scripts/build-map-features.mjs'), 'utf8');
  assert.match(script, /segments\.map\(\(\{ tile, coordinates, rank, lodKey \}\)/);
  assert.match(
    script,
    /geometry: JSON\.stringify\(\{ type: 'LineString', coordinates \}\),\s*lod_key: lodKey,\s*rank,/,
  );
  assert.match(
    script,
    /PRIMARY KEY \(tenant_id, tile_z, tile_x, tile_y, entity_id, shape, lod_key, rank\)/,
  );
});
