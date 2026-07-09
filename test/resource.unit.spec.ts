import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { ResourceRepository } from '../src/modules/resource/repository.js';
import { ResourceService } from '../src/modules/resource/service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('ResourceRepository clones stored entities and filters across resource kinds', () => {
  const repository = new ResourceRepository();

  const spec = repository.upsertResourceSpecification({
    '@type': 'ResourceSpecification',
    id: 'spec-1',
    href: '/resource-spec/spec-1',
    name: 'OLT',
    category: 'Equipment.Access',
    resourceType: 'OLT',
    resourceSpecificationCharacteristic: [{ name: 'vendor', value: 'Huawei', valueType: 'string' }],
    relatedParty: [{ id: 'party-1', '@referredType': 'Organization', name: 'V.tal' }],
  });
  const functionSpec = repository.upsertResourceFunctionSpecification({
    '@type': 'ResourceFunctionSpecification',
    id: 'func-1',
    href: '/resource-func/func-1',
    name: 'Activation',
    resourceFunctionSpecificationCharacteristic: [{ name: 'mode', value: 'default', valueType: 'string' }],
  });

  const physical = repository.upsertPhysicalResource({
    '@type': 'PhysicalResource',
    id: 'res-1',
    href: '/resource/res-1',
    name: 'OLT-01',
    resourceSpecificationId: spec.id,
    resourceSpecification: { id: spec.id, '@referredType': 'ResourceSpecification' },
    resourceType: spec.resourceType,
    status: 'active',
    administrativeState: 'unlocked',
    operationalState: 'enabled',
    usageState: 'busy',
    place: { id: 'site-1', '@referredType': 'GeographicSite' },
    relatedParty: spec.relatedParty,
    resourceRelationship: [],
    characteristic: [{ name: 'port', value: '1/1', valueType: 'string' }],
  });
  const logical = repository.upsertLogicalResource({
    '@type': 'LogicalResource',
    id: 'res-2',
    href: '/resource/res-2',
    name: 'VLAN-100',
    resourceSpecificationId: spec.id,
    resourceSpecification: { id: spec.id, '@referredType': 'ResourceSpecification' },
    resourceType: 'LogicalResource',
    status: 'inactive',
    administrativeState: 'locked',
    operationalState: 'disabled',
    usageState: 'idle',
    supportingPhysicalResourceId: physical.id,
    relatedParty: [],
    resourceRelationship: [],
    characteristic: [],
  });

  spec.name = 'mutated';
  functionSpec.name = 'mutated';
  physical.name = 'mutated';
  logical.name = 'mutated';

  assert.equal(repository.getResourceSpecification('spec-1')?.name, 'OLT');
  assert.equal(repository.getResourceFunctionSpecification('func-1')?.name, 'Activation');
  assert.equal(repository.getPhysicalResource('res-1')?.name, 'OLT-01');
  assert.equal(repository.getLogicalResource('res-2')?.name, 'VLAN-100');
  assert.equal(repository.listResourceSpecifications({ name: 'ol', category: 'Equipment.Access' }).length, 1);
  repository.upsertResourceSpecification({
    ...spec,
    validFor: { endDateTime: '2026-07-09T10:00:00.000Z' },
  });
  assert.equal(repository.listResourceSpecifications({ category: 'Equipment.Access' }).length, 0);
  assert.equal(repository.listResourceSpecifications({ category: 'Equipment.Access', includeEnded: true }).length, 1);
  assert.ok(repository.getResourceSpecification('spec-1')?.validFor?.endDateTime);
  assert.equal(repository.listResourceFunctionSpecifications({ name: 'act' }).length, 1);
  assert.ok(repository.getResourceCategory('Equipment.Access'));
  assert.ok(repository.getResourceCategory('Equipment.CustomerPremises'));
  assert.ok(repository.getResourceType('OLT'));
  assert.ok(repository.getResourceType('CPE'));
  assert.ok(repository.listResourceCategories().length > 0);
  assert.ok(repository.listResourceTypes().length > 0);
  assert.equal(repository.listPhysicalResources({ kind: 'PhysicalResource', status: 'active', placeId: 'site-1' }).length, 1);
  assert.equal(repository.listLogicalResources({ kind: 'LogicalResource', status: 'inactive', resourceSpecificationId: spec.id }).length, 1);
  assert.equal(repository.listResources({ kind: 'PhysicalResource' }).length, 1);
  assert.equal(repository.listResources({ kind: 'LogicalResource' }).length, 1);

  repository.upsertResourceRelationship('res-1', {
    id: 'res-2',
    relationshipType: 'supports',
    '@referredType': 'Resource',
    validFor: { endDateTime: '2026-07-07T10:00:00.000Z' },
  });
  assert.equal(repository.listResourceRelationships('res-1').length, 1);
  assert.equal(repository.deleteResourceRelationship('res-1', 'res-2', 'supports'), true);
  assert.equal(repository.deleteResourceRelationship('res-1', 'res-2', 'supports'), false);
});

