import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { createNexusMcpModule } from '../src/modules/mcp/index.js';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';
import { createNexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  SqliteDatabase.resetForTesting();
});

const createFixture = async () => {
  const database = createTestDatabase('nexus-mcp-unit-');
  const sqlite = SqliteDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();
  const runtime = createNexusRuntime(sqlite);
  const module = createNexusMcpModule(runtime);
  const context = runtime.createToolContext({ executionMode: 'internal-http' });

  return {
    sqlite,
    runtime,
    module,
    context,
    cleanup: () => {
      SqliteDatabase.resetForTesting();
      database.cleanup();
    },
  };
};

test('MCP registry exposes tool metadata and handles unknown tools', async () => {
  const fixture = await createFixture();

  try {
    const tools = fixture.module.registry.listTools();
    const geoTool = tools.find((tool) => tool.name === 'geo.list_sites');
    assert.ok(geoTool);
    assert.match(geoTool.description, /Geographic Sites/);
    assert.equal(typeof geoTool.handler, 'function');

    const missing = await fixture.module.registry.executeTool('missing.tool', {}, fixture.context);
    assert.equal(missing.ok, false);
    assert.equal(missing.error?.code, 'MCP_TOOL_NOT_FOUND');
  } finally {
    fixture.cleanup();
  }
});

test('MCP registry returns structured validation errors', async () => {
  const fixture = await createFixture();

  try {
    const result = await fixture.module.registry.executeTool('geo.get_site', {}, fixture.context);
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'MCP_INVALID_PAYLOAD');
    assert.deepEqual(result.error?.details, [{ path: '$.id', message: 'is required' }]);
  } finally {
    fixture.cleanup();
  }
});

test('MCP prepare/commit flow persists confirmation tokens and executes mutations', async () => {
  const fixture = await createFixture();

  try {
    const spec = fixture.runtime.geoService.createSpec({
      name: 'Central Office',
      category: 'Site',
    });

    const prepared = await fixture.module.registry.executeTool(
      'geo.create_site',
      {
        payload: {
          name: 'CO Botafogo',
          siteSpecificationId: spec.id,
        },
      },
      fixture.context,
    );

    assert.equal(prepared.ok, true);
    const confirmationToken = (prepared.data as { confirmationToken: string }).confirmationToken;
    assert.match(confirmationToken, /^[0-9a-f-]{36}$/);

    const committed = await fixture.module.registry.executeTool(
      'geo.commit_create_site',
      { confirmationToken },
      fixture.context,
    );

    assert.equal(committed.ok, true);
    assert.equal((committed.data as { name: string }).name, 'CO Botafogo');
    assert.equal(fixture.runtime.geoService.listSites().length, 1);
  } finally {
    fixture.cleanup();
  }
});

test('MCP exposes and executes resource specification creation', async () => {
  const fixture = await createFixture();

  try {
    const tools = fixture.module.registry.listTools();
    assert.ok(tools.some((tool) => tool.name === 'resource.create_resource_specification'));
    assert.ok(tools.some((tool) => tool.name === 'resource.commit_create_resource_specification'));

    const vendor = fixture.runtime.partyService.createParty({
      name: 'HUAWEI',
      partyType: 'Organization',
    });

    const prepared = await fixture.module.registry.executeTool(
      'resource.create_resource_specification',
      {
        payload: {
          name: 'F6201BV9.3.12',
          category: 'Equipment.CustomerPremises',
          resourceType: 'ONT',
          relatedParty: [
            {
              id: vendor.id,
              '@referredType': 'Organization',
              role: 'manufacturer',
              name: vendor.name,
            },
          ],
        },
      },
      fixture.context,
    );

    assert.equal(prepared.ok, true);
    const confirmationToken = (prepared.data as { confirmationToken: string }).confirmationToken;
    assert.match(confirmationToken, /^[0-9a-f-]{36}$/);

    const committed = await fixture.module.registry.executeTool(
      'resource.commit_create_resource_specification',
      { confirmationToken },
      fixture.context,
    );

    assert.equal(committed.ok, true);
    assert.equal((committed.data as { name: string }).name, 'F6201BV9.3.12');
    assert.equal((committed.data as { category: string }).category, 'Equipment.CustomerPremises');
    assert.equal((committed.data as { resourceType: string }).resourceType, 'ONT');
  } finally {
    fixture.cleanup();
  }
});

test('MCP cadastra modelo de equipamento resolvendo fabricante por nome', async () => {
  const fixture = await createFixture();

  try {
    const prepared = await fixture.module.registry.executeTool(
      'resource.create_equipment_model',
      {
        payload: {
          model: 'F6201BV9.3.12',
          manufacturerName: 'Huawei',
          equipmentType: 'ONT',
        },
      },
      fixture.context,
    );

    assert.equal(prepared.ok, true);
    const confirmationToken = (prepared.data as { confirmationToken: string }).confirmationToken;
    assert.match(confirmationToken, /^[0-9a-f-]{36}$/);
    assert.match((prepared.data as { summary: string }).summary, /F6201BV9\.3\.12/);
    assert.match((prepared.data as { summary: string }).summary, /HUAWEI/i);

    const committed = await fixture.module.registry.executeTool(
      'resource.commit_create_equipment_model',
      { confirmationToken },
      fixture.context,
    );

    assert.equal(committed.ok, true);
    assert.equal((committed.data as { name: string }).name, 'F6201BV9.3.12');
    assert.equal((committed.data as { category: string }).category, 'Equipment.CustomerPremises');
    assert.equal((committed.data as { resourceType: string }).resourceType, 'ONT');
    assert.equal((committed.data as { relatedParty?: Array<{ name?: string; role?: string }> }).relatedParty?.[0]?.role, 'manufacturer');
    assert.equal((committed.data as { relatedParty?: Array<{ name?: string }> }).relatedParty?.[0]?.name, 'HUAWEI');
    assert.equal(
      (committed.data as { resourceSpecificationCharacteristic?: Array<{ name: string; value: unknown }> })
        .resourceSpecificationCharacteristic?.find((item) => item.name === 'model')?.value,
      'F6201BV9.3.12',
    );
  } finally {
    fixture.cleanup();
  }
});

