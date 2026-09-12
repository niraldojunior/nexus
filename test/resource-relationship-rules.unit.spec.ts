import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { ResourceRepository } from '../src/modules/resource/repository.js';
import { ResourceService } from '../src/modules/resource/service.js';

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
  assert.equal(first.created, 3);
  assert.equal(first.relationshipTypes.length, 3);
  assert.ok(first.relationshipTypes.some((t) => t.code === 'containsAsChild' && t.inverseCode === 'containedBy'));
  assert.ok(first.relationshipTypes.some((t) => t.code === 'connectedTo' && t.symmetric === true));

  // Reexecutar não duplica — insert-if-missing protegido (C9).
  const second = await service.ensureBootstrapResourceRelationshipTypes(context);
  assert.equal(second.created, 0);
  assert.equal(second.relationshipTypes.length, 3);
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
