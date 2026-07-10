import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';
import { createTestDatabase as createPostgresTestDatabase } from './test-utils.js';

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
          authorization: 'Bearer secret',
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            body: text ? JSON.parse(text) : undefined,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

test('Geo HTTP integration handles spec, location and site creation', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const address = await requestJson(port, 'POST', '/v1/geo/addresses', {
    street: 'Rua Voluntarios da Patria',
  });
  assert.equal(address.statusCode, 201);

  const spec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Central Office',
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
    addressId: (address.body as { id: string }).id,
  });
  assert.equal(site.statusCode, 201);
});

test('Geo HTTP integration supports TMF aliases, workspace transaction, status event and relatedSite', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const spec = await requestJson(port, 'POST', '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification', {
    name: 'Ponto de Instalacao',
    category: 'SubSite',
  });
  assert.equal(spec.statusCode, 201);

  const feederSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'CTO',
    category: 'Site',
  });
  assert.equal(feederSpec.statusCode, 201);

  const feeder = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'CTO ICA-014',
    siteSpecificationId: (feederSpec.body as { id: string }).id,
  });
  assert.equal(feeder.statusCode, 201);

  const workspace = await requestJson(port, 'POST', '/v1/geo/workspace/site-at-address', {
    location: {
      geometryType: 'Point',
      geometry: { type: 'Point', coordinates: [-43.1059, -22.9092] },
    },
    address: {
      street: 'Rua Belisario Augusto',
      streetNr: '145',
      city: 'Niteroi',
      stateOrProvince: 'RJ',
      country: 'BR',
    },
    site: {
      name: 'PI Belisario',
      siteSpecificationId: (spec.body as { id: string }).id,
    },
    fedBySiteId: (feeder.body as { id: string }).id,
  });
  assert.equal(workspace.statusCode, 201);
  assert.equal((workspace.body as { site: { '@type': string } }).site['@type'], 'GeographicSite');
  assert.equal((workspace.body as { site: { relatedSite: Array<{ relationshipType: string }> } }).site.relatedSite[0]?.relationshipType, 'fedBy');

  const siteId = (workspace.body as { site: { id: string } }).site.id;
  const patch = await requestJson(port, 'PATCH', `/tmf-api/geographicSiteManagement/v4/geographicSite/${siteId}`, {
    status: 'active',
  });
  assert.equal(patch.statusCode, 200);

  const events = await requestJson(port, 'GET', `/v1/geo/sites/${siteId}/events`);
  assert.equal(events.statusCode, 200);
  assert.ok((events.body as Array<{ eventType: string }>).some((event) => event.eventType === 'GeographicSiteStatusChangeEvent'));
});

test('App exposes health without auth and protected routes reject missing token', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const health = await new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/health', method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      },
    );
    req.on('error', reject);
    req.end();
  });

  assert.equal(health.statusCode, 200);
  assert.equal((health.body as { status: string }).status, 'ok');

  const protectedRoute = await new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/v1/bootstrap', method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      },
    );
    req.on('error', reject);
    req.end();
  });

  assert.equal(protectedRoute.statusCode, 401);
  assert.equal((protectedRoute.body as { error: string }).error, 'AUTH_REQUIRED');
});

test('App root returns Nexus shell html', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const html = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/', method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end();
  });

  assert.equal(html.statusCode, 200);
  assert.match(html.body, /<title>v-tal-nexus - Nexus<\/title>/);
  assert.match(html.body, /Interface migrada para Vite/);
});

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  return createPostgresTestDatabase('nexus-geo-');
};
