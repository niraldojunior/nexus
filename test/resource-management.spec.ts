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

test('TMF634, TMF639 and TMF664 resource endpoints create and activate resources', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const party = await requestJson(port, 'POST', '/tmf-api/partyManagement/v4/party', {
    name: 'V.tal',
    partyType: 'Organization',
  });
  assert.equal(party.statusCode, 201);

  const siteSpec = await requestJson(port, 'POST', '/v1/geo/site-specifications', {
    name: 'Central Office',
    category: 'Site',
  });
  assert.equal(siteSpec.statusCode, 201);

  const site = await requestJson(port, 'POST', '/v1/geo/sites', {
    name: 'CO Botafogo',
    siteSpecificationId: (siteSpec.body as { id: string }).id,
  });
  assert.equal(site.statusCode, 201);

  const resourceSpec = await requestJson(port, 'POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
    name: 'OLT MA5800',
    category: 'Equipment.Access',
    resourceType: 'OLT',
    relatedParty: [
      { id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'manufacturer' },
    ],
  });
  assert.equal(resourceSpec.statusCode, 201);

  const categories = await requestJson(port, 'GET', '/tmf-api/resourceCatalogManagement/v4/resourceCategory');
  assert.equal(categories.statusCode, 200);
  assert.ok(Array.isArray(categories.body));
  assert.ok((categories.body as Array<{ code: string }>).some((category) => category.code === 'Equipment.Access'));

  const types = await requestJson(port, 'GET', '/tmf-api/resourceCatalogManagement/v4/resourceType');
  assert.equal(types.statusCode, 200);
  assert.ok(Array.isArray(types.body));
  assert.ok((types.body as Array<{ code: string }>).some((type) => type.code === 'OLT'));

  const invalidResourceSpec = await requestJson(port, 'POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
    name: 'OLT sem tipo',
    category: 'Equipment.Access',
  });
  assert.equal(invalidResourceSpec.statusCode, 400);
  assert.equal((invalidResourceSpec.body as { error?: string }).error, 'RESOURCE_REQUIRED_FIELD');
  assert.equal((invalidResourceSpec.body as { message?: string }).message, 'resourceType is required');

  const workspace = await requestJson(port, 'GET', '/v1/resource/workspace?tab=PhysicalResource&limit=20&offset=0');
  assert.equal(workspace.statusCode, 200);
  const workspaceBody = workspace.body as {
    items: Array<{ id: string }>;
    resourceSpecificationOptions: Array<{ id: string }>;
    resourceCategories: Array<{ code: string }>;
    resourceTypes: Array<{ code: string }>;
    physicalResources: Array<{ id: string }>;
    logicalResources: Array<{ id: string }>;
    manufacturerOptions: Array<{ id: string }>;
  };
  assert.ok(Array.isArray(workspaceBody.items));
  assert.ok(Array.isArray(workspaceBody.resourceSpecificationOptions));
  assert.ok(Array.isArray(workspaceBody.resourceCategories));
  assert.ok(Array.isArray(workspaceBody.resourceTypes));
  assert.ok(Array.isArray(workspaceBody.physicalResources));
  assert.ok(Array.isArray(workspaceBody.logicalResources));
  assert.ok(Array.isArray(workspaceBody.manufacturerOptions));

  const deletedSpec = await requestJson(
    port,
    'DELETE',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${(resourceSpec.body as { id: string }).id}`,
  );
  assert.equal(deletedSpec.statusCode, 200);
  assert.ok((deletedSpec.body as { validFor?: { endDateTime?: string } }).validFor?.endDateTime);

  const fetchedDeletedSpec = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${(resourceSpec.body as { id: string }).id}`,
  );
  assert.equal(fetchedDeletedSpec.statusCode, 200);
  assert.ok((fetchedDeletedSpec.body as { validFor?: { endDateTime?: string } }).validFor?.endDateTime);

  const functionSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification',
    {
      name: 'Default activation',
    },
  );
  assert.equal(functionSpec.statusCode, 201);

  const physicalResource = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'OLT-BOT-01',
    resourceSpecificationId: (resourceSpec.body as { id: string }).id,
    placeId: (site.body as { id: string }).id,
    placeType: 'GeographicSite',
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'owner' }],
    manufacturer: 'Huawei',
    model: 'MA5800',
    serialNumber: 'SN-OLT-001',
  });
  assert.equal(physicalResource.statusCode, 201);
  assert.equal((physicalResource.body as { '@type': string })['@type'], 'PhysicalResource');

  const logicalResource = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'LogicalResource',
    name: 'VLAN 100',
    resourceSpecificationId: (resourceSpec.body as { id: string }).id,
    supportingPhysicalResourceId: (physicalResource.body as { id: string }).id,
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'owner' }],
  });
  assert.equal(logicalResource.statusCode, 201);
  assert.equal((logicalResource.body as { '@type': string })['@type'], 'LogicalResource');

  const activated = await requestJson(port, 'POST', '/tmf-api/resourceFunctionActivation/v4/resourceFunction', {
    resourceId: (physicalResource.body as { id: string }).id,
    action: 'activate',
  });
  assert.equal(activated.statusCode, 200);
  assert.equal((activated.body as { status: string }).status, 'active');

  const filtered = await requestJson(
    port,
    'GET',
    '/tmf-api/resourceInventoryManagement/v4/resource?kind=PhysicalResource&status=active',
  );
  assert.equal(filtered.statusCode, 200);
  assert.ok(Array.isArray(filtered.body));
  assert.equal((filtered.body as Array<{ id: string }>).length, 1);

  const events = await requestJson(
    port,
    'GET',
    '/tmf-api/eventManagement/v4/event?source=resource.PhysicalResource&eventType=ResourceCreateEvent',
  );
  assert.equal(events.statusCode, 200);
  assert.ok((events.body as Array<{ eventType: string }>).some((event) => event.eventType === 'ResourceCreateEvent'));
});

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  return createPostgresTestDatabase('nexus-resource-');
};
