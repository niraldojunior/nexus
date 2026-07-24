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

test('TMF633 and TMF638 service endpoints create and constrain services', async (t) => {
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
  });
  assert.equal(party.statusCode, 201);

  const siteSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Home Installation',
    category: 'Site',
  });
  assert.equal(siteSpec.statusCode, 201);

  const site = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'CO Botafogo',
    siteSpecificationId: (siteSpec.body as { id: string }).id,
  });
  assert.equal(site.statusCode, 201);

  const resourceSpec = await requestJson(port, 'POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
    name: 'ONT',
    category: 'Equipment.CustomerPremises',
    resourceType: 'ONT',
  });
  assert.equal(resourceSpec.statusCode, 201);

  const resource = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'ONT-0001',
    resourceSpecificationId: (resourceSpec.body as { id: string }).id,
    placeId: (site.body as { id: string }).id,
    placeType: 'GeographicSite',
    serialNumber: 'ONT-0001',
  });
  assert.equal(resource.statusCode, 201);

  const cfsSpec = await requestJson(port, 'POST', '/tmf-api/serviceCatalogManagement/v4/serviceSpecification', {
    name: 'Bitstream GPON',
    category: 'Broadband',
    serviceType: 'CFS',
  });
  assert.equal(cfsSpec.statusCode, 201);

  const rfsSpec = await requestJson(port, 'POST', '/tmf-api/serviceCatalogManagement/v4/serviceSpecification', {
    name: 'GPON Access',
    category: 'Broadband',
    serviceType: 'RFS',
  });
  assert.equal(rfsSpec.statusCode, 201);

  const category = await requestJson(port, 'POST', '/tmf-api/serviceCatalogManagement/v4/serviceCategory', {
    name: 'Access',
  });
  assert.equal(category.statusCode, 201);

  const candidate = await requestJson(port, 'POST', '/tmf-api/serviceCatalogManagement/v4/serviceCandidate', {
    name: 'Bitstream Candidate',
    serviceSpecificationId: (cfsSpec.body as { id: string }).id,
    serviceCategoryId: (category.body as { id: string }).id,
  });
  assert.equal(candidate.statusCode, 201);

  const rfs = await requestJson(port, 'POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'ResourceFacingService',
    name: 'RFS GPON 1',
    serviceSpecificationId: (rfsSpec.body as { id: string }).id,
    category: 'Broadband',
    supportingResource: [{ id: (resource.body as { id: string }).id, '@referredType': 'PhysicalResource', role: 'access' }],
    state: 'active',
  });
  assert.equal(rfs.statusCode, 201);
  assert.equal((rfs.body as { '@type': string })['@type'], 'ResourceFacingService');

  const cfs = await requestJson(port, 'POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'CustomerFacingService',
    name: 'CFS Bitstream 700',
    serviceSpecificationId: (cfsSpec.body as { id: string }).id,
    category: 'Broadband',
    subscriberId: 'SUB-778899',
    supportingService: [{ id: (rfs.body as { id: string }).id, '@referredType': 'ResourceFacingService', role: 'access' }],
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'subscriber' }],
    place: [{ id: (site.body as { id: string }).id, '@referredType': 'GeographicSite', role: 'installationAddress' }],
    serviceCharacteristic: [{ name: 'SubscriberID', value: 'SUB-778899', valueType: 'string' }],
  });
  assert.equal(cfs.statusCode, 201);
  assert.equal((cfs.body as { '@type': string })['@type'], 'CustomerFacingService');

  const filtered = await requestJson(port, 'GET', '/tmf-api/serviceInventoryManagement/v4/service?characteristic.SubscriberID=SUB-778899');
  assert.equal(filtered.statusCode, 200);
  assert.ok(Array.isArray(filtered.body));
  assert.equal((filtered.body as Array<{ id: string }>).length, 1);

  const workspace = await requestJson(
    port,
    'GET',
    '/v1/service/workspace?tab=CustomerFacingService&category=Broadband',
  );
  assert.equal(workspace.statusCode, 200);
  const workspaceBody = workspace.body as {
    serviceSpecificationOptions: Array<{ id: string }>;
    serviceCategories: Array<{ id: string }>;
    serviceCandidates: Array<{ id: string }>;
    customerFacingServices: Array<{ id: string }>;
    resourceFacingServices: Array<{ id: string }>;
  };
  assert.ok(Array.isArray(workspaceBody.serviceSpecificationOptions));
  assert.ok(Array.isArray(workspaceBody.serviceCandidates));
  assert.ok(
    workspaceBody.customerFacingServices.some((service) => service.id === (cfs.body as { id: string }).id),
  );
  assert.ok(
    workspaceBody.resourceFacingServices.some((service) => service.id === (rfs.body as { id: string }).id),
  );

  const invalidCfs = await requestJson(port, 'POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'CustomerFacingService',
    name: 'Invalid CFS',
    serviceSpecificationId: (cfsSpec.body as { id: string }).id,
    subscriberId: 'SUB-000000',
    supportingResource: [{ id: (resource.body as { id: string }).id, '@referredType': 'PhysicalResource' }],
  });
  assert.equal(invalidCfs.statusCode, 422);

  const invalidRfs = await requestJson(port, 'POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'ResourceFacingService',
    name: 'Invalid RFS',
    serviceSpecificationId: (rfsSpec.body as { id: string }).id,
    subscriberId: 'SUB-111111',
    supportingResource: [{ id: (resource.body as { id: string }).id, '@referredType': 'PhysicalResource' }],
  });
  assert.equal(invalidRfs.statusCode, 422);

  const terminated = await requestJson(port, 'DELETE', `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}`);
  assert.equal(terminated.statusCode, 200);
  assert.equal((terminated.body as { state: string }).state, 'terminated');

  const events = await requestJson(port, 'GET', '/tmf-api/eventManagement/v4/event?source=service.CustomerFacingService&eventType=ServiceCreateEvent');
  assert.equal(events.statusCode, 200);
  assert.ok((events.body as Array<{ eventType: string }>).some((event) => event.eventType === 'ServiceCreateEvent'));
});

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  return createPostgresTestDatabase('nexus-service-');
};
