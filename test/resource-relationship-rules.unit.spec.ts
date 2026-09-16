import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error.js';
import { ResourceRepository } from '../src/modules/resource/repository.js';
import { ResourceService } from '../src/modules/resource/service.js';
import { getResourceTypeByCode } from '../src/modules/resource/catalog.js';

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

const createTestSpec = async (repo: ResourceRepository, code: string) => {
  const rt = resourceTypeByCode(code);
  return await repo.upsertResourceSpecification({
    '@type': 'ResourceSpecification',
    id: `spec-${code.toLowerCase()}`,
    href: `/resource-spec/spec-${code.toLowerCase()}`,
    name: `Spec ${code}`,
    resourceTypeId: rt.id,
    resourceType: rt,
    resourceSpecificationCharacteristic: [],
    relatedParty: [],
  });
};

const context = {
  actorSub: 'user-admin',
  tenantId: 'vtal',
  roles: ['studio.admin', 'inventory.admin', 'catalog.admin'],
  traceId: 'trace-res-rel-rules',
};

const createEventService = () => ({
  appendEvent: vi.fn(async () => ({ id: 'event-1', eventTime: '2026-09-11T12:00:00.000Z' })),
});

test('ResourceService.ensureBootstrapResourceRelationshipTypes: seeds canonical types idempotently', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);

  const first = await service.ensureBootstrapResourceRelationshipTypes(context);
  assert.equal(first.created, 11);
  assert.equal(first.relationshipTypes.length, 11);
  assert.ok(first.relationshipTypes.some((t) => t.code === 'containsAsChild' && t.inverseCode === 'containedBy'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'connectedTo' && t.symmetric === true));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'mountedOn' && t.inverseCode === 'supports'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'supports' && t.inverseCode === 'mountedOn'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'fedBy' && t.inverseCode === 'feeds'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'feeds' && t.inverseCode === 'fedBy'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'serves' && t.inverseCode === 'servedBy'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'servedBy' && t.inverseCode === 'serves'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'terminatesOn' && t.inverseCode === 'terminates'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'terminates' && t.inverseCode === 'terminatesOn'));

  // Reexecutar não duplica — insert-if-missing protegido (C9).
  const second = await service.ensureBootstrapResourceRelationshipTypes(context);
  assert.equal(second.created, 0);
  assert.equal(second.relationshipTypes.length, 11);
});

test('ResourceService.retireResourceRelationshipType: rejects retiring a bootstrap-protected type', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);

  await assert.rejects(
    service.retireResourceRelationshipType('containsAsChild', context),
    /bootstrap/i,
  );
});

test('ResourceService.createResourceRelationshipType/retire: custom type follows soft-retire (C6), not physical delete', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);

  const created = await service.createResourceRelationshipType(
    {
      code: 'poweredBy',
      name: 'Alimentado por',
      inverseCode: 'powers',
      allowedTargetKinds: ['RESOURCE_TYPE'],
    },
    context,
  );
  assert.equal(created.lifecycleStatus, 'Active');

  const retired = await service.retireResourceRelationshipType('poweredBy', context);
  assert.equal(retired.lifecycleStatus, 'Retired');

  // Continua existindo (soft), só não é reutilizável para novas regras.
  const all = await service.listResourceRelationshipTypes(context);
  assert.ok(all.some((t) => t.code === 'poweredBy' && t.lifecycleStatus === 'Retired'));
});

