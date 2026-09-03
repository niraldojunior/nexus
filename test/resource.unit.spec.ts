import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error.js';
import { ResourceRepository } from '../src/modules/resource/repository.js';
import { ResourceService } from '../src/modules/resource/service.js';
import { getResourceTypeByCode } from '../src/modules/resource/catalog.js';
import {
  foldStatusText,
  resolveStatusCode,
} from '../src/modules/resource/status-catalog.js';

const resourceTypeByCode = (code: string) => {
  const resourceType = getResourceTypeByCode(code);
  assert.ok(resourceType, `ResourceType não encontrado: ${code}`);
  return {
    id: resourceType.id,
    href: resourceType.href,
    code: resourceType.code,
    name: resourceType.name,
    '@referredType': 'ResourceType' as const,
  };
};

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
    resourceTypeId: 'rt-cto',
    resourceType: resourceTypeByCode('CTO'),
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'CDOE 8-48FS', valueType: 'string' }],
    relatedParty: [
      {
        id: 'party-corning',
        '@referredType': 'Organization',
        role: 'manufacturer',
        name: 'CORNING',
      },
    ],
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
  assert.equal(detail.specification.manufacturer?.name, 'CORNING');
  assert.equal(detail.specification.model, 'CDOE 8-48FS');
  assert.equal(detail.specification.resourceType.code, 'CTO');
  assert.equal(detail.specification.resourceTypeName, 'Caixa de Terminação Óptica');
  assert.equal(detail.statusCatalogEntry?.name, 'Bloqueado por área de risco');
  assert.equal(detail.resource.label, 'CDOE-6746');
  assert.equal(repository.listResourceStatusCatalog({ resourceTypeId: 'rt-cto' }).length > 2, true);
});

