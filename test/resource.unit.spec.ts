import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error.js';
import { ResourceRepository } from '../src/modules/resource/repository.js';
import { ResourceService } from '../src/modules/resource/service.js';
import {
  foldStatusText,
  resolveStatusCode,
} from '../src/modules/resource/status-catalog.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('resource status catalog maps canonical and corrupted Netwin substatuses', () => {
  assert.equal(foldStatusText('  ÁREA de RISCO  '), 'area de risco');
  assert.equal(resolveStatusCode('OBRA DESCARTADA - ÁREA DE RISCO'), 'blocked_risk_area');
  assert.equal(resolveStatusCode('INSTALAÇÃO IMPEDIDA - ÁREA DE RISCO'), 'blocked_risk_area');
  assert.equal(resolveStatusCode('AS-BUILT CONCLUÍDO'), 'as_built_completed');
  assert.equal(
    resolveStatusCode('INSTALA¿¿ÃO IMPEDIDA - ACESSO OBSTRUÍDO OU INVIÁVEL'),
    'install_blocked_access_obstructed',
  );
  assert.equal(resolveStatusCode('estado futuro sem catálogo'), undefined);
});

test('ResourceRepository returns status catalog and resource detail aggregate', async () => {
  const repository = new ResourceRepository();
  const spec = repository.upsertResourceSpecification({
    '@type': 'ResourceSpecification',
    id: 'spec-cto-detail',
    href: '/resource-specification/spec-cto-detail',
    name: 'CDOE Corning',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceSpecificationCharacteristic: [
      { name: 'manufacturer', value: 'CORNING', valueType: 'string' },
      { name: 'model', value: 'CDOE 8-48FS', valueType: 'string' },
      { name: 'networkType', value: 'GPON', valueType: 'string' },
    ],
    relatedParty: [],
  });
  repository.upsertPhysicalResource({
    '@type': 'PhysicalResource',
    id: 'cto-detail',
    href: '/resource/cto-detail',
    name: 'RJ-ITPU-CDOE-6746',
    resourceSpecificationId: spec.id,
    resourceSpecification: { id: spec.id, '@referredType': 'ResourceSpecification' },
    resourceType: 'CTO',
    status: 'suspended',
    statusCode: 'blocked_risk_area',
    administrativeState: 'locked',
    operationalState: 'enabled',
    usageState: 'active',
    label: 'CDOE-6746',
    assetReference: '324607',
    relatedParty: [],
    resourceRelationship: [],
    characteristic: [],
  });

  const detail = repository.getPhysicalResourceDetail('cto-detail');
  assert.ok(detail);
  assert.equal(detail.specification.manufacturer, 'CORNING');
  assert.equal(detail.specification.model, 'CDOE 8-48FS');
  assert.equal(detail.specification.networkType, 'GPON');
  assert.equal(detail.specification.resourceTypeName, 'Caixa de Terminação Óptica');
  assert.equal(detail.statusCatalogEntry?.name, 'Bloqueado por área de risco');
  assert.equal(detail.resource.label, 'CDOE-6746');
  assert.equal(repository.listResourceStatusCatalog({ resourceType: 'CTO' }).length > 2, true);
});

