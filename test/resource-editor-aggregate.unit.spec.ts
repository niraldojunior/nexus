import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error.js';
import { getResourceTypeByCode } from '../src/modules/resource/catalog.js';
import { ResourceRepository } from '../src/modules/resource/repository.js';
import { ResourceService } from '../src/modules/resource/service.js';

const context = {
  actorSub: 'inventory-editor',
  tenantId: 'vtal',
  roles: ['inventory.editor'],
  traceId: 'trace-resource-editor',
};

const createEventService = () => ({
  appendEvent: vi.fn(async () => ({ id: 'event-1', eventTime: '2026-10-11T12:00:00.000Z' })),
});

const createTestSpec = async (repo: ResourceRepository, code: string, suffix = '') => {
  const resourceType = getResourceTypeByCode(code);
  assert.ok(resourceType, `ResourceType não encontrado: ${code}`);
  return await repo.upsertResourceSpecification({
    '@type': 'ResourceSpecification',
    id: `spec-${code.toLowerCase()}${suffix}`,
    href: `/resource-spec/spec-${code.toLowerCase()}${suffix}`,
    name: `Spec ${code}${suffix}`,
    resourceTypeId: resourceType.id,
    resourceType: {
      id: resourceType.id,
      href: resourceType.href,
      code: resourceType.code,
      name: resourceType.name,
      '@referredType': 'ResourceType',
    },
    resourceSpecificationCharacteristic: [],
    relatedParty: [],
  });
};

const typeId = (code: string): string => {
  const resourceType = getResourceTypeByCode(code);
  assert.ok(resourceType, `ResourceType não encontrado: ${code}`);
  return resourceType.id;
};

test('saveResourceAggregate cria árvore multinível atomicamente e o snapshot a recompõe', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);
  const ctoSpec = await createTestSpec(repo, 'CTO');
  const splitterSpec = await createTestSpec(repo, 'Splitter');
  const portSpec = await createTestSpec(repo, 'Port');

  await service.createResourceTypeRelationshipRule(
    typeId('CTO'),
    {
      relationshipTypeCode: 'containsAsChild',
      targetKind: 'RESOURCE_TYPE',
      targetId: typeId('Splitter'),
      cardinality: { maxTargetPerSource: 2 },
    },
    context,
  );
  await service.createResourceTypeRelationshipRule(
    typeId('Splitter'),
    {
      relationshipTypeCode: 'containsAsChild',
      targetKind: 'RESOURCE_TYPE',
      targetId: typeId('Port'),
      cardinality: { maxTargetPerSource: 8 },
    },
    context,
  );

  const saved = await service.saveResourceAggregate(
    {
      '@type': 'PhysicalResource',
      name: 'CTO-EDITOR-01',
      resourceSpecificationId: ctoSpec.id,
      components: [
        {
          name: 'SPLITTER-01',
          resourceSpecificationId: splitterSpec.id,
          children: [{ name: 'PORTA-01', resourceSpecificationId: portSpec.id }],
        },
      ],
    },
    context,
  );

  assert.equal(saved.createdIds.length, 3);
  const snapshot = await service.getResourceEditorSnapshot(saved.resource.id, context);
  assert.equal(snapshot.resource.name, 'CTO-EDITOR-01');
  assert.deepEqual(
    snapshot.components.map((component) => [component.name, component.depth]),
    [
      ['SPLITTER-01', 1],
      ['PORTA-01', 2],
    ],
  );

  await assert.rejects(
    service.deletePhysicalResource(saved.resource.id, context),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_HAS_ACTIVE_DEPENDENCIES',
  );

  await service.saveResourceAggregate(
    {
      id: saved.resource.id,
      '@type': 'PhysicalResource',
      name: saved.resource.name,
      resourceSpecificationId: ctoSpec.id,
      components: [],
    },
    context,
  );
  assert.equal(
    (await service.getResourceEditorSnapshot(saved.resource.id, context)).components.length,
    0,
  );
  assert.equal(
    (await service.deletePhysicalResource(saved.resource.id, context)).status,
    'terminated',
  );
  assert.ok(
    await service.getResource(saved.createdIds[1]!, context),
    'filho removido não é excluído',
  );
});

