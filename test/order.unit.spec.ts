import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { PostgresOrderRepository } from '../src/modules/order/postgres-repository.js';
import { OrderService } from '../src/modules/order/service.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  PostgresDatabase.resetForTesting();
  vi.restoreAllMocks();
});

const setupOrder = async () => {
  const database = createTestDatabase('nexus-order-unit-');
  const sqlite = PostgresDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();
  const repository = new PostgresOrderRepository(sqlite);
  const appendEvent = vi.fn(() => undefined);
  const eventService = { appendEvent };

  const party = { id: 'party-1', '@referredType': 'Organization', href: '/party/party-1', name: 'ISP Alfa' };
  const site = { id: 'site-1', '@referredType': 'GeographicSite', href: '/site/site-1', name: 'CO Botafogo' };
  const address = { id: 'addr-1', '@referredType': 'GeographicAddress', href: '/address/addr-1', name: 'Rua A' };
  const location = { id: 'loc-1', '@referredType': 'GeographicLocation', href: '/location/loc-1', name: 'Ponto' };

  const geoStore = new Map([site, address, location].map((item) => [item.id, item] as const));
  const resourceStore = new Map<string, any>();
  const serviceStore = new Map<string, any>();

  const resourceService = {
    createPhysicalResource: vi.fn((input: any) => {
      const resource = {
        '@type': 'PhysicalResource',
        id: `resource-${resourceStore.size + 1}`,
        href: `/resource/${resourceStore.size + 1}`,
        name: input.name,
        status: input.status ?? 'active',
        resourceSpecificationId: input.resourceSpecificationId,
        place: input.placeId ? [{ id: input.placeId, '@referredType': input.placeType ?? 'GeographicSite' }] : [],
      };
      resourceStore.set(resource.id, resource);
      return resource;
    }),
    createLogicalResource: vi.fn((input: any) => {
      const resource = {
        '@type': 'LogicalResource',
        id: `resource-${resourceStore.size + 1}`,
        href: `/resource/${resourceStore.size + 1}`,
        name: input.name,
        status: input.status ?? 'active',
        resourceSpecificationId: input.resourceSpecificationId,
        place: input.placeId ? [{ id: input.placeId, '@referredType': input.placeType ?? 'GeographicSite' }] : [],
        supportingPhysicalResourceId: input.supportingPhysicalResourceId,
      };
      resourceStore.set(resource.id, resource);
      return resource;
    }),
    updatePhysicalResource: vi.fn((id: string, input: any) => {
      const current = resourceStore.get(id);
      const updated = { ...current, ...input, id };
      resourceStore.set(id, updated);
      return updated;
    }),
    updateLogicalResource: vi.fn((id: string, input: any) => {
      const current = resourceStore.get(id);
      const updated = { ...current, ...input, id };
      resourceStore.set(id, updated);
      return updated;
    }),
    deletePhysicalResource: vi.fn((id: string) => {
      const current = resourceStore.get(id);
      const updated = { ...current, status: 'terminated' };
      resourceStore.set(id, updated);
      return updated;
    }),
    deleteLogicalResource: vi.fn((id: string) => {
      const current = resourceStore.get(id);
      const updated = { ...current, status: 'terminated' };
      resourceStore.set(id, updated);
      return updated;
    }),
    getResource: vi.fn((id: string) => resourceStore.get(id)),
    listPhysicalResources: vi.fn((query: any) =>
      [...resourceStore.values()].filter(
        (resource) =>
          resource['@type'] === 'PhysicalResource' &&
          (query?.placeId ? resource.place?.some((item: any) => item.id === query.placeId) : true) &&
          (query?.status ? resource.status === query.status : true),
      ),
    ),
    listLogicalResources: vi.fn((query: any) =>
      [...resourceStore.values()].filter(
        (resource) =>
          resource['@type'] === 'LogicalResource' &&
          (query?.placeId ? resource.place?.some((item: any) => item.id === query.placeId) : true) &&
          (query?.status ? resource.status === query.status : true),
      ),
    ),
  };

  const service = {
    createService: vi.fn((input: any) => {
      const type = input['@type'] ?? (input.subscriberId ? 'CustomerFacingService' : 'ResourceFacingService');
      const id = `service-${serviceStore.size + 1}`;
      const created = {
        '@type': type,
        id,
        href: `/service/${serviceStore.size + 1}`,
        name: input.name,
        state: input.state ?? 'active',
        serviceSpecificationId: input.serviceSpecificationId,
        supportingService: input.supportingService ?? [],
        supportingResource: input.supportingResource ?? [],
        relatedParty: input.relatedParty ?? [],
        place: input.place ?? [],
        serviceCharacteristic: input.serviceCharacteristic ?? [],
        subscriberId: input.subscriberId,
        serviceRelationship: input.serviceRelationship ?? [],
      };
      serviceStore.set(id, created);
      return created;
    }),
    updateService: vi.fn((id: string, input: any) => {
      const current = serviceStore.get(id);
      const updated = { ...current, ...input, id };
      serviceStore.set(id, updated);
      return updated;
    }),
    deleteService: vi.fn((id: string) => {
      const current = serviceStore.get(id);
      const updated = { ...current, state: 'terminated' };
      serviceStore.set(id, updated);
      return updated;
    }),
    getService: vi.fn((id: string) => serviceStore.get(id)),
  };

  const order = new OrderService(repository, eventService as never, {
    lookupParty: (id) => (id === party.id ? party : undefined),
    lookupPlace: (id) => geoStore.get(id),
    serviceService: service as never,
    geoService: {
      getSite: (id: string) => (id === site.id ? site : undefined),
      getAddress: (id: string) => (id === address.id ? address : undefined),
      getLocation: (id: string) => (id === location.id ? location : undefined),
    } as never,
    resourceService: resourceService as never,
    partyService: {} as never,
  });

  return { database, repository, appendEvent, order, party, site, address, location, resourceService, service, serviceStore, resourceStore };
};

