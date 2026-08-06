import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { PostgresServiceRepository } from '../src/modules/service/postgres-repository.js';
import { ServiceService } from '../src/modules/service/service.js';
import type { CreateCustomerFacingServiceInput, Service } from '../src/modules/service/domain.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  PostgresDatabase.resetForTesting();
  vi.restoreAllMocks();
});

const setupService = async () => {
  const database = createTestDatabase('nexus-service-unit-');
  const sqlite = PostgresDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();
  const repository = new PostgresServiceRepository(sqlite);
  const appendEvent = vi.fn(() => undefined);
  const eventService = { appendEvent };
  const party = {
    id: 'party-1',
    '@referredType': 'Organization',
    href: '/party/party-1',
    name: 'ISP Alfa',
  };
  const site = {
    id: 'site-1',
    '@referredType': 'GeographicSite',
    href: '/site/site-1',
    name: 'CO Botafogo',
  };
  const resource = {
    id: 'resource-1',
    '@referredType': 'PhysicalResource',
    href: '/resource/resource-1',
    name: 'ONT-01',
  };
  const serviceMap = new Map<string, Service>();
  const service = new ServiceService(repository, eventService as never, {
    lookupParty: (id) => (id === party.id ? party : undefined),
    lookupPlace: (id) => (id === site.id ? site : undefined),
    lookupResource: (id) => (id === resource.id ? resource : undefined),
    lookupService: (id) => serviceMap.get(id),
  });

  return {
    database,
    repository,
    service,
    appendEvent,
    party,
    site,
    resource,
    serviceMap,
  };
};

test('ServiceService creates and queries service catalog and inventory records', async () => {
  const { database, service, appendEvent, party, site, resource, serviceMap } =
    await setupService();

  try {
    await assert.rejects(
      () =>
        service.createServiceSpecification({
          name: ' ',
          category: 'Broadband',
          serviceType: 'CFS',
        }),
      /name is required/,
    );
    await assert.rejects(
      () =>
        service.createServiceSpecification({
          name: 'Bitstream',
          category: 'Broadband',
          serviceType: 'CFS',
          relatedParty: [{ id: 'missing', '@referredType': 'Organization' }],
        }),
      /related party not found/,
    );

    const cfsSpec = await service.createServiceSpecification({
      name: 'Bitstream GPON',
      category: 'Broadband',
      serviceType: 'CFS',
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
    });
    const rfsSpec = await service.createServiceSpecification({
      name: 'GPON Access',
      category: 'Broadband',
      serviceType: 'RFS',
    });
    const category = await service.createServiceCategory({ name: 'Access', description: 'Acesso' });
    const childCategory = await service.createServiceCategory({
      name: 'FTTH',
      parentCategoryId: category.id,
    });
    const candidate = await service.createServiceCandidate({
      name: 'Candidate',
      serviceSpecificationId: cfsSpec.id,
      serviceCategoryId: category.id,
      description: 'desc',
    });

    assert.equal(
      (appendEvent.mock.calls as unknown as Array<[{ eventType?: string }]>)[0]?.[0]?.eventType,
      'ServiceSpecificationCreateEvent',
    );
    assert.equal(category.name, 'Access');
    assert.equal(childCategory.parentServiceCategory?.id, category.id);
    assert.equal(candidate.serviceCategory?.id, category.id);
    assert.equal(
      (await service.listServiceSpecifications({ category: 'Broadband', serviceType: 'CFS' }))
        .length,
      1,
    );
    assert.equal(
      (await service.listServiceCategories({ parentCategoryId: category.id })).length,
      1,
    );
    assert.equal(
      (
        await service.listServiceCandidates({
          serviceSpecificationId: cfsSpec.id,
          serviceCategoryId: category.id,
        })
      ).length,
      1,
    );

    const rfs = await service.createService({
      '@type': 'ResourceFacingService',
      name: 'RFS GPON 1',
      serviceSpecificationId: rfsSpec.id,
      supportingResource: [
        { id: resource.id, '@referredType': 'PhysicalResource', role: 'access' },
      ],
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'operations' }],
      place: [{ id: site.id, '@referredType': 'GeographicSite', role: 'installationAddress' }],
      serviceCharacteristic: [{ name: 'AccessType', value: 'GPON', valueType: 'string' }],
    });
    serviceMap.set(rfs.id, rfs);
    assert.equal(rfs['@type'], 'ResourceFacingService');
    assert.equal(rfs.supportingResource[0]?.id, resource.id);

    const cfs = await service.createService({
      '@type': 'CustomerFacingService',
      name: 'CFS GPON 1',
      serviceSpecificationId: cfsSpec.id,
      subscriberId: 'SUB-778899',
      supportingService: [{ id: rfs.id, '@referredType': 'ResourceFacingService', role: 'access' }],
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'subscriber' }],
      place: [{ id: site.id, '@referredType': 'GeographicSite', role: 'installationAddress' }],
      serviceCharacteristic: [{ name: 'SubscriberID', value: 'SUB-778899', valueType: 'string' }],
    });
    serviceMap.set(cfs.id, cfs);
    assert.equal(cfs['@type'], 'CustomerFacingService');
    assert.equal(cfs.supportingService[0]?.id, rfs.id);
    assert.equal(
      (
        await service.listServices({
          type: 'CustomerFacingService',
          subscriberId: 'SUB-778899',
          placeId: site.id,
        })
      ).length,
      1,
    );
    assert.equal(
      (
        await service.listServices({
          type: 'ResourceFacingService',
          supportingResourceId: resource.id,
        })
      ).length,
      1,
    );
    assert.equal(
      (
        await service.listServices({
          characteristicName: 'SubscriberID',
          characteristicValue: 'SUB-778899',
        })
      ).length,
      1,
    );

    const updatedCfs = await service.updateService(cfs.id, {
      name: ' CFS GPON 1A ',
      state: 'inactive',
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'subscriber' }],
    });
    assert.equal(updatedCfs.name, 'CFS GPON 1A');
    assert.equal(updatedCfs.state, 'inactive');

    const updatedRfs = await service.updateService(rfs.id, {
      state: 'active',
      serviceCharacteristic: [{ name: 'AccessType', value: 'GPON', valueType: 'string' }],
    });
    assert.equal(updatedRfs['@type'], 'ResourceFacingService');
    assert.equal(updatedRfs.state, 'active');

    const terminatedCfs = await service.deleteService(cfs.id);
    const terminatedRfs = await service.deleteService(rfs.id);
    assert.equal(terminatedCfs.state, 'terminated');
    assert.equal(terminatedRfs.state, 'terminated');

    const rel = await service.addServiceRelationship(cfs.id, {
      id: rfs.id,
      relationshipType: 'dependsOn',
      '@referredType': 'Service',
    });
    assert.equal(rel.relationshipType, 'dependsOn');
    assert.equal((await service.listServiceRelationships(cfs.id)).length, 1);
    assert.equal(await service.removeServiceRelationship(cfs.id, rfs.id, 'dependsOn'), true);
    assert.equal(await service.removeServiceRelationship(cfs.id, rfs.id, 'dependsOn'), false);

    assert.equal((await service.getService(cfs.id))?.id, cfs.id);
    assert.equal((await service.getService(rfs.id))?.id, rfs.id);
    assert.equal((await service.listServiceCandidates({ status: 'active' })).length, 1);
    assert.equal((await service.listServiceSpecifications({ serviceType: 'CFS' })).length, 1);
    assert.ok(
      (appendEvent.mock.calls as unknown as Array<[{ eventType?: string }]>).some(
        (call) => call[0]?.eventType === 'ServiceCreateEvent',
      ),
    );
  } finally {
    PostgresDatabase.resetForTesting();
    database.cleanup();
  }
});