test('saveResourceAggregate persiste estados, motivo e characteristics do componente', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);
  const ctoSpec = await createTestSpec(repo, 'CTO', '-state');
  const splitterSpec = await createTestSpec(repo, 'Splitter', '-state');
  await service.createResourceTypeRelationshipRule(typeId('CTO'), {
    relationshipTypeCode: 'containsAsChild', targetKind: 'RESOURCE_TYPE', targetId: typeId('Splitter'),
  }, context);

  const created = await service.saveResourceAggregate({
    '@type': 'PhysicalResource', name: 'CTO-STATE-01', resourceSpecificationId: ctoSpec.id,
    components: [{
      name: 'SPLITTER-STATE-01', resourceSpecificationId: splitterSpec.id,
      status: 'suspended', statusCode: 'maintenance_window', administrativeState: 'locked', operationalState: 'disabled', usageState: 'busy',
      characteristic: [{ name: 'etiquetaOperacional', value: 'BLOQUEADO', valueType: 'string' }],
    }],
  }, context);
  const component = (await service.getResourceEditorSnapshot(created.resource.id, context)).components[0]!;
  assert.equal(component.status, 'suspended');
  assert.equal(component.statusCode, 'maintenance_window');
  assert.equal(component.administrativeState, 'locked');
  assert.equal(component.operationalState, 'disabled');
  assert.equal(component.usageState, 'busy');
  assert.deepEqual(component.characteristics, [{ name: 'etiquetaOperacional', value: 'BLOQUEADO', valueType: 'string' }]);

  await service.saveResourceAggregate({
    id: created.resource.id, '@type': 'PhysicalResource', name: created.resource.name, resourceSpecificationId: ctoSpec.id,
    components: [{
      id: component.id,
      ...(component.relationshipId ? { relationshipId: component.relationshipId } : {}),
      ...(component.relationshipDefinitionId ? { relationshipDefinitionId: component.relationshipDefinitionId } : {}),
      name: component.name, resourceSpecificationId: splitterSpec.id,
      status: 'active', statusCode: 'released', administrativeState: 'unlocked', operationalState: 'enabled', usageState: 'idle',
      characteristic: [{ name: 'etiquetaOperacional', value: 'LIBERADO', valueType: 'string' }],
    }],
  }, context);
  const updated = (await service.getResourceEditorSnapshot(created.resource.id, context)).components[0]!;
  assert.equal(updated.status, 'active');
  assert.equal(updated.statusCode, 'released');
  assert.equal(updated.administrativeState, 'unlocked');
  assert.equal(updated.operationalState, 'enabled');
  assert.equal(updated.usageState, 'idle');
  assert.deepEqual(updated.characteristics, [{ name: 'etiquetaOperacional', value: 'LIBERADO', valueType: 'string' }]);
});

