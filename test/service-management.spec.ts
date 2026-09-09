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

const oracleConfigured = isOracleTestConfigured();

test.skipIf(!oracleConfigured)(
  'TMF633 and TMF638 service endpoints create and constrain services',
  async () => {
    const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
    const port = await server.start();
    try {
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

      const resourceSpec = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
        {
          name: 'ONT',
          resourceTypeId: 'rt-ont',
        },
      );
      assert.equal(resourceSpec.statusCode, 201);

      const resource = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceInventoryManagement/v4/resource',
        {
          '@type': 'PhysicalResource',
          name: 'ONT-0001',
          resourceSpecificationId: (resourceSpec.body as { id: string }).id,
          placeId: (site.body as { id: string }).id,
          placeType: 'GeographicSite',
          serialNumber: 'ONT-0001',
        },
      );
      assert.equal(resource.statusCode, 201);

      const cfsSpec = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceCatalogManagement/v4/serviceSpecification',
        {
          name: 'Bitstream GPON',
          category: 'Broadband',
          serviceType: 'CFS',
        },
      );
      assert.equal(cfsSpec.statusCode, 201);

      const rfsSpec = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceCatalogManagement/v4/serviceSpecification',
        {
          name: 'GPON Access',
          category: 'Broadband',
          serviceType: 'RFS',
        },
      );
      assert.equal(rfsSpec.statusCode, 201);

      const category = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceCatalogManagement/v4/serviceCategory',
        {
          name: 'Access',
        },
      );
      assert.equal(category.statusCode, 201);

      const candidate = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceCatalogManagement/v4/serviceCandidate',
        {
          name: 'Bitstream Candidate',
          serviceSpecificationId: (cfsSpec.body as { id: string }).id,
          serviceCategoryId: (category.body as { id: string }).id,
        },
      );
      assert.equal(candidate.statusCode, 201);

      const rfs = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceInventoryManagement/v4/service',
        {
          '@type': 'ResourceFacingService',
          name: 'RFS GPON 1',
          serviceSpecificationId: (rfsSpec.body as { id: string }).id,
          category: 'Broadband',
          supportingResource: [
            {
              id: (resource.body as { id: string }).id,
              '@referredType': 'PhysicalResource',
              role: 'access',
            },
          ],
          state: 'active',
        },
      );
      assert.equal(rfs.statusCode, 201);
      assert.equal((rfs.body as { '@type': string })['@type'], 'ResourceFacingService');

      const cfs = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceInventoryManagement/v4/service',
        {
          '@type': 'CustomerFacingService',
          name: 'CFS Bitstream 700',
          serviceSpecificationId: (cfsSpec.body as { id: string }).id,
          category: 'Broadband',
          subscriberId: 'SUB-778899',
          supportingService: [
            {
              id: (rfs.body as { id: string }).id,
              '@referredType': 'ResourceFacingService',
              role: 'access',
            },
          ],
          relatedParty: [
            {
              id: (party.body as { id: string }).id,
              '@referredType': 'Organization',
              role: 'subscriber',
            },
          ],
          place: [
            {
              id: (site.body as { id: string }).id,
              '@referredType': 'GeographicSite',
              role: 'installationAddress',
            },
          ],
          serviceCharacteristic: [
            { name: 'SubscriberID', value: 'SUB-778899', valueType: 'string' },
          ],
        },
      );
      assert.equal(cfs.statusCode, 201);
      assert.equal((cfs.body as { '@type': string })['@type'], 'CustomerFacingService');

      const filtered = await requestJson(
        port,
        'GET',
        '/tmf-api/serviceInventoryManagement/v4/service?characteristic.SubscriberID=SUB-778899',
      );
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
        workspaceBody.customerFacingServices.some(
          (service) => service.id === (cfs.body as { id: string }).id,
        ),
      );
      assert.ok(
        workspaceBody.resourceFacingServices.some(
          (service) => service.id === (rfs.body as { id: string }).id,
        ),
      );

      const invalidCfs = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceInventoryManagement/v4/service',
        {
          '@type': 'CustomerFacingService',
          name: 'Invalid CFS',
          serviceSpecificationId: (cfsSpec.body as { id: string }).id,
          subscriberId: 'SUB-000000',
          supportingResource: [
            { id: (resource.body as { id: string }).id, '@referredType': 'PhysicalResource' },
          ],
        },
      );
      assert.equal(invalidCfs.statusCode, 422);

      const invalidRfs = await requestJson(
        port,
        'POST',
        '/tmf-api/serviceInventoryManagement/v4/service',
        {
          '@type': 'ResourceFacingService',
          name: 'Invalid RFS',
          serviceSpecificationId: (rfsSpec.body as { id: string }).id,
          subscriberId: 'SUB-111111',
          supportingResource: [
            { id: (resource.body as { id: string }).id, '@referredType': 'PhysicalResource' },
          ],
        },
      );
      assert.equal(invalidRfs.statusCode, 422);

      const terminated = await requestJson(
        port,
        'DELETE',
        `/tmf-api/serviceInventoryManagement/v4/service/${(cfs.body as { id: string }).id}`,
      );
      assert.equal(terminated.statusCode, 200);
      assert.equal((terminated.body as { state: string }).state, 'terminated');

      const events = await requestJson(
        port,
        'GET',
        '/tmf-api/eventManagement/v4/event?source=service.CustomerFacingService&eventType=ServiceCreateEvent',
      );
      assert.equal(events.statusCode, 200);
      assert.ok(
        (events.body as Array<{ eventType: string }>).some(
          (event) => event.eventType === 'ServiceCreateEvent',
        ),
      );
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);
