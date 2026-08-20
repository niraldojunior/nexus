import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';
import { createTestDatabase as createPostgresTestDatabase } from './test-utils.js';
import { createDatabaseClient } from '../src/shared/persistence/database-factory.js';
import { databaseConfigOf } from '../src/shared/config/env.js';
import { lngLatToTile, MAP_TILE_ZOOM } from '../src/modules/geo/map-tile.js';

const createLogger = () => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

const createConfig = (port: number, databaseUrl: string) => ({
  appName: 'v-tal-nexus',
  authEnabled: true,
  authToken: 'secret',
  databaseUrl,
  logLevel: 'info' as const,
  nodeEnv: 'test' as const,
  port,
});

const requestJson = async (
  port: number,
  method: string,
  path: string,
): Promise<{ statusCode: number; body: unknown }> =>
  await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { authorization: 'Bearer secret' },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });

type MapTileFeature = {
  entityId: string;
  kind: 'resource' | 'site';
  entityType: string;
  shape: 'point' | 'line';
  typeCode?: string;
  status?: string;
  label: string;
  lng: number;
  lat: number;
  geometry?: { type: 'LineString'; coordinates: Array<[number, number]> };
};

// Icaraí, Niterói — mesma coordenada de referência de geo.coverage.unit.spec.ts /
// geo.map-tile.unit.spec.ts.
const ICARAI: [number, number] = [-43.106, -22.906];

test('GET /v1/geo/map/tile lê o índice geo_map_feature por igualdade de tile, isolado da bbox', async (t) => {
  const database = createPostgresTestDatabase('geo-map-tile');
  const server = createApp({
    config: createConfig(0, database.databaseUrl),
    logger: createLogger(),
  });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  // Mesma instância de banco que o app usa (PostgresDatabase é singleton por URL): o índice é
  // semeado direto na tabela de projeção, como faz scripts/build-map-features.mjs — o
  // write-through ainda não existe (ver comentário de geo_map_feature em schema.ts).
  const db = createDatabaseClient(databaseConfigOf(createConfig(0, database.databaseUrl)));

  const tile = lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM);
  const otherTile = { z: tile.z, x: tile.x + 5, y: tile.y };

  const insertFeature = async (overrides: {
    entityId: string;
    tileX: number;
    tileY: number;
    shape: 'point' | 'line';
    kind: 'resource' | 'site';
    entityType: string;
    typeCode?: string;
    label: string;
    lng: number;
    lat: number;
    geometry?: string;
  }) => {
    await db.run(
      `INSERT INTO geo_map_feature
         (tenant_id, tile_z, tile_x, tile_y, entity_id, shape, feature_kind, entity_type,
          type_code, label, lng, lat, geometry, rank)
       VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        tile.z,
        overrides.tileX,
        overrides.tileY,
        overrides.entityId,
        overrides.shape,
        overrides.kind,
        overrides.entityType,
        overrides.typeCode ?? null,
        overrides.label,
        overrides.lng,
        overrides.lat,
        overrides.geometry ?? null,
      ],
    );
  };

  await insertFeature({
    entityId: 'aaaaaaaa-0000-0000-0000-000000000001',
    tileX: tile.x,
    tileY: tile.y,
    shape: 'point',
    kind: 'resource',
    entityType: 'PhysicalResource',
    typeCode: 'CTO',
    label: 'CDO-1',
    lng: ICARAI[0],
    lat: ICARAI[1],
  });
  await insertFeature({
    entityId: 'aaaaaaaa-0000-0000-0000-000000000002',
    tileX: tile.x,
    tileY: tile.y,
    shape: 'line',
    kind: 'resource',
    entityType: 'PhysicalResource',
    typeCode: 'DistributionCable',
    label: 'Cabo Distribuição 01',
    lng: ICARAI[0],
    lat: ICARAI[1],
    geometry: JSON.stringify({
      type: 'LineString',
      coordinates: [
        [ICARAI[0] - 0.0005, ICARAI[1]],
        [ICARAI[0] + 0.0005, ICARAI[1]],
      ],
    }),
  });
  // Feature num tile VIZINHO — não deve aparecer na leitura do tile de Icaraí.
  await insertFeature({
    entityId: 'aaaaaaaa-0000-0000-0000-000000000099',
    tileX: otherTile.x,
    tileY: otherTile.y,
    shape: 'point',
    kind: 'resource',
    entityType: 'PhysicalResource',
    typeCode: 'CTO',
    label: 'CDO-vizinho',
    lng: ICARAI[0] + 1,
    lat: ICARAI[1],
  });

  const result = await requestJson(
    port,
    'GET',
    `/v1/geo/map/tile?z=${tile.z}&x=${tile.x}&y=${tile.y}`,
  );
  assert.equal(result.statusCode, 200);
  const features = result.body as MapTileFeature[];
  assert.equal(features.length, 2);

  const point = features.find((f) => f.shape === 'point');
  assert.ok(point, 'esperava a feature de ponto');
  assert.equal(point?.label, 'CDO-1');
  assert.equal(point?.typeCode, 'CTO');
  assert.equal(point?.kind, 'resource');
  assert.equal(point?.lng, ICARAI[0]);
  assert.equal(point?.lat, ICARAI[1]);

  const line = features.find((f) => f.shape === 'line');
  assert.ok(line, 'esperava a feature de linha');
  assert.equal(line?.label, 'Cabo Distribuição 01');
  assert.deepEqual(line?.geometry?.type, 'LineString');
  assert.equal(line?.geometry?.coordinates.length, 2);

  // O tile vizinho não vaza para esta leitura.
  assert.ok(!features.some((f) => f.label === 'CDO-vizinho'));

  const neighborResult = await requestJson(
    port,
    'GET',
    `/v1/geo/map/tile?z=${otherTile.z}&x=${otherTile.x}&y=${otherTile.y}`,
  );
  assert.equal(neighborResult.statusCode, 200);
  assert.equal((neighborResult.body as MapTileFeature[]).length, 1);
  assert.equal((neighborResult.body as MapTileFeature[])[0]?.label, 'CDO-vizinho');

  // Tile sem nenhuma feature: array vazio, não erro.
  const emptyResult = await requestJson(
    port,
    'GET',
    `/v1/geo/map/tile?z=${tile.z}&x=${tile.x + 999}&y=${tile.y}`,
  );
  assert.equal(emptyResult.statusCode, 200);
  assert.deepEqual(emptyResult.body, []);

  // Parâmetro faltando ou não-inteiro: 400.
  const missing = await requestJson(port, 'GET', '/v1/geo/map/tile?z=16&x=100');
  assert.equal(missing.statusCode, 400);
  const nonInteger = await requestJson(port, 'GET', '/v1/geo/map/tile?z=16&x=1.5&y=100');
  assert.equal(nonInteger.statusCode, 400);
});
