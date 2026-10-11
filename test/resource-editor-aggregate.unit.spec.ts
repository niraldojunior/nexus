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
  assert.equal((await service.deletePhysicalResource(saved.resource.id, context)).status, 'terminated');
  assert.ok(await service.getResource(saved.createdIds[1]!, context), 'filho removido não é excluído');
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
  assert.deepEqual(snapshot.siteRelationships.map((item) => item.site.name), ['Poste 1']);
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
  assert.equal(
    (await service.listResources({ name: 'CTO-DEVE-ROLLBACK' }, context)).length,
    0,
  );
});