test('ResourceService.createResourceTypeRelationshipRule: RESOURCE_TYPE target validates existence and rejects duplicates', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);

  const types = await service.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;
  const spliceType = types.find((t) => t.code === 'SpliceClosure') ?? types[1]!;

  const rule = await service.createResourceTypeRelationshipRule(
    ctoType.id,
    { relationshipTypeCode: 'connectedTo', targetKind: 'RESOURCE_TYPE', targetId: spliceType.id },
    context,
  );
  assert.equal(rule.lifecycleStatus, 'Active');
  assert.equal(rule.sourceResourceTypeId, ctoType.id);

  // Alvo inexistente é rejeitado.
  await assert.rejects(
    service.createResourceTypeRelationshipRule(
      ctoType.id,
      { relationshipTypeCode: 'connectedTo', targetKind: 'RESOURCE_TYPE', targetId: 'does-not-exist' },
      context,
    ),
  );

  // Duplicata ativa (mesma tripla source/relationshipType/target) é rejeitada.
  await assert.rejects(
    service.createResourceTypeRelationshipRule(
      ctoType.id,
      { relationshipTypeCode: 'connectedTo', targetKind: 'RESOURCE_TYPE', targetId: spliceType.id },
      context,
    ),
  );
});

test('ResourceService.createResourceTypeRelationshipRule: GEOGRAPHIC_SITE_SPECIFICATION target uses the injected lookup port, never a hardcoded Geo import', async () => {
  const repo = new ResourceRepository();
  const lookupGeoSiteSpecification = vi.fn(async (id: string) =>
    id === 'geo-spec-cto-box' ? { id, name: 'Caixa CTO' } : undefined,
  );
  const service = new ResourceService(repo, createEventService() as never, {
    lookupGeoSiteSpecification,
  });
  await service.ensureBootstrapResourceRelationshipTypes(context);

  const types = await service.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;

  const rule = await service.createResourceTypeRelationshipRule(
    ctoType.id,
    {
      relationshipTypeCode: 'containedBy',
      targetKind: 'GEOGRAPHIC_SITE_SPECIFICATION',
      targetId: 'geo-spec-cto-box',
    },
    context,
  );
  assert.equal(rule.targetKind, 'GEOGRAPHIC_SITE_SPECIFICATION');
  assert.equal(rule.targetId, 'geo-spec-cto-box');
  assert.equal(lookupGeoSiteSpecification.mock.calls.length, 1);

  // Spec Geo inexistente -> 404 de domínio, sem vazar a entidade Geo pro módulo Resource.
  await assert.rejects(
    service.createResourceTypeRelationshipRule(
      ctoType.id,
      {
        relationshipTypeCode: 'containedBy',
        targetKind: 'GEOGRAPHIC_SITE_SPECIFICATION',
        targetId: 'geo-spec-unknown',
      },
      context,
    ),
    /geographic site specification not found/i,
  );
});

test('ResourceService.createResourceTypeRelationshipRule: without an injected Geo port, a GEOGRAPHIC_SITE_SPECIFICATION target always fails closed', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never); // sem lookupGeoSiteSpecification
  await service.ensureBootstrapResourceRelationshipTypes(context);

  const types = await service.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;

  await assert.rejects(
    service.createResourceTypeRelationshipRule(
      ctoType.id,
      { relationshipTypeCode: 'containedBy', targetKind: 'GEOGRAPHIC_SITE_SPECIFICATION', targetId: 'any-id' },
      context,
    ),
    /geographic site specification not found/i,
  );
});

test('ResourceService.updateResourceTypeRelationshipRule: retiring is soft (C6) — excluded by default, visible with includeRetired', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);

  const types = await service.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;
  const spliceType = types.find((t) => t.code === 'SpliceClosure') ?? types[1]!;

  const rule = await service.createResourceTypeRelationshipRule(
    ctoType.id,
    { relationshipTypeCode: 'connectedTo', targetKind: 'RESOURCE_TYPE', targetId: spliceType.id },
    context,
  );

  await service.updateResourceTypeRelationshipRule(
    ctoType.id,
    rule.id,
    { lifecycleStatus: 'Retired' },
    context,
  );

  const activeOnly = await service.listResourceTypeRelationshipRules(ctoType.id, context);
  assert.equal(activeOnly.some((r) => r.id === rule.id), false);

  const withRetired = await service.listResourceTypeRelationshipRules(ctoType.id, context, true);
  const retired = withRetired.find((r) => r.id === rule.id);
  assert.ok(retired);
  assert.equal(retired?.lifecycleStatus, 'Retired');
});