test('OrderService qualifies places and executes service/resource orders', async () => {
  const { database, order, appendEvent, party, site, address, location, resourceService, serviceStore, resourceStore } = await setupOrder();

  try {
    const activeResource = resourceService.createPhysicalResource({
      name: 'ONT-01',
      resourceSpecificationId: 'spec-1',
      placeId: site.id,
      placeType: 'GeographicSite',
      status: 'active',
    });
    resourceStore.set(activeResource.id, activeResource);

    const siteQualification = order.createServiceQualification({
      placeId: site.id,
      serviceSpecificationId: 'svc-spec-1',
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'requestor' }],
    });
    assert.equal(siteQualification.place[0]?.id, site.id);
    assert.equal(siteQualification.serviceQualificationItem[0]?.eligibility, 'qualified');

    const addressQualification = order.createServiceQualification({ placeId: address.id });
    const locationQualification = order.createServiceQualification({ placeId: location.id });
    assert.equal(addressQualification.place[0]?.id, address.id);
    assert.equal(locationQualification.place[0]?.id, location.id);

    const missingPlace = order.createServiceQualification({ placeId: 'missing' });
    assert.equal(missingPlace.serviceQualificationItem[0]?.eligibility, 'unqualified');
    assert.equal(missingPlace.serviceQualificationItem[0]?.reason, 'placeId required');

    const noPlace = order.createServiceQualification({});
    assert.equal(noPlace.serviceQualificationItem[0]?.reason, 'placeId required');

    const serviceOrder = order.createServiceOrder({
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'subscriber' }],
      serviceOrderItem: [
        {
          action: 'add',
          service: {
            '@type': 'CustomerFacingService',
            name: 'CFS GPON 1',
            serviceSpecificationId: 'svc-spec-1',
            subscriberId: 'SUB-1',
          },
        },
        {
          action: 'modify',
          serviceId: 'service-1',
          service: { name: 'CFS GPON 1A' },
        },
        {
          action: 'delete',
          serviceId: 'service-1',
        },
      ],
    });
    assert.equal(serviceOrder.state, 'completed');
    assert.equal(serviceOrder.serviceOrderItem.length, 3);
    assert.equal(serviceOrder.serviceOrderItem[0]?.serviceResult?.['@type'], 'CustomerFacingService');
    assert.equal(serviceOrder.serviceOrderItem[2]?.serviceResult?.state, 'terminated');
    assert.equal(serviceStore.size, 1);

    const resourceOrder = order.createResourceOrder({
      relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'requestor' }],
      resourceOrderItem: [
        {
          action: 'add',
          resource: {
            '@type': 'PhysicalResource',
            name: 'OLT-02',
            resourceSpecificationId: 'spec-1',
            placeId: site.id,
            placeType: 'GeographicSite',
          },
        },
        {
          action: 'modify',
          resourceId: activeResource.id,
          resource: {
            '@type': 'PhysicalResource',
            name: 'ONT-01A',
          },
        },
        {
          action: 'delete',
          resourceId: activeResource.id,
        },
      ],
    });
    assert.equal(resourceOrder.state, 'completed');
    assert.equal(resourceOrder.resourceOrderItem.length, 3);
    assert.equal(resourceOrder.resourceOrderItem[0]?.resourceResult?.['@type'], 'PhysicalResource');
    assert.equal(resourceOrder.resourceOrderItem[2]?.resourceResult?.status, 'terminated');

    const serviceOrderList = order.listServiceOrders({ relatedPartyId: party.id });
    const resourceOrderList = order.listResourceOrders({ relatedPartyId: party.id, resourceId: activeResource.id });
    const qualificationList = order.listServiceQualifications({ placeId: site.id, serviceSpecificationId: 'svc-spec-1' });
    assert.equal(serviceOrderList.length, 1);
    assert.equal(resourceOrderList.length, 1);
    assert.equal(qualificationList.length, 1);

    const updatedQualification = order.updateServiceQualification(siteQualification.id, { state: 'terminated' });
    assert.equal(updatedQualification.state, 'terminated');
    const cancelledServiceOrder = order.cancelServiceOrder(serviceOrder.id);
    const cancelledResourceOrder = order.cancelResourceOrder(resourceOrder.id);
    assert.equal(cancelledServiceOrder.state, 'cancelled');
    assert.equal(cancelledResourceOrder.state, 'cancelled');
    assert.ok((appendEvent.mock.calls as unknown as Array<[ { eventType?: string } ]>).some((call) => call[0]?.eventType === 'ServiceOrderCreateEvent'));
    assert.ok((appendEvent.mock.calls as unknown as Array<[ { eventType?: string } ]>).some((call) => call[0]?.eventType === 'ResourceOrderCreateEvent'));
  } finally {
    PostgresDatabase.resetForTesting();
    database.cleanup();
  }
});