test('ResourceService creates, mutates and terminates inventory resources', () => {
  const repository = new ResourceRepository();
  const appendEvent = vi.fn(() => undefined);
  const eventService = { appendEvent };
  const party = { id: 'party-1', '@referredType': 'Organization', href: '/party/party-1', name: 'V.tal' };
  const place = { id: 'site-1', '@referredType': 'GeographicSite', href: '/site/site-1', name: 'CO Botafogo' };
  const service = new ResourceService(repository, eventService as never, {
    lookupParty: (id) => (id === party.id ? party : undefined),
    lookupPlace: (id) => (id === place.id ? place : undefined),
  });

  assert.throws(() => service.createResourceSpecification({ name: '  ', category: 'Equipment.Access', resourceType: 'OLT' }), /name is required/);
  assert.throws(() => service.createPhysicalResource({ name: 'OLT', resourceSpecificationId: 'missing' }), /resource specification not found/);

  const spec = service.createResourceSpecification({
    name: 'OLT',
    category: 'Equipment.Access',
    resourceType: 'OLT',
    relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
  });
  const functionSpec = service.createResourceFunctionSpecification({ name: 'Activation' });
  assert.equal(functionSpec.name, 'Activation');

  assert.throws(
    () =>
      service.createResourceSpecification({
        name: 'OLT',
        category: 'Equipment.Access',
        resourceType: 'OLT',
        relatedParty: [{ id: 'missing', '@referredType': 'Organization' }],
      }),
    /related party not found/,
  );

  const physical = service.createPhysicalResource({
    name: 'OLT-01',
    resourceSpecificationId: spec.id,
    placeId: place.id,
    placeType: 'GeographicSite',
    relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
    manufacturer: 'Huawei',
    model: 'MA5800',
    serialNumber: 'SN-OLT-001',
    characteristic: [{ name: 'slot', value: '1', valueType: 'integer' }],
  });
  const resourceCreateEventIndex = (appendEvent.mock.calls as unknown as Array<[ { eventType?: string } ]>).findIndex((call) => call[0]?.eventType === 'ResourceCreateEvent');
  assert.equal(physical['@type'], 'PhysicalResource');
  assert.ok(resourceCreateEventIndex >= 0);

  const logical = service.createLogicalResource({
    name: 'VLAN 100',
    resourceSpecificationId: spec.id,
    placeId: place.id,
    supportingPhysicalResourceId: physical.id,
    relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
  });
  assert.equal(logical['@type'], 'LogicalResource');

  assert.throws(
    () =>
      service.createPhysicalResource({
        name: 'Bad place',
        resourceSpecificationId: spec.id,
        placeId: 'missing',
      }),
    /place not found/,
  );

  assert.throws(
    () =>
      service.createLogicalResource({
        name: 'Bad supporting resource',
        resourceSpecificationId: spec.id,
        supportingPhysicalResourceId: 'missing',
      }),
    /resource not found/,
  );

  const updatedPhysical = service.updatePhysicalResource(physical.id, {
    name: ' OLT-01A ',
    status: 'inactive',
    placeId: place.id,
  });
  assert.equal(updatedPhysical.name, 'OLT-01A');
  assert.equal(updatedPhysical.status, 'inactive');
  assert.equal((appendEvent.mock.calls as unknown as Array<[ { eventType?: string } ]>).some((call) => call[0]?.eventType === 'ResourceStateChangeEvent'), true);

  const updatedLogical = service.updateLogicalResource(logical.id, {
    name: ' VLAN 100A ',
    status: 'active',
    supportingPhysicalResourceId: physical.id,
  });
  assert.equal(updatedLogical.name, 'VLAN 100A');
  assert.equal(updatedLogical.supportingPhysicalResourceId, physical.id);

  const related = service.addResourceRelationship(physical.id, {
    id: logical.id,
    relationshipType: 'supports',
    '@referredType': 'Resource',
  });
  assert.equal(related.relationshipType, 'supports');
  assert.equal(service.listResourceRelationships(physical.id).length, 1);
  assert.equal(service.removeResourceRelationship(physical.id, logical.id, 'supports'), true);
  assert.equal(service.removeResourceRelationship(physical.id, logical.id, 'supports'), false);

  const active = service.activateResource({ resourceId: physical.id, action: 'activate' });
  const suspended = service.activateResource({ resourceId: physical.id, action: 'suspend' });
  const terminated = service.activateResource({ resourceId: physical.id, action: 'terminate' });
  assert.equal(active.status, 'active');
  assert.equal(suspended.status, 'suspended');
  assert.equal(terminated.status, 'terminated');

  const deletedPhysical = service.deletePhysicalResource(physical.id);
  assert.equal(deletedPhysical.status, 'terminated');
  assert.ok(deletedPhysical.validFor?.endDateTime);
  const deletedLogical = service.deleteLogicalResource(logical.id);
  assert.equal(deletedLogical.status, 'terminated');

  assert.throws(
    () =>
      service.createResourceSpecification({
        name: 'Bad type',
        category: 'Equipment.Access',
        resourceType: 'VLAN',
      }),
    /resource type is not allowed for category/,
  );

  assert.throws(() => service.updatePhysicalResource('missing', { name: 'x' }), /resource not found/);
  assert.throws(() => service.updateLogicalResource('missing', { name: 'x' }), /resource not found/);
  assert.throws(() => service.addResourceRelationship('missing', { id: physical.id, relationshipType: 'supports', '@referredType': 'Resource' }), /resource not found/);
  assert.throws(() => service.addResourceRelationship(physical.id, { id: 'missing', relationshipType: 'supports', '@referredType': 'Resource' }), /resource not found/);
});