test('saveResourceAggregate mantém a identidade da aresta, atualiza placement e não herda place', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never, {
    lookupPlace: async (id, tenantId) =>
      id === 'site-rack' && tenantId === 'vtal'
        ? { id, '@referredType': 'GeographicSite' }
        : undefined,
  });
  await service.ensureBootstrapResourceRelationshipTypes(context);
  const ctoSpec = await createTestSpec(repo, 'CTO', '-linear');
  const splitterSpec = await createTestSpec(repo, 'Splitter', '-linear');
  await service.createResourceTypeRelationshipRule(
    typeId('CTO'),
    {
      relationshipTypeCode: 'containsAsChild',
      targetKind: 'RESOURCE_TYPE',
      targetId: typeId('Splitter'),
      cardinality: { maxTargetPerSource: 2 },
      configuration: {
        version: 1,
        placementPolicy: 'LINEAR',
        axis: 'vertical',
        unitLabel: 'U',
        capacity: 42,
        numberingDirection: 'ascending',
      },
    },
    context,
  );

  const created = await service.saveResourceAggregate(
    {
      '@type': 'PhysicalResource',
      name: 'RACK-01',
      resourceSpecificationId: ctoSpec.id,
      placeId: 'site-rack',
      components: [
        {
          name: 'OLT-01',
          resourceSpecificationId: splitterSpec.id,
          placement: { placementPolicy: 'LINEAR', position: 10, span: 5 },
        },
      ],
    },
    context,
  );
  const first = await service.getResourceEditorSnapshot(created.resource.id, context);
  const olt = first.components[0]!;
  assert.equal(olt.placement?.placementPolicy, 'LINEAR');
  assert.ok(olt.relationshipId);
  assert.equal((await service.getResource(olt.id, context))?.place, undefined);
  const relationshipId = olt.relationshipId;

  await service.saveResourceAggregate(
    {
      id: created.resource.id,
      '@type': 'PhysicalResource',
      name: created.resource.name,
      resourceSpecificationId: ctoSpec.id,
      components: [
        {
          id: olt.id,
          relationshipId,
          ...(olt.relationshipDefinitionId
            ? { relationshipDefinitionId: olt.relationshipDefinitionId }
            : {}),
          name: olt.name,
          resourceSpecificationId: splitterSpec.id,
          placement: { placementPolicy: 'LINEAR', position: 14, span: 5 },
        },
      ],
    },
    context,
  );
  const moved = (await service.getResourceEditorSnapshot(created.resource.id, context)).components[0]!;
  assert.equal(moved.relationshipId, relationshipId);
  assert.deepEqual(moved.placement, { placementPolicy: 'LINEAR', position: 14, span: 5 });

  await assert.rejects(
    service.saveResourceAggregate(
      {
        id: created.resource.id,
        '@type': 'PhysicalResource',
        name: created.resource.name,
        resourceSpecificationId: ctoSpec.id,
        components: [
          {
            id: olt.id,
            relationshipId,
            name: olt.name,
            resourceSpecificationId: splitterSpec.id,
            placement: { placementPolicy: 'LINEAR', position: 40, span: 5 },
          },
        ],
      },
      context,
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_RELATIONSHIP_PLACEMENT_OUT_OF_BOUNDS',
  );
});

test('saveResourceAggregate rejeita colisão e limites GRID da mesma contenção', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);
  const boardSpec = await createTestSpec(repo, 'CTO', '-grid');
  const portSpec = await createTestSpec(repo, 'Port', '-grid');
  await service.createResourceTypeRelationshipRule(
    typeId('CTO'),
    {
      relationshipTypeCode: 'containsAsChild',
      targetKind: 'RESOURCE_TYPE',
      targetId: typeId('Port'),
      cardinality: { maxTargetPerSource: 8 },
      configuration: {
        version: 1,
        placementPolicy: 'GRID',
        rows: 2,
        columns: 8,
        fillOrder: 'row-major',
      },
    },
    context,
  );

  const input = {
    '@type': 'PhysicalResource' as const,
    name: 'BOARD-01',
    resourceSpecificationId: boardSpec.id,
  };
  await assert.rejects(
    service.saveResourceAggregate(
      {
        ...input,
        components: [
          {
            name: 'PORTA-01',
            resourceSpecificationId: portSpec.id,
            placement: { placementPolicy: 'GRID', row: 1, column: 1 },
          },
          {
            name: 'PORTA-02',
            resourceSpecificationId: portSpec.id,
            placement: { placementPolicy: 'GRID', row: 1, column: 1 },
          },
        ],
      },
      context,
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_RELATIONSHIP_PLACEMENT_OVERLAP',
  );
  await assert.rejects(
    service.saveResourceAggregate(
      {
        ...input,
        components: [
          {
            name: 'PORTA-FORA',
            resourceSpecificationId: portSpec.id,
            placement: { placementPolicy: 'GRID', row: 2, column: 8, columnSpan: 2 },
          },
        ],
      },
      context,
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_RELATIONSHIP_PLACEMENT_OUT_OF_BOUNDS',
  );
});