test('ResourceRepository clones stored entities and filters across resource kinds', async () => {
  const repository = new ResourceRepository();

  const spec = await repository.upsertResourceSpecification({
    '@type': 'ResourceSpecification',
    id: 'spec-1',
    href: '/resource-spec/spec-1',
    name: 'OLT',
    category: 'Equipment.Access',
    resourceType: 'OLT',
    resourceSpecificationCharacteristic: [{ name: 'vendor', value: 'Huawei', valueType: 'string' }],
    relatedParty: [{ id: 'party-1', '@referredType': 'Organization', name: 'V.tal' }],
  });
  const functionSpec = await repository.upsertResourceFunctionSpecification({
    '@type': 'ResourceFunctionSpecification',
    id: 'func-1',
    href: '/resource-func/func-1',
    name: 'Activation',
    resourceFunctionSpecificationCharacteristic: [
      { name: 'mode', value: 'default', valueType: 'string' },
    ],
  });

  const physical = await repository.upsertPhysicalResource({
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
  const logical = await repository.upsertLogicalResource({
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
  assert.equal(
    repository.listResourceSpecifications({ name: 'ol', category: 'Equipment.Access' }).length,
    1,
  );
  repository.upsertResourceSpecification({
    ...spec,
    validFor: { endDateTime: '2026-07-09T10:00:00.000Z' },
  });
  assert.equal(repository.listResourceSpecifications({ category: 'Equipment.Access' }).length, 0);
  assert.equal(
    repository.listResourceSpecifications({ category: 'Equipment.Access', includeEnded: true })
      .length,
    1,
  );
  assert.ok(repository.getResourceSpecification('spec-1')?.validFor?.endDateTime);
  assert.equal(repository.listResourceFunctionSpecifications({ name: 'act' }).length, 1);
  assert.ok(repository.getResourceCategory('Equipment.Access'));
  assert.ok(repository.getResourceCategory('Equipment.CustomerPremises'));
  assert.ok(repository.getResourceType('OLT'));
  assert.ok(repository.getResourceType('CPE'));
  assert.ok(repository.listResourceCategories().length > 0);
  assert.ok(repository.listResourceTypes().length > 0);
  assert.equal(
    repository.listPhysicalResources({
      kind: 'PhysicalResource',
      status: 'active',
      placeId: 'site-1',
    }).length,
    1,
  );
  assert.equal(
    repository.listLogicalResources({
      kind: 'LogicalResource',
      status: 'inactive',
      resourceSpecificationId: spec.id,
    }).length,
    1,
  );
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

test('ResourceService creates, mutates and terminates inventory resources', async () => {
  const repository = new ResourceRepository();
  const appendEvent = vi.fn(() => undefined);
  const eventService = { appendEvent };
  const party = {
    id: 'party-1',
    '@referredType': 'Organization',
    href: '/party/party-1',
    name: 'V.tal',
  };
  const place = {
    id: 'site-1',
    '@referredType': 'GeographicSite',
    href: '/site/site-1',
    name: 'CO Botafogo',
  };
  const service = new ResourceService(repository, eventService as never, {
    lookupParty: (id) => (id === party.id ? party : undefined),
    lookupPlace: (id) => (id === place.id ? place : undefined),
  });

  await assert.rejects(
    () =>
      service.createResourceSpecification({
        name: '  ',
        category: 'Equipment.Access',
        resourceType: 'OLT',
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      /name is required/.test(error.message),
  );
  await assert.rejects(
    () => service.createResourceSpecification({ name: 'OLT', category: '', resourceType: 'OLT' }),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      /category is required/.test(error.message),
  );
  await assert.rejects(
    () => service.createPhysicalResource({ name: 'OLT', resourceSpecificationId: 'missing' }),
    /resource specification not found/,
  );

  const spec = await service.createResourceSpecification({
    name: 'OLT',
    category: 'Equipment.Access',
    resourceType: 'OLT',
    relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
  });
  const functionSpec = await service.createResourceFunctionSpecification({ name: 'Activation' });
  assert.equal(functionSpec.name, 'Activation');

  await assert.rejects(
    async () =>
      await service.createResourceSpecification({
        name: 'OLT',
        category: 'Equipment.Access',
        resourceType: 'OLT',
        relatedParty: [{ id: 'missing', '@referredType': 'Organization' }],
      }),
    /related party not found/,
  );

  const physical = await service.createPhysicalResource({
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
  const resourceCreateEventIndex = (
    appendEvent.mock.calls as unknown as Array<[{ eventType?: string }]>
  ).findIndex((call) => call[0]?.eventType === 'ResourceCreateEvent');
  assert.equal(physical['@type'], 'PhysicalResource');
  assert.ok(resourceCreateEventIndex >= 0);

  const logical = await service.createLogicalResource({
    name: 'VLAN 100',
    resourceSpecificationId: spec.id,
    placeId: place.id,
    supportingPhysicalResourceId: physical.id,
    relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
  });
  assert.equal(logical['@type'], 'LogicalResource');

  await assert.rejects(
    async () =>
      await service.createPhysicalResource({
        name: 'Bad place',
        resourceSpecificationId: spec.id,
        placeId: 'missing',
      }),
    /place not found/,
  );

  await assert.rejects(
    async () =>
      await service.createLogicalResource({
        name: 'Bad supporting resource',
        resourceSpecificationId: spec.id,
        supportingPhysicalResourceId: 'missing',
      }),
    /resource not found/,
  );

  const updatedPhysical = await service.updatePhysicalResource(physical.id, {
    name: ' OLT-01A ',
    status: 'inactive',
    placeId: place.id,
  });
  assert.equal(updatedPhysical.name, 'OLT-01A');
  assert.equal(updatedPhysical.status, 'inactive');
  assert.equal(
    (appendEvent.mock.calls as unknown as Array<[{ eventType?: string }]>).some(
      (call) => call[0]?.eventType === 'ResourceStateChangeEvent',
    ),
    true,
  );

  const updatedLogical = await service.updateLogicalResource(logical.id, {
    name: ' VLAN 100A ',
    status: 'active',
    supportingPhysicalResourceId: physical.id,
  });
  assert.equal(updatedLogical.name, 'VLAN 100A');
  assert.equal(updatedLogical.supportingPhysicalResourceId, physical.id);

  // `placeId: null` desvincula o recurso do Site (aba Recursos do painel unificado de
  // Local, REQ-MOD01-016) — `undefined` (campo ausente) não deve mexer no place existente.
  assert.equal(updatedPhysical.place?.id, place.id);
  const unchangedPlace = await service.updatePhysicalResource(physical.id, { name: 'sem mudança' });
  assert.equal(unchangedPlace.place?.id, place.id);
  const unlinkedPhysical = await service.updatePhysicalResource(physical.id, { placeId: null });
  assert.equal(unlinkedPhysical.place, undefined);
  const relinkedPhysical = await service.updatePhysicalResource(physical.id, { placeId: place.id });
  assert.equal(relinkedPhysical.place?.id, place.id);

  const unlinkedLogical = await service.updateLogicalResource(logical.id, { placeId: null });
  assert.equal(unlinkedLogical.place, undefined);

  const related = await service.addResourceRelationship(physical.id, {
    id: logical.id,
    relationshipType: 'supports',
    '@referredType': 'Resource',
  });
  assert.equal(related.relationshipType, 'supports');
  assert.equal((await service.listResourceRelationships(physical.id)).length, 1);
  assert.equal(await service.removeResourceRelationship(physical.id, logical.id, 'supports'), true);
  assert.equal(
    await service.removeResourceRelationship(physical.id, logical.id, 'supports'),
    false,
  );

  const active = await service.activateResource({ resourceId: physical.id, action: 'activate' });
  const suspended = await service.activateResource({ resourceId: physical.id, action: 'suspend' });
  const terminated = await service.activateResource({
    resourceId: physical.id,
    action: 'terminate',
  });
  assert.equal(active.status, 'active');
  assert.equal(suspended.status, 'suspended');
  assert.equal(terminated.status, 'terminated');

  const deletedPhysical = await service.deletePhysicalResource(physical.id);
  assert.equal(deletedPhysical.status, 'terminated');
  assert.ok(deletedPhysical.validFor?.endDateTime);
  const deletedLogical = await service.deleteLogicalResource(logical.id);
  assert.equal(deletedLogical.status, 'terminated');

  await assert.rejects(
    async () =>
      await service.createResourceSpecification({
        name: 'Bad type',
        category: 'Equipment.Access',
        resourceType: 'VLAN',
      }),
    /resource type is not allowed for category/,
  );

  await assert.rejects(
    () => service.updatePhysicalResource('missing', { name: 'x' }),
    /resource not found/,
  );
  await assert.rejects(
    () => service.updateLogicalResource('missing', { name: 'x' }),
    /resource not found/,
  );
  await assert.rejects(
    () =>
      service.addResourceRelationship('missing', {
        id: physical.id,
        relationshipType: 'supports',
        '@referredType': 'Resource',
      }),
    /resource not found/,
  );
  await assert.rejects(
    () =>
      service.addResourceRelationship(physical.id, {
        id: 'missing',
        relationshipType: 'supports',
        '@referredType': 'Resource',
      }),
    /resource not found/,
  );
});
