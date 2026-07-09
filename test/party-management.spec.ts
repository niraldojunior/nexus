import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createApp } from '../src/shared/http/app.js';

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

test('TMF632 and TMF669 party endpoints create, search and terminate parties', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const party = await requestJson(port, 'POST', '/tmf-api/partyManagement/v4/party', {
    name: 'ISP Alfa',
    partyType: 'Organization',
    partyCharacteristic: [
      { name: 'documentNumber', value: '12.345.678/0001-90', valueType: 'string' },
    ],
  });
  assert.equal(party.statusCode, 201);
  assert.equal((party.body as { name: string }).name, 'ISP Alfa');

  const role = await requestJson(port, 'POST', '/tmf-api/partyRoleManagement/v4/partyRole', {
    partyId: (party.body as { id: string }).id,
    name: 'tenant',
  });
  assert.equal(role.statusCode, 201);
  assert.equal((role.body as { name: string }).name, 'tenant');

  const searchByName = await requestJson(port, 'GET', '/tmf-api/partyManagement/v4/party?name=ISP');
  assert.equal(searchByName.statusCode, 200);
  assert.ok(Array.isArray(searchByName.body));
  assert.equal((searchByName.body as Array<{ id: string }>).length, 1);

  const searchByDocument = await requestJson(
    port,
    'GET',
    '/tmf-api/partyManagement/v4/party?document=12.345.678/0001-90',
  );
  assert.equal(searchByDocument.statusCode, 200);
  assert.equal((searchByDocument.body as Array<{ id: string }>).length, 1);

  const terminated = await requestJson(
    port,
    'DELETE',
    `/tmf-api/partyManagement/v4/party/${(party.body as { id: string }).id}`,
  );
  assert.equal(terminated.statusCode, 200);
  assert.equal((terminated.body as { status: string }).status, 'terminated');

  const events = await requestJson(port, 'GET', '/tmf-api/eventManagement/v4/event?source=party.Organization');
  assert.equal(events.statusCode, 200);
  assert.ok((events.body as Array<{ eventType: string }>).some((event) => event.eventType === 'PartyCreateEvent'));
});

test('bootstrap seeds manufacturer party roles for resource catalog combos', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const response = await requestJson(port, 'GET', '/tmf-api/partyRoleManagement/v4/partyRole?status=active');
  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.body));

  const names = (response.body as Array<{ party: { name?: string }; name: string }>).map((item) => item.party.name ?? item.name);
  for (const expected of ['VANTIVA', 'BLU-CASTLE', 'DATACOM', 'HUAWEI', 'ZTE', 'SAGEMCOM', 'NOKIA', 'TELLESCOM', 'ARCADYAN']) {
    assert.ok(names.includes(expected), `expected bootstrap to include ${expected}`);
  }
});

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  const root = mkdtempSync(join(tmpdir(), 'nexus-party-'));
  return {
    databaseUrl: `sqlite://${join(root, 'nexus.db')}`,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};