test('ResourceService.createResourceTypeRelationshipRule / update: validates and persists cardinality', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);
  await service.ensureBootstrapResourceRelationshipTypes(context);

  const types = await service.listResourceTypes(context);
  const ctoType = types.find((t) => t.code === 'CTO') ?? types[0]!;
  const splitterType = types.find((t) => t.code === 'Splitter') ?? types[1]!;

  // Cardinalidade inválida (0, negativa, decimal, não-inteiro) é rejeitada com 400
  await assert.rejects(
    service.createResourceTypeRelationshipRule(
      ctoType.id,
      {
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: splitterType.id,
        cardinality: { maxTargetPerSource: 0 },
      },
      context,
    ),
    (err: unknown) =>
      err instanceof AppError &&
      err.code === 'RESOURCE_RELATIONSHIP_CARDINALITY_INVALID' &&
      err.statusCode === 400,
  );

  await assert.rejects(
    service.createResourceTypeRelationshipRule(
      ctoType.id,
      {
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: splitterType.id,
        cardinality: { maxTargetPerSource: -5 },
      },
      context,
    ),
    (err: unknown) =>
      err instanceof AppError &&
      err.code === 'RESOURCE_RELATIONSHIP_CARDINALITY_INVALID' &&
      err.statusCode === 400,
  );

  await assert.rejects(
    service.createResourceTypeRelationshipRule(
      ctoType.id,
      {
        relationshipTypeCode: 'containsAsChild',
        targetKind: 'RESOURCE_TYPE',
        targetId: splitterType.id,
        cardinality: { maxTargetPerSource: 1.5 },
      },
      context,
    ),
    (err: unknown) =>
      err instanceof AppError &&
      err.code === 'RESOURCE_RELATIONSHIP_CARDINALITY_INVALID' &&
      err.statusCode === 400,
  );

  // Criação com cardinalidade válida (inteiro positivo)
  const created = await service.createResourceTypeRelationshipRule(
    ctoType.id,
    {
      relationshipTypeCode: 'containsAsChild',
      targetKind: 'RESOURCE_TYPE',
      targetId: splitterType.id,
      cardinality: { maxTargetPerSource: 8 },
    },
    context,
  );
  assert.equal(created.cardinality?.maxTargetPerSource, 8);

  // Update de cardinalidade
  const updated = await service.updateResourceTypeRelationshipRule(
    ctoType.id,
    created.id,
    {
      cardinality: { maxTargetPerSource: 16 },
    },
    context,
  );
  assert.equal(updated.cardinality?.maxTargetPerSource, 16);

  // Update com cardinalidade inválida é rejeitado
  await assert.rejects(
    service.updateResourceTypeRelationshipRule(
      ctoType.id,
      created.id,
      {
        cardinality: { maxTargetPerSource: -1 },
      },
      context,
    ),
    (err: unknown) =>
      err instanceof AppError &&
      err.code === 'RESOURCE_RELATIONSHIP_CARDINALITY_INVALID' &&
      err.statusCode === 400,
  );
});

