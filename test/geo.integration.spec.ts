import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';

const createLogger = () => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

const createConfig = (port: number) => ({
  appName: 'v-tal-nexus',
  authEnabled: true,
  authToken: 'secret',
  databaseUrl: 'sqlite://./data/nexus.db',
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
  const server = createApp({ config: createConfig(0), logger: createLogger() });
  const port = await server.start();
  t.after(async () => server.stop());

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

test('App exposes health without auth and protected routes reject missing token', async (t) => {
  const server = createApp({ config: createConfig(0), logger: createLogger() });
  const port = await server.start();
  t.after(async () => server.stop());

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
  const server = createApp({ config: createConfig(0), logger: createLogger() });
  const port = await server.start();
  t.after(async () => server.stop());

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
  assert.match(html.body, /<title>v-tal-nexus · Nexus<\/title>/);
  assert.match(html.body, /Geo/);
});
