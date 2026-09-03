import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { createNexusMcpModule } from '../src/modules/mcp/index.js';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { createNexusRuntime } from '../src/shared/runtime/nexus-runtime.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  PostgresDatabase.resetForTesting();
});

const createFixture = async () => {
  const database = createTestDatabase('nexus-mcp-geo-');
  const db = PostgresDatabase.getInstance(database.databaseUrl);
  await db.initialize();
  const runtime = await createNexusRuntime(db);
  const module = createNexusMcpModule(runtime);
  const context = runtime.createToolContext({ executionMode: 'internal-chat' });
  return { database, db, runtime, module, context };
};

const createPoint = async (runtime: Awaited<ReturnType<typeof createNexusRuntime>>, lng: number) =>
  await runtime.geoService.createLocation({
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: [lng, -22.9] },
  });

test('geo.list_addresses normaliza logradouro, numero, acento e mascara do CEP no banco', async () => {
  const fixture = await createFixture();
  try {
    const location = await createPoint(fixture.runtime, -43.1);
    const address = await fixture.runtime.geoService.createAddress({
      street: 'Rua Paulo Cesar',
      streetNr: '155',
      city: 'Niterói',
      stateOrProvince: 'RJ',
      postcode: '24220401',
      country: 'BR',
      geographicLocationId: location.id,
      characteristic: [{ name: 'largePayload', value: 'nao deve ser projetado' }],
    });

    const result = await fixture.module.registry.executeTool(
      'geo.list_addresses',
      {
        street: 'R. Dr. Paulo César',
        streetNr: '155',
        city: 'Niteroi',
        postcode: '24220-401',
        limit: 10,
      },
      fixture.context,
    );

    assert.equal(result.ok, true);
    const items = (result.data as { items: Array<{ id: string; characteristic: unknown[] }> })
      .items;
    assert.deepEqual(
      items.map((item) => item.id),
      [address.id],
    );
    assert.deepEqual(items[0]?.characteristic, []);
  } finally {
    fixture.database.cleanup();
  }
});

test('MCP expoe consulta de specifications e criacao confirmavel de Address e Site por codigo', async () => {
  const fixture = await createFixture();
  try {
    const tools = fixture.module.registry.listTools().map((tool) => tool.name);
    assert.ok(tools.includes('geo.list_site_specifications'));
    assert.ok(tools.includes('geo.create_address'));
    assert.ok(tools.includes('geo.commit_create_address'));

    const specs = await fixture.module.registry.executeTool(
      'geo.list_site_specifications',
      { code: 'CONDOMINIUM', lifecycleStatus: 'Active' },
      fixture.context,
    );
    assert.equal((specs.data as { count: number }).count, 1);

    const preparedAddress = await fixture.module.registry.executeTool(
      'geo.create_address',
      {
        payload: {
          street: 'Rua Nova',
          streetNr: '10',
          city: 'Niterói',
          postcode: '24000000',
          country: 'BR',
        },
      },
      fixture.context,
    );
    assert.equal(preparedAddress.ok, true);
    const addressToken = (preparedAddress.data as { confirmationToken: string }).confirmationToken;
    const committedAddress = await fixture.module.registry.executeTool(
      'geo.commit_create_address',
      { confirmationToken: addressToken },
      fixture.context,
    );
    assert.equal(committedAddress.ok, true);

    const preparedSite = await fixture.module.registry.executeTool(
      'geo.create_site',
      {
        payload: {
          name: 'Condominio Rua Nova 10',
          siteSpecificationCode: 'CONDOMINIUM',
          addressId: (committedAddress.data as { id: string }).id,
        },
      },
      fixture.context,
    );
    assert.equal(preparedSite.ok, true);
    const storedPayload = (preparedSite.data as { payload: { siteSpecificationId?: string } })
      .payload;
    assert.match(storedPayload.siteSpecificationId ?? '', /^[0-9a-f-]{36}$/);
  } finally {
    fixture.database.cleanup();
  }
});

