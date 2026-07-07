import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';
import { SqliteServiceRepository } from '../src/modules/service/sqlite-repository.js';
import { ServiceService } from '../src/modules/service/service.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  SqliteDatabase.resetForTesting();
  vi.restoreAllMocks();
});

const setupService = async () => {
  const database = createTestDatabase('nexus-service-unit-');
  const sqlite = SqliteDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();
  const repository = new SqliteServiceRepository(sqlite);
  const appendEvent = vi.fn(() => undefined);
  const eventService = { appendEvent };
  const party = { id: 'party-1', '@referredType': 'Organization', href: '/party/party-1', name: 'ISP Alfa' };
  const site = { id: 'site-1', '@referredType': 'GeographicSite', href: '/site/site-1', name: 'CO Botafogo' };
  const resource = { id: 'resource-1', '@referredType': 'PhysicalResource', href: '/resource/resource-1', name: 'ONT-01' };
  const serviceMap = new Map<string, { id: string; '@type': 'CustomerFacingService' | 'ResourceFacingService'; href: string; name: string }>();
  const service = new ServiceService(repository, eventService as never, {
    lookupParty: (id) => (id === party.id ? party : undefined),
    lookupPlace: (id) => (id === site.id ? site : undefined),
    lookupResource: (id) => (id === resource.id ? resource : undefined),
    lookupService: (id) => serviceMap.get(id) as any,
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
  const { database, service, appendEvent, party, site, resource, serviceMap } = await setupService();

  try {
    assert.throws(() => service.createServiceSpecification({ name: ' ', category: 'Broadband', serviceType: 'CFS' }), /name is required/);
    assert.throws(() => service.createServiceSpecification({
      name: 'Bitstream',
      category: 'Broadband',
      serviceType: 'CFS',
      relatedParty: [{ id: 'missing', '@referredType': 'Organization' }],
    }), /related party not found/);

    const cfsSpec = service.createServiceSpecification({
      name: 'Bitstream GPON',
      category: 'Broadband',
      serviceType: 'CFS',
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
    });
    const rfsSpec = service.createServiceSpecification({
      name: 'GPON Access',
      category: 'Broadband',
      serviceType: 'RFS',
    });
    const category = service.createServiceCategory({ name: 'Access', description: 'Acesso' });
    const childCategory = service.createServiceCategory({ name: 'FTTH', parentCategoryId: category.id });
    const candidate = service.createServiceCandidate({
      name: 'Candidate',
      serviceSpecificationId: cfsSpec.id,
      serviceCategoryId: category.id,
      description: 'desc',
    });

    assert.equal((appendEvent.mock.calls as unknown as Array<[ { eventType?: string } ]>)[0]?.[0]?.eventType, 'ServiceSpecificationCreateEvent');
    assert.equal(category.name, 'Access');
    assert.equal(childCategory.parentServiceCategory?.id, category.id);
    assert.equal(candidate.serviceCategory?.id, category.id);
    assert.equal(service.listServiceSpecifications({ category: 'Broadband', serviceType: 'CFS' }).length, 1);
    assert.equal(service.listServiceCategories({ parentCategoryId: category.id }).length, 1);
    assert.equal(service.listServiceCandidates({ serviceSpecificationId: cfsSpec.id, serviceCategoryId: category.id }).length, 1);

    const rfs = service.createService({
      '@type': 'ResourceFacingService',
      name: 'RFS GPON 1',
      serviceSpecificationId: rfsSpec.id,
      supportingResource: [{ id: resource.id, '@referredType': 'PhysicalResource', role: 'access' }],
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'operations' }],
      place: [{ id: site.id, '@referredType': 'GeographicSite', role: 'installationAddress' }],
      serviceCharacteristic: [{ name: 'AccessType', value: 'GPON', valueType: 'string' }],
    });
    serviceMap.set(rfs.id, rfs);
    assert.equal(rfs['@type'], 'ResourceFacingService');
    assert.equal(rfs.supportingResource[0]?.id, resource.id);

    const cfs = service.createService({
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
    assert.equal(service.listServices({ type: 'CustomerFacingService', subscriberId: 'SUB-778899', placeId: site.id }).length, 1);
    assert.equal(service.listServices({ type: 'ResourceFacingService', supportingResourceId: resource.id }).length, 1);
    assert.equal(service.listServices({ characteristicName: 'SubscriberID', characteristicValue: 'SUB-778899' }).length, 1);

    const updatedCfs = service.updateService(cfs.id, {
      name: ' CFS GPON 1A ',
      state: 'inactive',
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'subscriber' }],
    });
    assert.equal(updatedCfs.name, 'CFS GPON 1A');
    assert.equal(updatedCfs.state, 'inactive');

    const updatedRfs = service.updateService(rfs.id, {
      state: 'active',
      serviceCharacteristic: [{ name: 'AccessType', value: 'GPON', valueType: 'string' }],
    });
    assert.equal(updatedRfs['@type'], 'ResourceFacingService');
    assert.equal(updatedRfs.state, 'active');

    const terminatedCfs = service.deleteService(cfs.id);
    const terminatedRfs = service.deleteService(rfs.id);
    assert.equal(terminatedCfs.state, 'terminated');
    assert.equal(terminatedRfs.state, 'terminated');

    const rel = service.addServiceRelationship(cfs.id, {
      id: rfs.id,
      relationshipType: 'dependsOn',
      '@referredType': 'Service',
    });
    assert.equal(rel.relationshipType, 'dependsOn');
    assert.equal(service.listServiceRelationships(cfs.id).length, 1);
    assert.equal(service.removeServiceRelationship(cfs.id, rfs.id, 'dependsOn'), true);
    assert.equal(service.removeServiceRelationship(cfs.id, rfs.id, 'dependsOn'), false);

    assert.equal(service.getService(cfs.id)?.id, cfs.id);
    assert.equal(service.getService(rfs.id)?.id, rfs.id);
    assert.equal(service.listServiceCandidates({ status: 'active' }).length, 1);
    assert.equal(service.listServiceSpecifications({ serviceType: 'CFS' }).length, 1);
    assert.ok((appendEvent.mock.calls as unknown as Array<[ { eventType?: string } ]>).some((call) => call[0]?.eventType === 'ServiceCreateEvent'));
  } finally {
    SqliteDatabase.resetForTesting();
    database.cleanup();
  }
});