test('saveResourceAggregate valida GeographicSiteSpecification e persiste relação adicional', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never, {
    lookupGeoSiteSpecification: async (id) =>
      id === 'geo-spec-pole' ? { id, name: 'Poste' } : undefined,
    lookupGeoSite: async (id, tenantId) =>
      id === 'site-pole-1' && tenantId === 'vtal'
        ? {
            id,
            name: 'Poste 1',
            siteSpecificationId: 'geo-spec-pole',
            status: 'active',
          }
        : undefined,
  });
  await service.ensureBootstrapResourceRelationshipTypes(context);
  const ctoSpec = await createTestSpec(repo, 'CTO');
  await service.createResourceTypeRelationshipRule(
    typeId('CTO'),
    {
      relationshipTypeCode: 'mountedOn',
      targetKind: 'GEOGRAPHIC_SITE_SPECIFICATION',
      targetId: 'geo-spec-pole',
      cardinality: { maxTargetPerSource: 1 },
    },
    context,
  );

  const saved = await service.saveResourceAggregate(
    {
      '@type': 'PhysicalResource',
      name: 'CTO-NO-POSTE',
      resourceSpecificationId: ctoSpec.id,
      siteRelationships: [{ siteId: 'site-pole-1', relationshipType: 'mountedOn' }],
    },
    context,
  );
  const snapshot = await service.getResourceEditorSnapshot(saved.resource.id, context);
  assert.deepEqual(
    snapshot.siteRelationships.map((item) => item.site.name),
    ['Poste 1'],
  );
});

test('saveResourceAggregate persiste e remove o vendor sem alterar o local instalado', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never, {
    lookupPlace: async (id, tenantId) =>
      id === 'site-1' && tenantId === 'vtal'
        ? { id, '@referredType': 'GeographicSite' }
        : undefined,
  });
  const ctoSpec = await createTestSpec(repo, 'CTO', '-vendor');

  const created = await service.saveResourceAggregate(
    {
      '@type': 'PhysicalResource',
      name: 'CTO-COM-FORNECEDOR',
      resourceSpecificationId: ctoSpec.id,
      placeId: 'site-1',
      relatedParty: [
        {
          id: 'vendor-1',
          name: 'Fornecedor Óptico',
          '@referredType': 'Organization',
          role: 'vendor',
        },
      ],
    },
    context,
  );

  assert.deepEqual(created.resource.relatedParty, [
    {
      id: 'vendor-1',
      name: 'Fornecedor Óptico',
      '@referredType': 'Organization',
      role: 'vendor',
    },
  ]);
  assert.equal(created.resource.place?.id, 'site-1');

  const updated = await service.saveResourceAggregate(
    {
      id: created.resource.id,
      '@type': 'PhysicalResource',
      name: created.resource.name,
      resourceSpecificationId: ctoSpec.id,
      relatedParty: [],
    },
    context,
  );

  assert.deepEqual(updated.resource.relatedParty, []);
  assert.equal(updated.resource.place?.id, 'site-1');
});

test('saveResourceAggregate faz rollback quando cardinalidade global falha durante a transação', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);
  const ctoSpec = await createTestSpec(repo, 'CTO');
  const poleSpec = await createTestSpec(repo, 'Pole');
  await service.createResourceTypeRelationshipRule(
    typeId('CTO'),
    {
      relationshipTypeCode: 'supports',
      targetKind: 'RESOURCE_TYPE',
      targetId: typeId('Pole'),
      cardinality: { maxSourcePerTarget: 1 },
    },
    context,
  );
  const pole = await service.createPhysicalResource(
    { name: 'POSTE-ALVO', resourceSpecificationId: poleSpec.id },
    context,
  );
  const existing = await service.createPhysicalResource(
    { name: 'CTO-EXISTENTE', resourceSpecificationId: ctoSpec.id },
    context,
  );
  await service.addResourceRelationship(
    existing.id,
    { id: pole.id, relationshipType: 'supports', '@referredType': 'Resource' },
    context,
  );
  const before = await service.countResources(undefined, context);

  await assert.rejects(
    service.saveResourceAggregate(
      {
        '@type': 'PhysicalResource',
        name: 'CTO-DEVE-ROLLBACK',
        resourceSpecificationId: ctoSpec.id,
        relationships: [{ targetId: pole.id, relationshipType: 'supports' }],
      },
      context,
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RESOURCE_RELATIONSHIP_CARDINALITY_EXCEEDED',
  );

  assert.equal(await service.countResources(undefined, context), before);
  assert.equal((await service.listResources({ name: 'CTO-DEVE-ROLLBACK' }, context)).length, 0);
});