test('MCP cadastra modelos de equipamento em lote', async () => {
  const fixture = await createFixture();

  try {
    const prepared = await fixture.module.registry.executeTool(
      'resource.create_equipment_models',
      {
        payload: {
          items: [
            { model: 'G-010G-Q', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
            { model: 'G-0425G-C', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
            { model: 'G-140W-H', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
          ],
        },
      },
      fixture.context,
    );

    assert.equal(prepared.ok, true);
    const confirmationToken = (prepared.data as { confirmationToken: string }).confirmationToken;
    assert.match(confirmationToken, /^[0-9a-f-]{36}$/);
    assert.match((prepared.data as { summary: string }).summary, /3 modelos/i);

    const committed = await fixture.module.registry.executeTool(
      'resource.commit_create_equipment_models',
      { confirmationToken },
      fixture.context,
    );

    assert.equal(committed.ok, true);
    const items = (committed.data as { items: Array<{ name: string; relatedParty?: Array<{ name?: string }> }> }).items;
    assert.equal(items.length, 3);
    assert.deepEqual(
      items.map((item) => item.name),
      ['G-010G-Q', 'G-0425G-C', 'G-140W-H'],
    );
    assert.ok(items.every((item) => item.relatedParty?.[0]?.name === 'NOKIA'));
  } finally {
    fixture.cleanup();
  }
});

test('MCP remove modelo de equipamento como soft-delete com fabricante resolvido por nome', async () => {
  const fixture = await createFixture();

  try {
    const manufacturer = fixture.runtime.partyService.createParty({
      name: 'ZTE',
      partyType: 'Organization',
    });

    const created = fixture.runtime.resourceService.createResourceSpecification({
      name: 'F6201BV9.3.12',
      category: 'Equipment.CustomerPremises',
      resourceType: 'ONT',
      relatedParty: [
        {
          id: manufacturer.id,
          '@referredType': 'Organization',
          role: 'manufacturer',
          name: manufacturer.name,
        },
      ],
    });

    const prepared = await fixture.module.registry.executeTool(
      'resource.delete_equipment_model',
      {
        payload: {
          model: 'F6201BV9.3.12',
          manufacturerName: 'ZTE',
          equipmentType: 'ONT',
        },
      },
      fixture.context,
    );

    assert.equal(prepared.ok, true);
    const confirmationToken = (prepared.data as { confirmationToken: string }).confirmationToken;
    assert.match(confirmationToken, /^[0-9a-f-]{36}$/);
    assert.match((prepared.data as { summary: string }).summary, /removido do catalogo/i);

    const committed = await fixture.module.registry.executeTool(
      'resource.commit_delete_equipment_model',
      { confirmationToken },
      fixture.context,
    );

    assert.equal(committed.ok, true);
    assert.equal((committed.data as { id: string }).id, created.id);
    assert.ok((committed.data as { validFor?: { endDateTime?: string } }).validFor?.endDateTime);

    const activeList = fixture.runtime.resourceService.listResourceSpecifications({ name: 'F6201BV9.3.12' });
    assert.equal(activeList.length, 0);
    const allList = fixture.runtime.resourceService.listResourceSpecifications({ name: 'F6201BV9.3.12', includeEnded: true });
    assert.equal(allList.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test('MCP blocks commit without valid token and with expired token', async () => {
  const fixture = await createFixture();

  try {
    const missing = await fixture.module.registry.executeTool(
      'party.commit_create_party',
      { confirmationToken: 'missing-token' },
      fixture.context,
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.error?.code, 'MCP_CONFIRMATION_NOT_FOUND');

    fixture.module.confirmations.create({
      token: 'expired-token',
      domain: 'party',
      operation: 'create_party',
      payload: { name: 'ISP Alfa' },
      summary: 'expired',
      warnings: [],
      context: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T00:01:00.000Z',
    });

    const expired = await fixture.module.registry.executeTool(
      'party.commit_create_party',
      { confirmationToken: 'expired-token' },
      fixture.context,
    );
    assert.equal(expired.ok, false);
    assert.equal(expired.error?.code, 'MCP_CONFIRMATION_EXPIRED');
  } finally {
    fixture.cleanup();
  }
});

test('MCP rejects invalid CFS preparation that references supportingResource directly', async () => {
  const fixture = await createFixture();

  try {
    const cfsSpec = fixture.runtime.serviceService.createServiceSpecification({
      name: 'Bitstream GPON',
      category: 'Broadband',
      serviceType: 'CFS',
    });

    const result = await fixture.module.registry.executeTool(
      'service.create_cfs',
      {
        payload: {
          name: 'CFS invalido',
          serviceSpecificationId: cfsSpec.id,
          subscriberId: 'SUB-1',
          supportingService: [],
          supportingResource: [{ id: 'resource-1', '@referredType': 'PhysicalResource' }],
        },
      },
      fixture.context,
    );

    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'SERVICE_CFS_SUPPORTING_RESOURCE');
  } finally {
    fixture.cleanup();
  }
});