test('ServiceService rejects invalid service permutations and missing references', async () => {
  const { database, service } = await setupService();

  try {
    const cfsSpec = await service.createServiceSpecification({
      name: 'Bitstream',
      category: 'Broadband',
      serviceType: 'CFS',
    });
    const rfsSpec = await service.createServiceSpecification({
      name: 'Access',
      category: 'Broadband',
      serviceType: 'RFS',
    });

    await assert.rejects(
      async () =>
        await service.createCustomerFacingService({
          '@type': 'CustomerFacingService',
          name: 'Invalid',
          serviceSpecificationId: cfsSpec.id,
          subscriberId: 'SUB-1',
          supportingResource: [{ id: 'resource-1', '@referredType': 'PhysicalResource' }],
        } as CreateCustomerFacingServiceInput),
      /CFS cannot reference supportingResource directly/,
    );
    await assert.rejects(
      async () =>
        await service.createService({
          '@type': 'CustomerFacingService',
          name: 'Invalid',
          serviceSpecificationId: cfsSpec.id,
          subscriberId: 'SUB-1',
        }),
      /CFS requires supportingService/,
    );
    await assert.rejects(
      async () =>
        await service.createService({
          '@type': 'CustomerFacingService',
          name: 'Invalid',
          serviceSpecificationId: rfsSpec.id,
          subscriberId: 'SUB-1',
          supportingService: [],
        }),
      /serviceSpecification type mismatch/,
    );
    await assert.rejects(
      async () =>
        await service.createService({
          '@type': 'ResourceFacingService',
          name: 'Invalid RFS',
          serviceSpecificationId: rfsSpec.id,
          supportingResource: [],
        }),
      /RFS requires supportingResource/,
    );
    await assert.rejects(
      async () =>
        await service.createService({
          '@type': 'ResourceFacingService',
          name: 'Invalid RFS',
          serviceSpecificationId: rfsSpec.id,
          supportingResource: [{ id: 'missing', '@referredType': 'PhysicalResource' }],
        }),
      /supporting resource not found/,
    );
    await assert.rejects(
      () => service.updateService('missing', { state: 'active' }),
      /service not found/,
    );
    await assert.rejects(() => service.deleteService('missing'), /service not found/);
    await assert.rejects(
      () =>
        service.addServiceRelationship('missing', {
          id: 'x',
          relationshipType: 'dependsOn',
          '@referredType': 'Service',
        }),
      /service not found/,
    );
  } finally {
    PostgresDatabase.resetForTesting();
    database.cleanup();
  }
});
