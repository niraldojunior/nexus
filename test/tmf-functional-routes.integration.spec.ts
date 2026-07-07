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

test('TMF geographic endpoints support read and update by id', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const location = await requestJson(port, 'POST', '/tmf-api/geographicLocationManagement/v4/geographicLocation', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [-43.18, -22.9] },
    spatialRef: 'EPSG:4326',
  });
  assert.equal(location.statusCode, 201);

  const address = await requestJson(port, 'POST', '/tmf-api/geographicAddressManagement/v4/geographicAddress', {
    street: 'Rua Voluntarios da Patria',
    streetNr: '100',
    city: 'Rio de Janeiro',
    country: 'BR',
  });
  assert.equal(address.statusCode, 201);

  const spec = await requestJson(port, 'POST', '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification', {
    name: 'Central Office',
    category: 'Site',
  });
  assert.equal(spec.statusCode, 201);

  const site = await requestJson(port, 'POST', '/tmf-api/geographicSiteManagement/v4/geographicSite', {
    name: 'CO Botafogo',
    siteSpecificationId: (spec.body as { id: string }).id,
    placeId: (location.body as { id: string }).id,
    addressId: (address.body as { id: string }).id,
  });
  assert.equal(site.statusCode, 201);

  const locationRead = await requestJson(
    port,
    'GET',
    `/tmf-api/geographicLocationManagement/v4/geographicLocation/${(location.body as { id: string }).id}`,
  );
  assert.equal(locationRead.statusCode, 200);

  const locationPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/geographicLocationManagement/v4/geographicLocation/${(location.body as { id: string }).id}`,
    { accuracy: '5m' },
  );
  assert.equal(locationPatch.statusCode, 200);
  assert.equal((locationPatch.body as { accuracy: string }).accuracy, '5m');

  const addressPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/geographicAddressManagement/v4/geographicAddress/${(address.body as { id: string }).id}`,
    { postcode: '22250-040' },
  );
  assert.equal(addressPatch.statusCode, 200);
  assert.equal((addressPatch.body as { postcode: string }).postcode, '22250-040');

  const specPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification/${(spec.body as { id: string }).id}`,
    { name: 'Central Office RJ' },
  );
  assert.equal(specPatch.statusCode, 200);
  assert.equal((specPatch.body as { name: string }).name, 'Central Office RJ');

  const sitePatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/geographicSiteManagement/v4/geographicSite/${(site.body as { id: string }).id}`,
    { status: 'active' },
  );
  assert.equal(sitePatch.statusCode, 200);
  assert.equal((sitePatch.body as { status: string }).status, 'active');

  const siteRead = await requestJson(
    port,
    'GET',
    `/tmf-api/geographicSiteManagement/v4/geographicSite/${(site.body as { id: string }).id}`,
  );
  assert.equal(siteRead.statusCode, 200);
  assert.equal((siteRead.body as { name: string }).name, 'CO Botafogo');
});