test('ResourceService: getResourceConnectionsView resolves non-containment bidirectional relationships', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);

  const specCto = await createTestSpec(repo, 'CTO');
  const specPole = await createTestSpec(repo, 'Pole');
  const specCable = await createTestSpec(repo, 'OpticalCable');
  const specSplitter = await createTestSpec(repo, 'Splitter');

  const cto = await service.createPhysicalResource(
    { name: 'CTO-01', resourceSpecificationId: specCto.id },
    context,
  );
  const pole = await service.createPhysicalResource(
    { name: 'POSTE-01', resourceSpecificationId: specPole.id },
    context,
  );
  const cable = await service.createPhysicalResource(
    { name: 'CABO-01', resourceSpecificationId: specCable.id },
    context,
  );
  const splitter = await service.createPhysicalResource(
    { name: 'SPLITTER-01', resourceSpecificationId: specSplitter.id },
    context,
  );

  // CTO mountedOn POSTE (outgoing de CTO)
  await service.addResourceRelationship(
    cto.id,
    { id: pole.id, relationshipType: 'mountedOn', '@referredType': 'Resource' },
    context,
  );
  // CABO feeds CTO (incoming em CTO)
  await service.addResourceRelationship(
    cable.id,
    { id: cto.id, relationshipType: 'feeds', '@referredType': 'Resource' },
    context,
  );
  // CTO containsAsChild SPLITTER (deve ser excluído de conexões)
  await service.addResourceRelationship(
    cto.id,
    { id: splitter.id, relationshipType: 'containsAsChild', '@referredType': 'Resource' },
    context,
  );

  const view = await service.getResourceConnectionsView(cto.id, context);
  assert.equal(view['@type'], 'ResourceConnectionsView');
  assert.equal(view.resourceId, cto.id);
  assert.equal(view.connections.length, 2);

  const outgoing = view.connections.find((c) => c.direction === 'outgoing');
  assert.ok(outgoing);
  assert.equal(outgoing.relationshipType, 'mountedOn');
  assert.equal(outgoing.resource.id, pole.id);

  const incoming = view.connections.find((c) => c.direction === 'incoming');
  assert.ok(incoming);
  assert.equal(incoming.relationshipType, 'feeds');
  assert.equal(incoming.resource.id, cable.id);
});

test('ResourceService: getResourceComponentsView traverses containsAsChild tree recursively with depth & deduplication', async () => {
  const repo = new ResourceRepository();
  const service = new ResourceService(repo, createEventService() as never);

  const specCto = await createTestSpec(repo, 'CTO');
  const specSplitter = await createTestSpec(repo, 'Splitter');
  const specPort = await createTestSpec(repo, 'Port');

  const cto = await service.createPhysicalResource(
    { name: 'CTO-01', resourceSpecificationId: specCto.id },
    context,
  );
  const splitter = await service.createPhysicalResource(
    { name: 'SPLITTER-01', resourceSpecificationId: specSplitter.id },
    context,
  );
  const port = await service.createPhysicalResource(
    {
      name: 'PORTA-01',
      resourceSpecificationId: specPort.id,
      characteristic: [
        { name: 'role', value: 'FO.O' },
        { name: 'index', value: 1 },
      ],
    },
    context,
  );

  // CTO -> Splitter -> Port
  await service.addResourceRelationship(
    cto.id,
    { id: splitter.id, relationshipType: 'containsAsChild', '@referredType': 'Resource' },
    context,
  );
  await service.addResourceRelationship(
    splitter.id,
    { id: port.id, relationshipType: 'containsAsChild', '@referredType': 'Resource' },
    context,
  );
  // Ciclo artificial: Port -> CTO (não deve travar)
  await service.addResourceRelationship(
    port.id,
    { id: cto.id, relationshipType: 'containsAsChild', '@referredType': 'Resource' },
    context,
  );

  const view = await service.getResourceComponentsView(cto.id, undefined, context);
  assert.equal(view['@type'], 'ResourceComponentsView');
  assert.equal(view.resourceId, cto.id);
  assert.equal(view.components.length, 2);

  const splitterNode = view.components.find((c) => c.id === splitter.id);
  assert.ok(splitterNode);
  assert.equal(splitterNode.depth, 1);
  assert.equal(splitterNode.parentId, cto.id);

  const portNode = view.components.find((c) => c.id === port.id);
  assert.ok(portNode);
  assert.equal(portNode.depth, 2);
  assert.equal(portNode.parentId, splitter.id);
  assert.equal(portNode.portInfo?.role, 'FO.O');
  assert.equal(portNode.portInfo?.index, 1);
});
