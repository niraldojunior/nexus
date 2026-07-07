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

test('TMF645, TMF641 and TMF652 order endpoints qualify and execute orders', async (t) => {
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
    name: 'Access Site',
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
    category: 'Equipment',
    resourceType: 'PhysicalResource',
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

  const resourceOrder = await requestJson(port, 'POST', '/tmf-api/resourceOrderingManagement/v4/resourceOrder', {
    description: 'Provisionamento de recurso fisico',
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'requestor' }],
    resourceOrderItem: [
      {
        action: 'add',
        resource: {
          '@type': 'PhysicalResource',
          name: 'ONT-0002',
          resourceSpecificationId: (resourceSpec.body as { id: string }).id,
          placeId: (site.body as { id: string }).id,
          placeType: 'GeographicSite',
          serialNumber: 'ONT-0002',
        },
      },
    ],
  });
  assert.equal(resourceOrder.statusCode, 201);
  assert.equal((resourceOrder.body as { state: string }).state, 'completed');
  assert.equal(
    ((resourceOrder.body as { resourceOrderItem: Array<{ resourceResult?: { '@type': string } }> }).resourceOrderItem[0]?.resourceResult?.['@type']),
    'PhysicalResource',
  );

  const resourceOrderList = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceOrderingManagement/v4/resourceOrder?relatedPartyId=${(party.body as { id: string }).id}`,
  );
  assert.equal(resourceOrderList.statusCode, 200);
  assert.ok(Array.isArray(resourceOrderList.body));
  assert.equal((resourceOrderList.body as Array<{ id: string }>).length, 1);

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

  const rfs = await requestJson(port, 'POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'ResourceFacingService',
    name: 'RFS GPON 1',
    serviceSpecificationId: (rfsSpec.body as { id: string }).id,
    supportingResource: [{ id: (resource.body as { id: string }).id, '@referredType': 'PhysicalResource', role: 'access' }],
    state: 'active',
  });
  assert.equal(rfs.statusCode, 201);

  const qualification = await requestJson(port, 'POST', '/tmf-api/serviceQualificationManagement/v4/serviceQualification', {
    placeId: (site.body as { id: string }).id,
    serviceSpecificationId: (cfsSpec.body as { id: string }).id,
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'requestor' }],
  });
  assert.equal(qualification.statusCode, 201);
  assert.equal((qualification.body as { state: string }).state, 'done');
  assert.equal(
    ((qualification.body as { serviceQualificationItem: Array<{ eligibility: string }> }).serviceQualificationItem[0]?.eligibility),
    'qualified',
  );

  const qualificationList = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceQualificationManagement/v4/serviceQualification?placeId=${(site.body as { id: string }).id}`,
  );
  assert.equal(qualificationList.statusCode, 200);
  assert.ok(Array.isArray(qualificationList.body));
  assert.equal((qualificationList.body as Array<{ id: string }>).length, 1);

  const order = await requestJson(port, 'POST', '/tmf-api/serviceOrderingManagement/v4/serviceOrder', {
    description: 'Ativacao do CFS principal',
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'subscriber' }],
    serviceOrderItem: [
      {
        action: 'add',
        service: {
          '@type': 'CustomerFacingService',
          name: 'CFS Bitstream 700',
          serviceSpecificationId: (cfsSpec.body as { id: string }).id,
          subscriberId: 'SUB-778899',
          supportingService: [
            { id: (rfs.body as { id: string }).id, '@referredType': 'ResourceFacingService', role: 'access' },
          ],
          relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'subscriber' }],
          place: [{ id: (site.body as { id: string }).id, '@referredType': 'GeographicSite', role: 'installationAddress' }],
          serviceCharacteristic: [{ name: 'SubscriberID', value: 'SUB-778899', valueType: 'string' }],
        },
      },
    ],
  });
  assert.equal(order.statusCode, 201);
  assert.equal((order.body as { state: string }).state, 'completed');
  const orderItem = (order.body as { serviceOrderItem: Array<{ serviceResult?: { id: string; '@type': string } }> }).serviceOrderItem[0];
  assert.equal(orderItem?.serviceResult?.['@type'], 'CustomerFacingService');

  const orderList = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceOrderingManagement/v4/serviceOrder?relatedPartyId=${(party.body as { id: string }).id}`,
  );
  assert.equal(orderList.statusCode, 200);
  assert.ok(Array.isArray(orderList.body));
  assert.equal((orderList.body as Array<{ id: string }>).length, 1);

  const serviceLookup = await requestJson(
    port,
    'GET',
    '/tmf-api/serviceInventoryManagement/v4/service?characteristic.SubscriberID=SUB-778899',
  );
  assert.equal(serviceLookup.statusCode, 200);
  assert.ok(Array.isArray(serviceLookup.body));
  assert.equal((serviceLookup.body as Array<{ id: string }>).length, 1);

  const events = await requestJson(
    port,
    'GET',
    '/tmf-api/eventManagement/v4/event?source=order.ServiceQualification&eventType=ServiceQualificationCreateEvent',
  );
  assert.equal(events.statusCode, 200);
  assert.ok(Array.isArray(events.body));
  assert.ok((events.body as Array<{ eventType: string }>).some((event) => event.eventType === 'ServiceQualificationCreateEvent'));
});

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  const root = mkdtempSync(join(tmpdir(), 'nexus-order-'));
  return {
    databaseUrl: `sqlite://${join(root, 'nexus.db')}`,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};
