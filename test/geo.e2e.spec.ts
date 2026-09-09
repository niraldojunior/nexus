import assert from 'node:assert/strict';
import http from 'node:http';
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

const oracleConfigured = isOracleTestConfigured();

test.skipIf(!oracleConfigured)(
  'E2E Geo flow rejects invalid JSON and supports the happy path',
  async () => {
    const server = createApp({
      config: createTestConfig(0),
      logger: createTestLogger(),
    });

    const port = await server.start();
    try {
      const invalid = await new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/v1/geo/locations',
            method: 'POST',
            headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode ?? 0,
                body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
              });
            });
          },
        );
        req.on('error', reject);
        req.write('{broken json');
        req.end();
      });

      assert.equal(invalid.statusCode, 400);
      assert.equal((invalid.body as { error: string }).error, 'INVALID_JSON');

      const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
        name: 'Site',
        category: 'Site',
      });
      assert.equal(spec.statusCode, 201);

      const location = await requestJson(port, 'POST', '/v1/geo/locations', {
        geometryType: 'Point',
        geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
      });
      assert.equal(location.statusCode, 201);

      const site = await requestJson(port, 'POST', '/v1/geo/sites', {
        name: 'CO Botafogo',
        siteSpecificationId: (spec.body as { id: string }).id,
        placeId: (location.body as { id: string }).id,
      });
      assert.equal(site.statusCode, 201);
      assert.equal((site.body as { '@type': string })['@type'], 'GeographicSite');
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);
