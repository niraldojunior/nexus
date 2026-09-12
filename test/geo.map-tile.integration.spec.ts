import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createApp } from '../src/shared/http/app.js';
import {
  cleanupOracleTables,
  createTestConfig,
  createTestLogger,
  getOracleTestClient,
  isOracleTestConfigured,
  requestJson,
} from './test-utils.js';
import { lngLatToTile, MAP_TILE_ZOOM } from '../src/modules/geo/map-tile.js';

const oracleConfigured = isOracleTestConfigured();

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

test.skipIf(!oracleConfigured)(
  'GET /v1/geo/map/tile lê o índice geo_map_feature por igualdade de tile, isolado da bbox',
  async () => {
    const server = createApp({
      config: createTestConfig(0),
      logger: createTestLogger(),
    });
    const port = await server.start();
    try {
      // Mesma instância de banco que o app usa: o índice é semeado direto na tabela de
      // projeção, como faz scripts/build-map-features.mjs — o write-through ainda não existe
      // (ver comentário de geo_map_feature em schema.ts).
      const db = await getOracleTestClient();

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
        tenantId?: string;
      }) => {
        await db.run(
          `INSERT INTO geo_map_feature
             (tenant_id, tile_z, tile_x, tile_y, entity_id, shape, feature_kind, entity_type,
              type_code, label, lng, lat, geometry, rank)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            overrides.tenantId ?? 'default',
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
      // Mesmo tile, outro tenant: precisa aparecer somente quando a request carregar aquele tenant
      // no contexto. Esta é a regressão do mapa vtal que lia silenciosamente o índice `default`.
      await insertFeature({
        entityId: 'aaaaaaaa-0000-0000-0000-000000000003',
        tileX: tile.x,
        tileY: tile.y,
        shape: 'point',
        kind: 'resource',
        entityType: 'PhysicalResource',
        typeCode: 'category:CDOE',
        label: 'CDOE-vtal',
        lng: ICARAI[0],
        lat: ICARAI[1],
        tenantId: 'vtal',
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
      assert.ok(!features.some((f) => f.label === 'CDOE-vtal'));

      const vtalResult = await requestJson(
        port,
        'GET',
        `/v1/geo/map/tile?z=${tile.z}&x=${tile.x}&y=${tile.y}`,
        undefined,
        { 'x-tenant-id': 'vtal' },
      );
      assert.equal(vtalResult.statusCode, 200);
      const vtalFeatures = vtalResult.body as MapTileFeature[];
      assert.equal(vtalFeatures.length, 1);
      assert.equal(vtalFeatures[0]?.label, 'CDOE-vtal');
      assert.equal(vtalFeatures[0]?.typeCode, 'category:CDOE');

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
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);
