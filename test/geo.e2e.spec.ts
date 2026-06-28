import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const request = async (
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ statusCode: number; body: unknown }> => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          authorization: 'Bearer change-me',
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: res.statusCode ?? 0, body: text ? JSON.parse(text) : undefined });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

test('E2E Geo flow rejects invalid JSON and supports the happy path', async (t) => {
  const server = createApp({
    config: {
      appName: 'v-tal-nexus',
      authEnabled: true,
      authToken: 'change-me',
      databaseUrl: 'sqlite://./data/nexus.db',
      logLevel: 'info',
      nodeEnv: 'test',
      port: 0,
    },
    logger,
  });

  const port = await server.start();
  t.after(async () => server.stop());

  const invalid = await new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/v1/geo/locations',
        method: 'POST',
        headers: { authorization: 'Bearer change-me', 'content-type': 'application/json' },
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

  const spec = await request(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Site',
    category: 'Site',
  });
  assert.equal(spec.statusCode, 201);

  const location = await request(port, 'POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
  });
  assert.equal(location.statusCode, 201);

  const site = await request(port, 'POST', '/v1/geo/sites', {
    name: 'CO Botafogo',
    siteSpecificationId: (spec.body as { id: string }).id,
    placeId: (location.body as { id: string }).id,
  });
  assert.equal(site.statusCode, 201);
  assert.equal((site.body as { '@type': string })['@type'], 'GeographicSite');
});
