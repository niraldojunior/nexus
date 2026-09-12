import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import {
  GeoMapFeatureSynchronizer,
  MAP_FEATURE_POINT_INSERT_SQL,
  candidatesSql,
} from '../src/modules/geo/map-feature-synchronizer.js';
import { INTERNAL_RESOURCE_TYPES } from '../src/modules/geo/map-visibility.js';
import type {
  DatabaseClient,
  DatabaseSession,
} from '../src/shared/persistence/database-client.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// O write-through monta o INSERT de `geo_map_feature` à mão, com a lista de colunas e a de
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
  assert.match(CANDIDATES_SQL, /JOIN tmf_resource_type rt\s+ON rt\.id = rs\.resource_type_id/);
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

test('candidatesSql restringe site a category = Site, fora de projeto em curso', () => {
  assert.match(CANDIDATES_SQL, /spec\.category = 'Site'/);
  assert.doesNotMatch(CANDIDATES_SQL, /'SubSite'/);
  assert.match(CANDIDATES_SQL, /geo_project_site/);
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

  assert.deepEqual(calls[0]?.params, ['vtal', 'resource-1']);
  assert.deepEqual(calls[1]?.params, ['resource-1', 'vtal', 'resource-1', 'vtal']);
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
    'location-default',
    'vtal',
    'location-default',
    'vtal',
  ]);
  assert.match(lookupCalls[0]?.sql ?? '', /tmf_physical_resource WHERE place_id = \? AND tenant_id = \?/);
});

test('rebuild do índice inclui somente PhysicalResource, compatível com ResourcePanel', async () => {
  const script = await readFile(resolve(rootDir, 'scripts/build-map-features.mjs'), 'utf8');
  assert.match(script, /resourceSource\('PhysicalResource', scopeWhere\)/);
  assert.doesNotMatch(script, /resourceSource\('LogicalResource', scopeWhere\)/);
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
  const deleteTenant = script.indexOf('DELETE FROM geo_map_density WHERE tenant_id');
  assert.ok(emptyGuard >= 0);
  assert.ok(deleteTenant > emptyGuard);
  assert.match(script, /if \(APPLY\) throw new Error\(`Rebuild de densidade abortado:/);
});

test('loaders Netwin preservam tenant, map_presence e identidade publicada do ResourceType', async () => {
  for (const file of ['migrate-netwin-osp.ts', 'migrate-netwin-infranode.ts']) {
    const script = await readFile(resolve(rootDir, 'src/scripts', file), 'utf8');
    assert.match(script, /JOIN \$\{t\('tmf_resource_specification'\)\} rs/);
    assert.match(script, /JOIN \$\{t\('tmf_resource_type'\)\} rt ON rt\.id=rs\.resource_type_id/);
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
  const repository = await readFile(resolve(rootDir, 'src/modules/resource/oracle-repository.ts'), 'utf8');
  assert.doesNotMatch(repository, /\b(?:ps|ss|ctos|rs|ds|os)\.resource_type\b/);
  assert.match(repository, /prt\.code AS resource_type/);
  assert.match(repository, /srt\.code = 'Splitter'/);
  assert.match(repository, /drt\.code = 'DropCable'/);
  assert.match(repository, /ort\.code = 'ONT'/);
});

test('rebuild preserva o rank dos trechos de cabo e a chave inclui o ordinal', async () => {
  const script = await readFile(resolve(rootDir, 'scripts/build-map-features.mjs'), 'utf8');
  assert.match(script, /segments\.map\(\(\{ tile, coordinates, rank \}\)/);
  assert.match(script, /geometry: JSON\.stringify\(\{ type: 'LineString', coordinates \}\),\s*rank,/);
  assert.match(
    script,
    /PRIMARY KEY \(tenant_id, tile_z, tile_x, tile_y, entity_id, shape, rank\)/,
  );
});