test('ResourceRepository clones stored entities and filters across resource kinds', async () => {
  const repository = new ResourceRepository();

  const spec = await repository.upsertResourceSpecification({
    '@type': 'ResourceSpecification',
    id: 'spec-1',
    href: '/resource-spec/spec-1',
    name: 'OLT',
    resourceTypeId: 'rt-olt',
    resourceType: resourceTypeByCode('OLT'),
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
    resourceType: spec.resourceType.code,
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
    repository.listResourceSpecifications({ name: 'ol', resourceTypeId: 'rt-olt' }).length,
    1,
  );
  repository.upsertResourceSpecification({
    ...spec,
    validFor: { endDateTime: '2026-07-09T10:00:00.000Z' },
  });
  assert.equal(repository.listResourceSpecifications({ resourceTypeId: 'rt-olt' }).length, 0);
  assert.equal(
    repository.listResourceSpecifications({ resourceTypeId: 'rt-olt', includeEnded: true }).length,
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

test('Resource ports projection derives output occupancy from current and inverse drop connections', async () => {
  const repository = new ResourceRepository();
  const spec = (id: string, resourceTypeCode: string) => {
    const resourceType = resourceTypeByCode(resourceTypeCode);
    return repository.upsertResourceSpecification({
      '@type': 'ResourceSpecification',
      id,
      href: `/resource-specification/${id}`,
      name: id,
      resourceTypeId: resourceType.id,
      resourceType,
      resourceSpecificationCharacteristic: [],
      relatedParty: [],
    });
  };
  const resource = (
    id: string,
    name: string,
    resourceType: string,
    specificationId: string,
    characteristic: Array<{ name: string; value: string; valueType: 'string' }> = [],
    usageState: 'idle' | 'active' | 'busy' = 'idle',
  ) =>
    repository.upsertPhysicalResource({
      '@type': 'PhysicalResource',
      id,
      href: `/resource/${id}`,
      name,
      resourceSpecificationId: specificationId,
      resourceSpecification: { id: specificationId, '@referredType': 'ResourceSpecification' },
      resourceType,
      status: 'active',
      administrativeState: 'unlocked',
      operationalState: 'enabled',
      usageState,
      relatedParty: [],
      resourceRelationship: [],
      characteristic,
    });

  spec('spec-cto', 'CTO');
  spec('spec-splitter', 'Splitter');
  spec('spec-port', 'Port');
  spec('spec-drop', 'DropCable');
  spec('spec-distribution', 'DistributionCable');
  spec('spec-ont', 'ONT');
  resource('cto-1', 'CTO Icaraí', 'CTO', 'spec-cto');
  resource('splitter-1', 'Splitter 1:8', 'Splitter', 'spec-splitter', [
    { name: 'razao', value: '1:8', valueType: 'string' },
  ]);
  resource('port-input', 'FO.I', 'Port', 'spec-port', [{ name: 'role', value: 'FO.I', valueType: 'string' }], 'busy');
  resource('port-output-free', 'FO.O.1', 'Port', 'spec-port', [
    { name: 'role', value: 'FO.O', valueType: 'string' },
    { name: 'index', value: '1', valueType: 'string' },
  ]);
  resource('port-output-used', 'FO.O.2', 'Port', 'spec-port', [
    { name: 'role', value: 'FO.O', valueType: 'string' },
    { name: 'index', value: '2', valueType: 'string' },
  ]);
  resource('port-output-history', 'FO.O.3', 'Port', 'spec-port', [
    { name: 'role', value: 'FO.O', valueType: 'string' },
    { name: 'index', value: '3', valueType: 'string' },
  ]);
  resource('drop-current', 'Cabo drop atual', 'DropCable', 'spec-drop');
  resource('drop-history', 'Cabo drop histórico', 'DropCable', 'spec-drop');
  resource('distribution-cable', 'Cabo distribuição', 'DistributionCable', 'spec-distribution');
  resource('ont-1', 'ONT do cliente', 'ONT', 'spec-ont');

  repository.upsertResourceRelationship('cto-1', {
    id: 'splitter-1', relationshipType: 'containsAsChild', '@referredType': 'Resource',
  });
  for (const portId of ['port-input', 'port-output-free', 'port-output-used', 'port-output-history']) {
    repository.upsertResourceRelationship('splitter-1', {
      id: portId, relationshipType: 'containsAsChild', '@referredType': 'Resource',
    });
  }
  // A projeção deve reconhecer a relação simétrica mesmo quando escrita drop → porta.
  repository.upsertResourceRelationship('drop-current', {
    id: 'port-output-used', relationshipType: 'connectedTo', '@referredType': 'Resource',
  });
  repository.upsertResourceRelationship('port-output-history', {
    id: 'drop-history', relationshipType: 'connectedTo', '@referredType': 'Resource',
    validFor: { endDateTime: '2020-01-01T00:00:00.000Z' },
  });
  repository.upsertResourceRelationship('port-output-free', {
    id: 'distribution-cable', relationshipType: 'connectedTo', '@referredType': 'Resource',
  });
  repository.upsertResourceRelationship('drop-current', {
    id: 'ont-1', relationshipType: 'connectedTo', '@referredType': 'Resource',
  });

  const view = repository.getResourcePortsView('cto-1');
  assert.ok(view);
  assert.equal(view.groups.length, 1);
  const ports = view.groups[0]?.ports ?? [];
  assert.deepEqual(ports.map((port) => port.resource.id), [
    'port-input', 'port-output-free', 'port-output-used', 'port-output-history',
  ]);
  assert.equal(ports[0]?.resource.usageState, 'busy');
  assert.equal(ports[1]?.derivedUsageState, 'idle');
  assert.equal(ports[1]?.drops.length, 0);
  assert.equal(ports[2]?.resource.usageState, 'active');
  assert.equal(ports[2]?.drops[0]?.resource.id, 'drop-current');
  assert.equal(ports[2]?.drops[0]?.ont?.id, 'ont-1');
  assert.equal(ports[3]?.resource.usageState, 'idle');
  assert.equal(ports[3]?.drops[0]?.active, false);
  assert.equal(ports[3]?.drops[0]?.ont, undefined);
  assert.equal(ports[1]?.drops[0]?.ont, undefined);

  const detail = repository.getResourcePortDetail('port-output-used');
  assert.equal(detail?.splitter?.id, 'splitter-1');
  assert.equal(detail?.cto?.id, 'cto-1');
  assert.equal(detail?.splitRatio, '1:8');
  assert.equal(detail?.drops[0]?.ont?.id, 'ont-1');
});

test('ResourceService allows one active drop per splitter output in either relationship direction', async () => {
  const repository = new ResourceRepository();
  const service = new ResourceService(repository, { appendEvent: vi.fn(() => undefined) } as never);
  const outputSpec = await service.createResourceSpecification({
    name: 'Porta de splitter', resourceTypeId: 'rt-port',
  });
  const inputSpec = outputSpec;
  const dropSpec = await service.createResourceSpecification({
    name: 'Cabo drop', resourceTypeId: 'rt-drop-cable',
  });
  const distributionSpec = await service.createResourceSpecification({
    name: 'Cabo distribuição', resourceTypeId: 'rt-distribution-cable',
  });
  const output = await service.createPhysicalResource({
    name: 'FO.O.1', resourceSpecificationId: outputSpec.id,
    characteristic: [{ name: 'role', value: 'FO.O', valueType: 'string' }],
  });
  const input = await service.createPhysicalResource({
    name: 'FO.I', resourceSpecificationId: inputSpec.id,
    characteristic: [{ name: 'role', value: 'FO.I', valueType: 'string' }],
  });
  const dropOne = await service.createPhysicalResource({ name: 'Drop 1', resourceSpecificationId: dropSpec.id });
  const dropTwo = await service.createPhysicalResource({ name: 'Drop 2', resourceSpecificationId: dropSpec.id });
  const distribution = await service.createPhysicalResource({
    name: 'Distribuição', resourceSpecificationId: distributionSpec.id,
  });

  await service.addResourceRelationship(dropOne.id, {
    id: output.id, relationshipType: 'connectedTo', '@referredType': 'Resource',
  });
  await assert.rejects(
    () => service.addResourceRelationship(output.id, {
      id: dropTwo.id, relationshipType: 'connectedTo', '@referredType': 'Resource',
    }),
    (error: unknown) => error instanceof AppError && error.code === 'RESOURCE_PORT_DROP_OCCUPIED',
  );
  await service.addResourceRelationship(output.id, {
    id: distribution.id, relationshipType: 'connectedTo', '@referredType': 'Resource',
  });
  await service.addResourceRelationship(input.id, {
    id: dropTwo.id, relationshipType: 'connectedTo', '@referredType': 'Resource',
  });
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
        resourceTypeId: 'rt-olt',
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      /name is required/.test(error.message),
  );
  await assert.rejects(
    () => service.createResourceSpecification({ name: 'OLT', resourceTypeId: 'missing' }),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 404 &&
      /resource type not found/.test(error.message),
  );
  await assert.rejects(
    () => service.createPhysicalResource({ name: 'OLT', resourceSpecificationId: 'missing' }),
    /resource specification not found/,
  );

  const spec = await service.createResourceSpecification({
    name: 'OLT',
    resourceTypeId: 'rt-olt',
    relatedParty: [{ id: party.id, '@referredType': 'Organization', role: 'owner' }],
  });
  const functionSpec = await service.createResourceFunctionSpecification({ name: 'Activation' });
  assert.equal(functionSpec.name, 'Activation');

  await assert.rejects(
    async () =>
      await service.createResourceSpecification({
        name: 'OLT',
        resourceTypeId: 'rt-olt',
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
        resourceTypeId: 'missing',
      }),
    /resource type not found/,
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

test('ResourceCatalog and ResourceCatalogNode domain operations, ordering and tree nesting', async () => {
  const repository = new ResourceRepository();
  const service = new ResourceService(repository, { appendEvent: vi.fn(() => undefined) } as never);

  const catalog = await service.createResourceCatalog({
    code: 'master-tree',
    name: 'Catálogo Mestre',
    description: 'Árvore de testes',
    isDefault: true,
  });

  assert.equal(catalog.code, 'master-tree');
  assert.equal(catalog.isDefault, true);

  // Criar nós GROUP raiz e filho
  const groupPassive = await service.createResourceCatalogNode(catalog.id, {
    code: 'group-passive',
    name: 'Infraestrutura Passiva',
    kind: 'GROUP',
    sortOrder: 1,
  });

  const groupBoxes = await service.createResourceCatalogNode(catalog.id, {
    code: 'group-boxes',
    name: 'Caixas Ópticas',
    kind: 'GROUP',
    parentNodeId: groupPassive.id,
    sortOrder: 1,
  });

  // Criar nós RESOURCE_TYPE folha apontando para CTO e Splitter
  const nodeCto = await service.createResourceCatalogNode(catalog.id, {
    code: 'node-cto',
    name: 'CTO (Caixa de Terminação Óptica)',
    kind: 'RESOURCE_TYPE',
    resourceTypeId: 'rt-cto',
    parentNodeId: groupBoxes.id,
    sortOrder: 2,
  });

  const nodeSplitter = await service.createResourceCatalogNode(catalog.id, {
    code: 'node-splitter',
    name: 'Splitter',
    kind: 'RESOURCE_TYPE',
    resourceTypeId: 'rt-splitter',
    parentNodeId: groupPassive.id,
    sortOrder: 2,
  });

  assert.equal(nodeCto.kind, 'RESOURCE_TYPE');
  assert.equal(nodeCto.resourceTypeId, 'rt-cto');
  assert.equal(nodeSplitter.parentNodeId, groupPassive.id);

  // Consultar árvore montada
  const tree = await service.getResourceCatalogTree(catalog.id);
  assert.equal(tree.length, 1); // groupPassive é a única raiz

  const root = tree[0]!;
  assert.equal(root.code, 'group-passive');
  assert.equal(root.children.length, 2); // groupBoxes e nodeSplitter
  assert.equal(root.children[0]?.code, 'group-boxes');
  assert.equal(root.children[0]?.children.length, 1);
  assert.equal(root.children[0]?.children[0]?.code, 'node-cto');

  // Caminho (path) até a folha node-cto
  const path = await service.getResourceCatalogNodePath(catalog.id, nodeCto.id);
  assert.deepEqual(
    path.nodes.map((n) => n.code),
    ['group-passive', 'group-boxes', 'node-cto'],
  );

  // Move / reorder: mover node-cto direto para groupPassive
  const moved = await service.moveResourceCatalogNode(catalog.id, nodeCto.id, {
    parentNodeId: groupPassive.id,
    sortOrder: 0,
  });
  assert.equal(moved.parentNodeId, groupPassive.id);
  assert.equal(moved.sortOrder, 0);

  // Prevenção de ciclo: tentar definir groupPassive como filho de groupBoxes
  await assert.rejects(
    () =>
      service.moveResourceCatalogNode(catalog.id, groupPassive.id, {
        parentNodeId: groupBoxes.id,
        sortOrder: 0,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_CATALOG_NODE_CYCLE',
  );

  // Prevenção de self-parent
  await assert.rejects(
    () =>
      service.moveResourceCatalogNode(catalog.id, groupBoxes.id, {
        parentNodeId: groupBoxes.id,
        sortOrder: 0,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_CATALOG_NODE_SELF_PARENT',
  );

  // Rejeição de folha como pai
  await assert.rejects(
    () =>
      service.createResourceCatalogNode(catalog.id, {
        code: 'invalid-child-of-leaf',
        name: 'Inválido',
        kind: 'GROUP',
        parentNodeId: nodeSplitter.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_CATALOG_NODE_PARENT_NOT_GROUP',
  );

  // Soft delete com bloqueio de GROUP que tem filhos
  await assert.rejects(
    () => service.deleteResourceCatalogNode(catalog.id, groupPassive.id),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_CATALOG_NODE_HAS_CHILDREN',
  );

  // Soft delete de folha permitido
  const deletedLeaf = await service.deleteResourceCatalogNode(catalog.id, nodeSplitter.id);
  assert.equal(deletedLeaf.status, 'inactive');
});

test('ResourceTypeCatalogContext returns consolidated paths and specifications for a type', async () => {
  const repository = new ResourceRepository();
  const service = new ResourceService(repository, { appendEvent: vi.fn(() => undefined) } as never);

  const catalog = await service.createResourceCatalog({
    code: 'main-catalog',
    name: 'Catálogo Principal',
  });

  const group = await service.createResourceCatalogNode(catalog.id, {
    code: 'grp-access',
    name: 'Acesso',
    kind: 'GROUP',
  });

  await service.createResourceCatalogNode(catalog.id, {
    code: 'leaf-olt',
    name: 'OLT Node',
    kind: 'RESOURCE_TYPE',
    resourceTypeId: 'rt-olt',
    parentNodeId: group.id,
  });

  const context = await service.getResourceTypeCatalogContext('rt-olt');
  assert.equal(context.resourceType.code, 'OLT');
  assert.equal(context.catalogPaths.length, 1);
  assert.equal(context.catalogPaths[0]?.catalog.code, 'main-catalog');
  assert.deepEqual(
    context.catalogPaths[0]?.nodes.map((n) => n.code),
    ['grp-access', 'leaf-olt'],
  );
});