test('ServiceService rejects invalid service permutations and missing references', async () => {
  const { database, service } = await setupService();

  try {
    const cfsSpec = service.createServiceSpecification({ name: 'Bitstream', category: 'Broadband', serviceType: 'CFS' });
    const rfsSpec = service.createServiceSpecification({ name: 'Access', category: 'Broadband', serviceType: 'RFS' });

    assert.throws(
      () =>
        service.createCustomerFacingService({
          '@type': 'CustomerFacingService',
          name: 'Invalid',
          serviceSpecificationId: cfsSpec.id,
          subscriberId: 'SUB-1',
          supportingResource: [{ id: 'resource-1', '@referredType': 'PhysicalResource' }],
        } as any),
      /CFS cannot reference supportingResource directly/,
    );
    assert.throws(
      () =>
        service.createService({
          '@type': 'CustomerFacingService',
          name: 'Invalid',
          serviceSpecificationId: cfsSpec.id,
          subscriberId: 'SUB-1',
        }),
      /CFS requires supportingService/,
    );
    assert.throws(
      () =>
        service.createService({
          '@type': 'CustomerFacingService',
          name: 'Invalid',
          serviceSpecificationId: rfsSpec.id,
          subscriberId: 'SUB-1',
          supportingService: [],
        }),
      /serviceSpecification type mismatch/,
    );
    assert.throws(
      () =>
        service.createService({
          '@type': 'ResourceFacingService',
          name: 'Invalid RFS',
          serviceSpecificationId: rfsSpec.id,
          supportingResource: [],
        }),
      /RFS requires supportingResource/,
    );
    assert.throws(
      () =>
        service.createService({
          '@type': 'ResourceFacingService',
          name: 'Invalid RFS',
          serviceSpecificationId: rfsSpec.id,
          supportingResource: [{ id: 'missing', '@referredType': 'PhysicalResource' }],
        }),
      /supporting resource not found/,
    );
    assert.throws(() => service.updateService('missing', { state: 'active' }), /service not found/);
    assert.throws(() => service.deleteService('missing'), /service not found/);
    assert.throws(() => service.addServiceRelationship('missing', { id: 'x', relationshipType: 'dependsOn', '@referredType': 'Service' }), /service not found/);
  } finally {
    SqliteDatabase.resetForTesting();
    database.cleanup();
  }
});
