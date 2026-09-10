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
  'TMF634, TMF639 and TMF664 resource endpoints create and activate resources',
  async () => {
    const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
    const port = await server.start();
    try {
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

      const manufacturerRole = await requestJson(
        port,
        'POST',
        '/tmf-api/partyRoleManagement/v4/partyRole',
        {
          partyId: (party.body as { id: string }).id,
          name: 'manufacturer',
        },
      );
      assert.equal(manufacturerRole.statusCode, 201);

      const resourceSpec = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
        {
          name: 'OLT MA5800',
          resourceTypeId: 'rt-olt',
          relatedParty: [
            {
              id: (party.body as { id: string }).id,
              '@referredType': 'Organization',
              role: 'manufacturer',
            },
          ],
        },
      );
      assert.equal(resourceSpec.statusCode, 201);

      const types = await requestJson(
        port,
        'GET',
        '/tmf-api/resourceCatalogManagement/v4/resourceType',
      );
      assert.equal(types.statusCode, 200);
      assert.ok(Array.isArray(types.body));
      assert.ok((types.body as Array<{ code: string }>).some((type) => type.code === 'OLT'));

      const invalidResourceSpec = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
        {
          name: 'OLT sem tipo',
        },
      );
      assert.equal(invalidResourceSpec.statusCode, 400);
      assert.equal(
        (invalidResourceSpec.body as { error?: string }).error,
        'RESOURCE_REQUIRED_FIELD',
      );
      assert.equal(
        (invalidResourceSpec.body as { message?: string }).message,
        'body.resourceTypeId is required',
      );

      const workspace = await requestJson(
        port,
        'GET',
        '/v1/resource/workspace?tab=PhysicalResource&limit=20&offset=0',
      );
      assert.equal(workspace.statusCode, 200);
      const workspaceBody = workspace.body as {
        items: Array<{ id: string }>;
        totalCount: number;
        resourceSpecificationOptions: Array<{ id: string }>;
        resourceTypes: Array<{ code: string }>;
        manufacturerOptions: Array<{ id: string }>;
      };
      assert.ok(Array.isArray(workspaceBody.items));
      assert.equal(typeof workspaceBody.totalCount, 'number');
      assert.ok(Array.isArray(workspaceBody.resourceSpecificationOptions));
      assert.ok(Array.isArray(workspaceBody.resourceTypes));
      assert.ok(Array.isArray(workspaceBody.manufacturerOptions));

      const deletedSpec = await requestJson(
        port,
        'DELETE',
        `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${(resourceSpec.body as { id: string }).id}`,
      );
      assert.equal(deletedSpec.statusCode, 200);
      assert.ok(
        (deletedSpec.body as { validFor?: { endDateTime?: string } }).validFor?.endDateTime,
      );

      const fetchedDeletedSpec = await requestJson(
        port,
        'GET',
        `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${(resourceSpec.body as { id: string }).id}`,
      );
      assert.equal(fetchedDeletedSpec.statusCode, 200);
      assert.ok(
        (fetchedDeletedSpec.body as { validFor?: { endDateTime?: string } }).validFor
          ?.endDateTime,
      );

      const functionSpec = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification',
        {
          name: 'Default activation',
        },
      );
      assert.equal(functionSpec.statusCode, 201);

      const physicalResource = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceInventoryManagement/v4/resource',
        {
          '@type': 'PhysicalResource',
          name: 'OLT-BOT-01',
          resourceSpecificationId: (resourceSpec.body as { id: string }).id,
          placeId: (site.body as { id: string }).id,
          placeType: 'GeographicSite',
          relatedParty: [
            {
              id: (party.body as { id: string }).id,
              '@referredType': 'Organization',
              role: 'owner',
            },
          ],
          manufacturer: 'Huawei',
          model: 'MA5800',
          serialNumber: 'SN-OLT-001',
        },
      );
      assert.equal(physicalResource.statusCode, 201);
      assert.equal((physicalResource.body as { '@type': string })['@type'], 'PhysicalResource');

      const logicalResource = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceInventoryManagement/v4/resource',
        {
          '@type': 'LogicalResource',
          name: 'VLAN 100',
          resourceSpecificationId: (resourceSpec.body as { id: string }).id,
          supportingPhysicalResourceId: (physicalResource.body as { id: string }).id,
          relatedParty: [
            {
              id: (party.body as { id: string }).id,
              '@referredType': 'Organization',
              role: 'owner',
            },
          ],
        },
      );
      assert.equal(logicalResource.statusCode, 201);
      assert.equal((logicalResource.body as { '@type': string })['@type'], 'LogicalResource');

      const activated = await requestJson(
        port,
        'POST',
        '/tmf-api/resourceFunctionActivation/v4/resourceFunction',
        {
          resourceId: (physicalResource.body as { id: string }).id,
          action: 'activate',
        },
      );
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
      assert.ok(
        (events.body as Array<{ eventType: string }>).some(
          (event) => event.eventType === 'ResourceCreateEvent',
        ),
      );
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);

test.skipIf(!oracleConfigured)(
  'POST /v1/resource/specifications/bulk-import creates valid rows and reports failures per line',
  async () => {
    const server = createApp({ config: createTestConfig(0), logger: createTestLogger() });
    const port = await server.start();
    try {
      const invalid = await requestJson(port, 'POST', '/v1/resource/specifications/bulk-import', {
        items: [
          {
            line: 2,
            input: { name: 'OLT Boa', resourceTypeId: 'rt-olt' },
          },
          {
            line: 3,
            input: { name: 'Tipo ausente', resourceTypeId: 'missing' },
          },
        ],
      });
      assert.equal(invalid.statusCode, 200);
      const invalidBody = invalid.body as {
        total: number;
        created: number;
        failed: number;
        results: Array<{ line: number; status: string; id?: string; code?: string; name: string }>;
      };
      assert.equal(invalidBody.total, 2);
      assert.equal(invalidBody.created, 1);
      assert.equal(invalidBody.failed, 1);

      const createdResult = invalidBody.results.find((result) => result.line === 2);
      assert.equal(createdResult?.status, 'created');
      assert.ok(createdResult?.id);

      const failedResult = invalidBody.results.find((result) => result.line === 3);
      assert.equal(failedResult?.status, 'error');
      assert.equal(failedResult?.code, 'RESOURCE_TYPE_NOT_FOUND');

      const persisted = await requestJson(
        port,
        'GET',
        `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${createdResult?.id}`,
      );
      assert.equal(persisted.statusCode, 200);
      assert.equal((persisted.body as { name: string }).name, 'OLT Boa');

      const emptyPayload = await requestJson(
        port,
        'POST',
        '/v1/resource/specifications/bulk-import',
        {
          items: [],
        },
      );
      assert.equal(emptyPayload.statusCode, 400);

      const notArray = await requestJson(port, 'POST', '/v1/resource/specifications/bulk-import', {
        items: 'not-an-array',
      });
      assert.equal(notArray.statusCode, 400);
    } finally {
      await server.stop();
      const client = await getOracleTestClient();
      await cleanupOracleTables(client);
    }
  },
);
