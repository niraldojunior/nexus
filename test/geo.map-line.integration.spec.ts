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
import { lngLatToTile } from '../src/modules/geo/map-tile.js';

const oracleConfigured = isOracleTestConfigured();

type LineResponse = {
  features: Array<{ entityId: string; label: string }>;
  truncated: boolean;
  selections: Array<{
    sourceModelId: string;
    lodKey: string;
    tileZoom: number | null;
    fragments: number;
    stale: boolean;
  }>;
};

const SPEC = 'EnergyTransmissionLine';
// Entre Niterói e Rio — a linha de teste cruza esta caixa.
const CENTER: [number, number] = [-43.2, -22.9];
const BBOX = 'minLng=-43.3&minLat=-23.0&maxLng=-43.1&maxLat=-22.8';

test.skipIf(!oracleConfigured)(
  'GET /v1/geo/map/lines separa LOD, tenant e camada, sinaliza truncamento e índice desatualizado',
  async () => {
    const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
    const port = await server.start();
    try {
      const db = await getOracleTestClient();

      const insertFragment = async (o: {
        entityId: string;
        lodKey: string;
        tileZ: number;
        rank?: number;
        tenantId?: string;
        sourceModelId?: string;
      }) => {
        const tile = lngLatToTile(CENTER[0], CENTER[1], o.tileZ);
        await db.run(
          `INSERT INTO geo_map_feature
             (tenant_id, tile_z, tile_x, tile_y, entity_id, shape, feature_kind, entity_type,
              type_code, source_model_type, source_model_id, label, lng, lat, geometry, lod_key, rank)
           VALUES (?, ?, ?, ?, ?, 'line', 'resource', 'PhysicalResource', ?, 'RESOURCE_TYPE', ?, ?, ?, ?, ?, ?, ?)`,
          [
            o.tenantId ?? 'default',
            o.tileZ,
            tile.x,
            tile.y,
            o.entityId,
            o.sourceModelId ?? SPEC,
            o.sourceModelId ?? SPEC,
            `linha-${o.entityId}-${o.lodKey}`,
            CENTER[0],
            CENTER[1],
            JSON.stringify({
              type: 'LineString',
              coordinates: [
                [CENTER[0] - 0.01, CENTER[1]],
                [CENTER[0] + 0.01, CENTER[1]],
              ],
            }),
            o.lodKey,
            o.rank ?? 0,
          ],
        );
      };

      // Mesma entidade em dois LODs (z8 e z12) coexistindo; outra camada e outro tenant no mesmo lugar.
      await insertFragment({
        entityId: 'bbbbbbbb-0000-0000-0000-000000000001',
        lodKey: 'regional',
        tileZ: 8,
      });
      await insertFragment({
        entityId: 'bbbbbbbb-0000-0000-0000-000000000001',
        lodKey: 'detail',
        tileZ: 12,
      });
      await insertFragment({
        entityId: 'bbbbbbbb-0000-0000-0000-000000000002',
        lodKey: 'regional',
        tileZ: 8,
        sourceModelId: 'GasPipeline',
      });
      await insertFragment({
        entityId: 'bbbbbbbb-0000-0000-0000-000000000003',
        lodKey: 'regional',
        tileZ: 8,
        tenantId: 'vtal',
      });

      const get = (query: string, headers?: Record<string, string>) =>
        requestJson(port, 'GET', `/v1/geo/map/lines?${BBOX}&${query}`, undefined, headers);

      // Filtro por camada + LOD: só o fragmento regional da camada pedida, no tenant default.
      const regional = await get(`line=${SPEC}:regional`);
      assert.equal(regional.statusCode, 200);
      const regionalBody = regional.body as LineResponse;
      assert.deepEqual(
        regionalBody.features.map((f) => f.entityId),
        ['bbbbbbbb-0000-0000-0000-000000000001'],
      );
      assert.equal(regionalBody.selections[0]?.tileZoom, 8);
      assert.equal(regionalBody.truncated, false);

      // O outro LOD da mesma entidade vem do seu próprio zoom de armazenamento.
      const detail = (await get(`line=${SPEC}:detail`)).body as LineResponse;
      assert.equal(detail.selections[0]?.tileZoom, 12);
      assert.equal(detail.features.length, 1);

      // Tenant isolado.
      const vtal = (await get(`line=${SPEC}:regional`, { 'x-tenant-id': 'vtal' }))
        .body as LineResponse;
      assert.deepEqual(
        vtal.features.map((f) => f.entityId),
        ['bbbbbbbb-0000-0000-0000-000000000003'],
      );

      // Perfil inexistente: vazio, sem manifesto não há como afirmar índice desatualizado.
      const unknown = (await get(`line=${SPEC}:inexistente`)).body as LineResponse;
      assert.equal(unknown.features.length, 0);
      assert.equal(unknown.selections[0]?.tileZoom, null);
      assert.equal(unknown.selections[0]?.stale, false);

      // bbox sem nada: vazio, não erro.
      const empty = await requestJson(
        port,
        'GET',
        `/v1/geo/map/lines?minLng=10&minLat=10&maxLng=10.1&maxLat=10.1&line=${SPEC}:regional`,
      );
      assert.equal(empty.statusCode, 200);
      assert.equal((empty.body as LineResponse).features.length, 0);

      // Índice desatualizado: manifesto existe só com 'regional'; pedir 'detail' sinaliza stale.
      await db.run(
        `INSERT INTO geo_map_line_index
           (tenant_id, source_model_id, lod_key, tile_z, simplify_tolerance_meters, fragments, vertices)
         VALUES ('default', ?, 'regional', 8, 150, 1, 2)`,
        [SPEC],
      );
      const stale = (await get(`line=${SPEC}:regional&line=${SPEC}:overview`)).body as LineResponse;
      assert.equal(stale.selections.find((s) => s.lodKey === 'regional')?.stale, false);
      assert.equal(stale.selections.find((s) => s.lodKey === 'overview')?.stale, true);

      // Parâmetros inválidos: 400.
      const bad = await requestJson(port, 'GET', '/v1/geo/map/lines?minLng=1');
      assert.equal(bad.statusCode, 400);
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);

test.skipIf(!oracleConfigured)('GET /v1/geo/map/lines marca truncated acima do teto', async () => {
  const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
  const port = await server.start();
  try {
    const db = await getOracleTestClient();
    const tile = lngLatToTile(CENTER[0], CENTER[1], 8);
    // Três fragmentos do mesmo tile; o teto de 20.000 não é viável semear, então valida-se o
    // caminho de limite no serviço (unit). Aqui garante-se só que o conjunto pequeno NÃO trunca.
    for (const rank of [0, 1, 2]) {
      await db.run(
        `INSERT INTO geo_map_feature
           (tenant_id, tile_z, tile_x, tile_y, entity_id, shape, feature_kind, entity_type,
            type_code, source_model_type, source_model_id, label, lng, lat, geometry, lod_key, rank)
         VALUES ('default', 8, ?, ?, 'cccccccc-0000-0000-0000-000000000001', 'line', 'resource',
                 'PhysicalResource', ?, 'RESOURCE_TYPE', ?, 'frag', ?, ?, ?, 'regional', ?)`,
        [
          tile.x,
          tile.y,
          SPEC,
          SPEC,
          CENTER[0],
          CENTER[1],
          JSON.stringify({
            type: 'LineString',
            coordinates: [
              [CENTER[0], CENTER[1]],
              [CENTER[0] + 0.01, CENTER[1]],
            ],
          }),
          rank,
        ],
      );
    }
    const response = await requestJson(
      port,
      'GET',
      `/v1/geo/map/lines?${BBOX}&line=${SPEC}:regional`,
    );
    const body = response.body as LineResponse;
    assert.equal(body.features.length, 3);
    assert.equal(body.truncated, false);
  } finally {
    await server.stop();
    const client = await getOracleTestClient();
    await cleanupOracleTables(client);
  }
});
