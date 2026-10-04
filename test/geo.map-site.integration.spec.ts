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
const ICARAI: [number, number] = [-43.106, -22.906];
const BBOX = 'minLng=-43.2&minLat=-23&maxLng=-43&maxLat=-22.8';

type Feature = { entityId: string; kind: string; label: string; sourceModelId?: string };

test.skipIf(!oracleConfigured)(
  'GET /v1/geo/map/sites lê Sites por bbox e specification, sem tratamento por tipo',
  async () => {
    const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
    const port = await server.start();
    try {
      const db = await getOracleTestClient();
      const tile = lngLatToTile(ICARAI[0], ICARAI[1], MAP_TILE_ZOOM);
      const insert = async (o: {
        id: string;
        kind: 'resource' | 'site';
        shape?: 'point' | 'line';
        spec?: string;
        status?: string;
        lng?: number;
        tenant?: string;
      }) =>
        db.run(
          `INSERT INTO geo_map_feature
             (tenant_id, tile_z, tile_x, tile_y, entity_id, shape, feature_kind, entity_type,
              source_model_type, source_model_id, status, label, lng, lat, rank)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            o.tenant ?? 'default',
            tile.z,
            tile.x,
            tile.y,
            o.id,
            o.shape ?? 'point',
            o.kind,
            o.kind === 'site' ? 'GeographicSite' : 'PhysicalResource',
            o.kind === 'site' ? 'GEOGRAPHIC_SITE_SPECIFICATION' : 'RESOURCE_TYPE',
            o.spec ?? null,
            o.status ?? null,
            o.id,
            o.lng ?? ICARAI[0],
            ICARAI[1],
          ],
        );

      await insert({ id: 'site-co', kind: 'site', spec: 'CO' });
      await insert({ id: 'site-sub', kind: 'site', spec: 'ENERGY_SUBSTATION' });
      await insert({ id: 'site-arbitrary', kind: 'site', spec: 'ANY_FUTURE_SPEC' });
      await insert({ id: 'site-outside', kind: 'site', spec: 'CO', lng: -40 });
      await insert({ id: 'site-retired', kind: 'site', spec: 'CO', status: 'Retired' });
      await insert({ id: 'site-vtal', kind: 'site', spec: 'CO', tenant: 'vtal' });
      await insert({ id: 'res-1', kind: 'resource', spec: 'CO' });

      const url = (ids: string[]) =>
        `/v1/geo/map/sites?${BBOX}${ids.map((id) => `&sourceModelId=${id}`).join('')}`;
      const labels = async (ids: string[], headers?: Record<string, string>) => {
        const r = await requestJson(port, 'GET', url(ids), undefined, headers);
        assert.equal(r.statusCode, 200);
        return ((r.body as { features: Feature[] }).features ?? []).map((f) => f.label).sort();
      };

      assert.deepEqual(await labels(['CO', 'ENERGY_SUBSTATION', 'ANY_FUTURE_SPEC']), [
        'site-arbitrary',
        'site-co',
        'site-sub',
      ]);
      assert.deepEqual(await labels(['ENERGY_SUBSTATION']), ['site-sub']);
      assert.deepEqual(await labels([]), []);
      assert.deepEqual(await labels(['CO'], { 'x-tenant-id': 'vtal' }), ['site-vtal']);

      const missing = await requestJson(port, 'GET', '/v1/geo/map/sites?minLng=-43');
      assert.equal(missing.statusCode, 400);
    } finally {
      await server.stop();
      await cleanupOracleTables(await getOracleTestClient());
    }
  },
);