test('TMF party and resource endpoints support read, update, delete and relationships', async (t) => {
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
    partyCharacteristic: [{ name: 'documentNumber', value: '12.345.678/0001-90', valueType: 'string' }],
  });
  assert.equal(party.statusCode, 201);

  const partyRole = await requestJson(port, 'POST', '/tmf-api/partyRoleManagement/v4/partyRole', {
    partyId: (party.body as { id: string }).id,
    name: 'tenant',
  });
  assert.equal(partyRole.statusCode, 201);

  const partyRead = await requestJson(port, 'GET', `/tmf-api/partyManagement/v4/party/${(party.body as { id: string }).id}`);
  assert.equal(partyRead.statusCode, 200);

  const partyPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/partyManagement/v4/party/${(party.body as { id: string }).id}`,
    { name: 'ISP Alfa Atualizado' },
  );
  assert.equal(partyPatch.statusCode, 200);
  assert.equal((partyPatch.body as { name: string }).name, 'ISP Alfa Atualizado');

  const partyDelete = await requestJson(port, 'DELETE', `/tmf-api/partyManagement/v4/party/${(party.body as { id: string }).id}`);
  assert.equal(partyDelete.statusCode, 200);
  assert.equal((partyDelete.body as { status: string }).status, 'terminated');

  const partyRoleRead = await requestJson(
    port,
    'GET',
    `/tmf-api/partyRoleManagement/v4/partyRole/${(partyRole.body as { id: string }).id}`,
  );
  assert.equal(partyRoleRead.statusCode, 200);

  const partyRolePatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/partyRoleManagement/v4/partyRole/${(partyRole.body as { id: string }).id}`,
    { name: 'subscriber' },
  );
  assert.equal(partyRolePatch.statusCode, 200);
  assert.equal((partyRolePatch.body as { name: string }).name, 'subscriber');

  const partyRoleDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/partyRoleManagement/v4/partyRole/${(partyRole.body as { id: string }).id}`,
  );
  assert.equal(partyRoleDelete.statusCode, 200);
  assert.equal((partyRoleDelete.body as { status: string }).status, 'terminated');

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
    category: 'Equipment',
    resourceType: 'PhysicalResource',
    relatedParty: [
      { id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'manufacturer' },
    ],
  });
  assert.equal(resourceSpec.statusCode, 201);

  const functionSpec = await requestJson(
    port,
    'POST',
    '/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification',
    { name: 'Default activation' },
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

  const physicalResourcePeer = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'PhysicalResource',
    name: 'OLT-BOT-02',
    resourceSpecificationId: (resourceSpec.body as { id: string }).id,
    placeId: (site.body as { id: string }).id,
    placeType: 'GeographicSite',
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'owner' }],
    manufacturer: 'Huawei',
    model: 'MA5800',
    serialNumber: 'SN-OLT-002',
  });
  assert.equal(physicalResourcePeer.statusCode, 201);

  const logicalResource = await requestJson(port, 'POST', '/tmf-api/resourceInventoryManagement/v4/resource', {
    '@type': 'LogicalResource',
    name: 'VLAN 100',
    resourceSpecificationId: (resourceSpec.body as { id: string }).id,
    supportingPhysicalResourceId: (physicalResource.body as { id: string }).id,
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'owner' }],
  });
  assert.equal(logicalResource.statusCode, 201);

  const resourceSpecRead = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${(resourceSpec.body as { id: string }).id}`,
  );
  assert.equal(resourceSpecRead.statusCode, 200);

  const resourceSpecPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${(resourceSpec.body as { id: string }).id}`,
    { name: 'OLT MA5800 Updated' },
  );
  assert.equal(resourceSpecPatch.statusCode, 200);
  assert.equal((resourceSpecPatch.body as { name: string }).name, 'OLT MA5800 Updated');

  const resourceSpecDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${(resourceSpec.body as { id: string }).id}`,
  );
  assert.equal(resourceSpecDelete.statusCode, 200);
  assert.equal((resourceSpecDelete.body as { id: string }).id, (resourceSpec.body as { id: string }).id);

  const functionSpecRead = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification/${(functionSpec.body as { id: string }).id}`,
  );
  assert.equal(functionSpecRead.statusCode, 200);

  const functionSpecPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification/${(functionSpec.body as { id: string }).id}`,
    { name: 'Default activation updated' },
  );
  assert.equal(functionSpecPatch.statusCode, 200);
  assert.equal((functionSpecPatch.body as { name: string }).name, 'Default activation updated');

  const functionSpecDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification/${(functionSpec.body as { id: string }).id}`,
  );
  assert.equal(functionSpecDelete.statusCode, 200);
  assert.equal((functionSpecDelete.body as { id: string }).id, (functionSpec.body as { id: string }).id);

  const physicalRead = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(physicalResource.body as { id: string }).id}`,
  );
  assert.equal(physicalRead.statusCode, 200);

  const physicalPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(physicalResource.body as { id: string }).id}`,
    { name: 'OLT-BOT-01-Renamed' },
  );
  assert.equal(physicalPatch.statusCode, 200);
  assert.equal((physicalPatch.body as { name: string }).name, 'OLT-BOT-01-Renamed');

  const relationshipAdd = await requestJson(
    port,
    'POST',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(physicalResource.body as { id: string }).id}/relationships`,
    {
      id: (physicalResourcePeer.body as { id: string }).id,
      relationshipType: 'containsAsChild',
    },
  );
  assert.equal(relationshipAdd.statusCode, 201);

  const relationshipList = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(physicalResource.body as { id: string }).id}/relationships`,
  );
  assert.equal(relationshipList.statusCode, 200);
  assert.equal((relationshipList.body as Array<{ id: string }>).length, 1);

  const relationshipDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(physicalResource.body as { id: string }).id}/relationships/${(physicalResourcePeer.body as { id: string }).id}`,
  );
  assert.equal(relationshipDelete.statusCode, 200);
  assert.equal(relationshipDelete.body, true);

  const logicalRead = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(logicalResource.body as { id: string }).id}`,
  );
  assert.equal(logicalRead.statusCode, 200);

  const logicalPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(logicalResource.body as { id: string }).id}`,
    { name: 'VLAN 100 Updated' },
  );
  assert.equal(logicalPatch.statusCode, 200);
  assert.equal((logicalPatch.body as { name: string }).name, 'VLAN 100 Updated');

  const physicalDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(physicalResource.body as { id: string }).id}`,
  );
  assert.equal(physicalDelete.statusCode, 200);
  assert.equal((physicalDelete.body as { status: string }).status, 'terminated');

  const logicalDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/resourceInventoryManagement/v4/resource/${(logicalResource.body as { id: string }).id}`,
  );
  assert.equal(logicalDelete.statusCode, 200);
  assert.equal((logicalDelete.body as { status: string }).status, 'terminated');
});