test('geo.create_condominium cria hierarquia e vincula CDOIs existentes em uma confirmacao', async () => {
  const fixture = await createFixture();
  try {
    const seeded = await seedCondominiumDependencies(fixture.runtime);
    const { condominiumName: _omittedName, ...workflowPayload } = condominiumPayload();
    workflowPayload.address.country = 'Brasil';
    const prepared = await fixture.module.registry.executeTool(
      'geo.create_condominium',
      { payload: workflowPayload },
      fixture.context,
    );
    assert.equal(prepared.ok, true);
    const preparedData = prepared.data as {
      confirmationToken: string;
      payload: { blocks: Array<{ addressId: string; resourceId: string }> };
    };
    assert.equal(preparedData.payload.blocks.length, 2);
    assert.deepEqual(
      new Set(preparedData.payload.blocks.map((block) => block.addressId)),
      new Set([seeded.address1.id, seeded.address2.id]),
    );

    const committed = await fixture.module.registry.executeTool(
      'geo.commit_create_condominium',
      { confirmationToken: preparedData.confirmationToken },
      fixture.context,
    );
    assert.equal(committed.ok, true);
    const result = committed.data as {
      condominium: { id: string; name: string };
      blocks: Array<{
        site: { id: string; parentSite?: { id: string }; address?: { id: string } };
        cdoi: { id: string; place?: { id: string; '@referredType': string } };
      }>;
    };
    assert.equal(result.condominium.name, 'Condominio R. Dr. Paulo César, 155');
    assert.equal(result.blocks.length, 2);
    for (const block of result.blocks) {
      assert.equal(block.site.parentSite?.id, result.condominium.id);
      assert.equal(block.cdoi.place?.id, block.site.id);
      assert.equal(block.cdoi.place?.['@referredType'], 'GeographicSite');
    }
  } finally {
    fixture.database.cleanup();
  }
});

test('commit do condominio reverte todas as entidades quando um bloco falha', async () => {
  const fixture = await createFixture();
  try {
    const seeded = await seedCondominiumDependencies(fixture.runtime);
    const payload = condominiumPayload();
    payload.blocks[1]!.name = payload.blocks[0]!.name;
    const prepared = await fixture.module.registry.executeTool(
      'geo.create_condominium',
      { payload },
      fixture.context,
    );
    const confirmationToken = (prepared.data as { confirmationToken: string }).confirmationToken;
    const committed = await fixture.module.registry.executeTool(
      'geo.commit_create_condominium',
      { confirmationToken },
      fixture.context,
    );

    assert.equal(committed.ok, false);
    assert.equal(committed.error?.code, 'GEO_SITE_NAME_DUPLICATE');
    assert.equal((await fixture.runtime.geoService.listSites()).length, 0);
    assert.equal(
      (await fixture.runtime.resourceService.getResource(seeded.cdoi1.id))?.place?.id,
      seeded.location1.id,
    );
    assert.equal(
      (await fixture.runtime.resourceService.getResource(seeded.cdoi2.id))?.place?.id,
      seeded.location2.id,
    );
  } finally {
    fixture.database.cleanup();
  }
});

const condominiumPayload = () => ({
  condominiumName: 'Condominio Paulo Cesar 155' as string | undefined,
  status: 'active' as const,
  address: {
    street: 'R. Dr. Paulo César',
    streetNr: '155',
    city: 'Niteroi',
    stateOrProvince: 'RJ',
    postcode: '24220-401',
    country: 'BR',
  },
  blocks: [
    { name: 'Bloco 1', cdoiName: 'CDOI-3917PS (ICI)' },
    { name: 'Bloco 2', cdoiName: 'CDOI-3917.3 (ICI)' },
  ],
});

const seedCondominiumDependencies = async (
  runtime: Awaited<ReturnType<typeof createNexusRuntime>>,
) => {
  const location1 = await createPoint(runtime, -43.1);
  const location2 = await createPoint(runtime, -43.1001);
  const address1 = await runtime.geoService.createAddress({
    street: 'Rua Paulo Cesar',
    streetNr: '155',
    city: 'Niterói',
    stateOrProvince: 'RJ',
    postcode: '24220401',
    country: 'BR',
    geographicLocationId: location1.id,
  });
  const address2 = await runtime.geoService.createAddress({
    street: 'Rua Paulo Cesar',
    streetNr: '155',
    city: 'Niterói',
    stateOrProvince: 'RJ',
    postcode: '24220401',
    country: 'BR',
    geographicLocationId: location2.id,
  });
  const specification = await runtime.resourceService.createResourceSpecification({
    name: 'CDOI',
    resourceTypeId: 'rt-cto',
  });
  const cdoi1 = await runtime.resourceService.createPhysicalResource({
    name: 'CDOI-3917PS (ICI)',
    resourceSpecificationId: specification.id,
    placeId: location1.id,
  });
  const cdoi2 = await runtime.resourceService.createPhysicalResource({
    name: 'CDOI-3917.3 (ICI)',
    resourceSpecificationId: specification.id,
    placeId: location2.id,
  });
  return { location1, location2, address1, address2, cdoi1, cdoi2 };
};