test('OrderService rejects invalid order permutations and unknown references', async () => {
  const { database, order } = await setupOrder();

  try {
    assert.throws(() => order.createServiceOrder({ serviceOrderItem: [] }), /serviceOrderItem required/);
    assert.throws(() => order.createResourceOrder({ resourceOrderItem: [] }), /resourceOrderItem required/);
    assert.throws(() => order.createServiceOrder({ serviceOrderItem: [{ action: 'add' as const }] }), /service payload required/);
    assert.throws(() => order.createServiceOrder({ serviceOrderItem: [{ action: 'modify' as const, serviceId: 'x' }] }), /serviceId and service payload required/);
    assert.throws(() => order.createServiceOrder({ serviceOrderItem: [{ action: 'delete' as const }] }), /serviceId required/);
    assert.throws(() => order.createResourceOrder({ resourceOrderItem: [{ action: 'add' as const }] }), /resource payload required/);
    assert.throws(() => order.createResourceOrder({ resourceOrderItem: [{ action: 'modify' as const, resourceId: 'x' }] }), /resource not found/);
    assert.throws(() => order.createResourceOrder({ resourceOrderItem: [{ action: 'delete' as const, resourceId: 'missing' }] }), /resource not found/);
    assert.throws(() => order.deleteServiceQualification('missing'), /service qualification not found/);
    assert.throws(() => order.updateServiceQualification('missing', { state: 'terminated' }), /service qualification not found/);
    assert.throws(() => order.cancelServiceOrder('missing'), /service order not found/);
    assert.throws(() => order.cancelResourceOrder('missing'), /resource order not found/);
  } finally {
    PostgresDatabase.resetForTesting();
    database.cleanup();
  }
});