test('TMF service endpoints support read, update, delete and relationships', async (t) => {
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
    supportingResource: [{ id: (resource.body as { id: string }).id, '@referredType': 'PhysicalResource', role: 'access' }],
    state: 'active',
  });
  assert.equal(rfs.statusCode, 201);

  const cfs = await requestJson(port, 'POST', '/tmf-api/serviceInventoryManagement/v4/service', {
    '@type': 'CustomerFacingService',
    name: 'CFS Bitstream 700',
    serviceSpecificationId: (cfsSpec.body as { id: string }).id,
    subscriberId: 'SUB-778899',
    supportingService: [{ id: (rfs.body as { id: string }).id, '@referredType': 'ResourceFacingService', role: 'access' }],
    relatedParty: [{ id: (party.body as { id: string }).id, '@referredType': 'Organization', role: 'subscriber' }],
    place: [{ id: (site.body as { id: string }).id, '@referredType': 'GeographicSite', role: 'installationAddress' }],
    serviceCharacteristic: [{ name: 'SubscriberID', value: 'SUB-778899', valueType: 'string' }],
  });
  assert.equal(cfs.statusCode, 201);

  const cfsSpecRead = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${(cfsSpec.body as { id: string }).id}`,
  );
  assert.equal(cfsSpecRead.statusCode, 200);

  const cfsSpecPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${(cfsSpec.body as { id: string }).id}`,
    { name: 'Bitstream GPON Updated' },
  );
  assert.equal(cfsSpecPatch.statusCode, 200);
  assert.equal((cfsSpecPatch.body as { name: string }).name, 'Bitstream GPON Updated');

  const cfsSpecDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${(cfsSpec.body as { id: string }).id}`,
  );
  assert.equal(cfsSpecDelete.statusCode, 200);
  assert.equal((cfsSpecDelete.body as { id: string }).id, (cfsSpec.body as { id: string }).id);

  const categoryRead = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceCatalogManagement/v4/serviceCategory/${(category.body as { id: string }).id}`,
  );
  assert.equal(categoryRead.statusCode, 200);

  const categoryPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/serviceCatalogManagement/v4/serviceCategory/${(category.body as { id: string }).id}`,
    { name: 'Access Updated' },
  );
  assert.equal(categoryPatch.statusCode, 200);
  assert.equal((categoryPatch.body as { name: string }).name, 'Access Updated');

  const categoryDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/serviceCatalogManagement/v4/serviceCategory/${(category.body as { id: string }).id}`,
  );
  assert.equal(categoryDelete.statusCode, 200);
  assert.equal((categoryDelete.body as { id: string }).id, (category.body as { id: string }).id);

  const candidateRead = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceCatalogManagement/v4/serviceCandidate/${(candidate.body as { id: string }).id}`,
  );
  assert.equal(candidateRead.statusCode, 200);

  const candidatePatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/serviceCatalogManagement/v4/serviceCandidate/${(candidate.body as { id: string }).id}`,
    { name: 'Bitstream Candidate Updated' },
  );
  assert.equal(candidatePatch.statusCode, 200);
  assert.equal((candidatePatch.body as { name: string }).name, 'Bitstream Candidate Updated');

  const candidateDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/serviceCatalogManagement/v4/serviceCandidate/${(candidate.body as { id: string }).id}`,
  );
  assert.equal(candidateDelete.statusCode, 200);
  assert.equal((candidateDelete.body as { status: string }).status, 'terminated');

  const rfsRead = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceInventoryManagement/v4/service/${(rfs.body as { id: string }).id}`,
  );
  assert.equal(rfsRead.statusCode, 200);

  const rfsPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/serviceInventoryManagement/v4/service/${(rfs.body as { id: string }).id}`,
    { name: 'RFS GPON 1 Updated' },
  );
  assert.equal(rfsPatch.statusCode, 200);
  assert.equal((rfsPatch.body as { name: string }).name, 'RFS GPON 1 Updated');

  const cfsRead = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}`,
  );
  assert.equal(cfsRead.statusCode, 200);

  const cfsPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}`,
    { name: 'CFS Bitstream 700 Updated' },
  );
  assert.equal(cfsPatch.statusCode, 200);
  assert.equal((cfsPatch.body as { name: string }).name, 'CFS Bitstream 700 Updated');

  const relationshipAdd = await requestJson(
    port,
    'POST',
    `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}/relationships`,
    {
      id: (rfs.body as { id: string }).id,
      relationshipType: 'dependsOn',
    },
  );
  assert.equal(relationshipAdd.statusCode, 201);

  const relationshipList = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}/relationships`,
  );
  assert.equal(relationshipList.statusCode, 200);
  assert.equal((relationshipList.body as Array<{ id: string }>).length, 1);

  const relationshipDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}/relationships/${(rfs.body as { id: string }).id}/dependsOn`,
  );
  assert.equal(relationshipDelete.statusCode, 200);
  assert.equal(relationshipDelete.body, true);

  const cfsDelete = await requestJson(port, 'DELETE', `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}`);
  assert.equal(cfsDelete.statusCode, 200);
  assert.equal((cfsDelete.body as { state: string }).state, 'terminated');

  const rfsDelete = await requestJson(port, 'DELETE', `/tmf-api/serviceInventoryManagement/v4/service/${(rfs.body as { id: string }).id}`);
  assert.equal(rfsDelete.statusCode, 200);
  assert.equal((rfsDelete.body as { state: string }).state, 'terminated');
});

test('TMF order endpoints support read, update and delete', async (t) => {
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

  const qualificationRead = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceQualificationManagement/v4/serviceQualification/${(qualification.body as { id: string }).id}`,
  );
  assert.equal(qualificationRead.statusCode, 200);

  const qualificationPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/serviceQualificationManagement/v4/serviceQualification/${(qualification.body as { id: string }).id}`,
    { serviceCharacteristic: [{ name: 'qualificationMode', value: 'manual', valueType: 'string' }] },
  );
  assert.equal(qualificationPatch.statusCode, 200);

  const qualificationDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/serviceQualificationManagement/v4/serviceQualification/${(qualification.body as { id: string }).id}`,
  );
  assert.equal(qualificationDelete.statusCode, 200);
  assert.equal((qualificationDelete.body as { state: string }).state, 'terminated');

  const serviceOrder = await requestJson(port, 'POST', '/tmf-api/serviceOrderingManagement/v4/serviceOrder', {
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
  assert.equal(serviceOrder.statusCode, 201);
  assert.equal((serviceOrder.body as { state: string }).state, 'completed');

  const serviceOrderRead = await requestJson(
    port,
    'GET',
    `/tmf-api/serviceOrderingManagement/v4/serviceOrder/${(serviceOrder.body as { id: string }).id}`,
  );
  assert.equal(serviceOrderRead.statusCode, 200);

  const serviceOrderPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/serviceOrderingManagement/v4/serviceOrder/${(serviceOrder.body as { id: string }).id}`,
    { description: 'Ativacao do CFS principal atualizada' },
  );
  assert.equal(serviceOrderPatch.statusCode, 200);
  assert.equal((serviceOrderPatch.body as { description: string }).description, 'Ativacao do CFS principal atualizada');

  const serviceOrderDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/serviceOrderingManagement/v4/serviceOrder/${(serviceOrder.body as { id: string }).id}`,
  );
  assert.equal(serviceOrderDelete.statusCode, 200);
  assert.equal((serviceOrderDelete.body as { state: string }).state, 'cancelled');

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

  const resourceOrderRead = await requestJson(
    port,
    'GET',
    `/tmf-api/resourceOrderingManagement/v4/resourceOrder/${(resourceOrder.body as { id: string }).id}`,
  );
  assert.equal(resourceOrderRead.statusCode, 200);

  const resourceOrderPatch = await requestJson(
    port,
    'PATCH',
    `/tmf-api/resourceOrderingManagement/v4/resourceOrder/${(resourceOrder.body as { id: string }).id}`,
    { description: 'Provisionamento de recurso fisico atualizado' },
  );
  assert.equal(resourceOrderPatch.statusCode, 200);
  assert.equal((resourceOrderPatch.body as { description: string }).description, 'Provisionamento de recurso fisico atualizado');

  const resourceOrderDelete = await requestJson(
    port,
    'DELETE',
    `/tmf-api/resourceOrderingManagement/v4/resourceOrder/${(resourceOrder.body as { id: string }).id}`,
  );
  assert.equal(resourceOrderDelete.statusCode, 200);
  assert.equal((resourceOrderDelete.body as { state: string }).state, 'cancelled');
});

test('Research sessions default to Nexus Copilot context', async (t) => {
  const database = createTestDatabase();
  const server = createApp({ config: createConfig(0, database.databaseUrl), logger: createLogger() });
  const port = await server.start();
  t.after(async () => {
    await server.stop();
    database.cleanup();
  });

  const session = await requestJson(port, 'POST', '/v1/research/sessions', {
    title: 'Nova conversa',
  });

  assert.equal(session.statusCode, 201);
  assert.match((session.body as { context: string }).context, /Nexus Copilot/);
  assert.match((session.body as { context: string }).context, /Telecom/);
});

const createTestDatabase = (): { databaseUrl: string; cleanup: () => void } => {
  const root = mkdtempSync(join(tmpdir(), 'nexus-tmf-'));
  return {
    databaseUrl: `sqlite://${join(root, 'nexus.db')}`,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};
