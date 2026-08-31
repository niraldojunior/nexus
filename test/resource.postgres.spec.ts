import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { ResourceService } from '../src/modules/resource/service.js';
import { PostgresResourceRepository } from '../src/modules/resource/postgres-repository.js';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  PostgresDatabase.resetForTesting();
});

test('Resource repository persists validFor when a resource specification is terminated', async () => {
  const { databaseUrl, cleanup } = createTestDatabase('nexus-resource-spec-');
  const sqlite = PostgresDatabase.getInstance(databaseUrl);
  await sqlite.initialize();

  try {
    const repository = new PostgresResourceRepository(sqlite);
    const appendEvent = vi.fn(() => undefined);
    const service = new ResourceService(repository, { appendEvent } as never);

    const created = await service.createResourceSpecification({
      name: 'OLT MA5800',
      category: 'Equipment.Access',
      resourceType: 'OLT',
    });

    assert.equal(created.validFor, undefined);

    const terminated = await service.deleteResourceSpecification(created.id);
    assert.ok(terminated.validFor?.endDateTime);

    const persisted = await repository.getResourceSpecification(created.id);
    assert.ok(persisted?.validFor?.endDateTime);
    assert.equal(persisted?.validFor?.endDateTime, terminated.validFor?.endDateTime);
    assert.equal(
      (await repository.listResourceSpecifications({ category: 'Equipment.Access' })).length,
      0,
    );
    assert.equal(
      (
        await repository.listResourceSpecifications({
          category: 'Equipment.Access',
          includeEnded: true,
        })
      ).length,
      1,
    );
  } finally {
    PostgresDatabase.resetForTesting();
    cleanup();
  }
});

test('Resource repository projects splitter ports from bidirectional drop connections', async () => {
  const { databaseUrl, cleanup } = createTestDatabase('nexus-resource-ports-');
  const database = PostgresDatabase.getInstance(databaseUrl);
  await database.initialize();

  try {
    const repository = new PostgresResourceRepository(database);
    await repository.initialize();
    const service = new ResourceService(repository, { appendEvent: vi.fn(() => undefined) } as never);
    const ctoSpec = await service.createResourceSpecification({
      name: 'CTO de teste', category: 'Infrastructure.Passive', resourceType: 'CTO',
    });
    const splitterSpec = await service.createResourceSpecification({
      name: 'Splitter de teste', category: 'Infrastructure.Passive', resourceType: 'Splitter',
    });
    const portSpec = await service.createResourceSpecification({
      name: 'Porta de teste', category: 'Equipment.Access', resourceType: 'Port',
    });
    const dropSpec = await service.createResourceSpecification({
      name: 'Cabo drop de teste', category: 'Cable.OutsidePlant', resourceType: 'DropCable',
    });
    const ontSpec = await service.createResourceSpecification({
      name: 'ONT de teste', category: 'Equipment.CPE', resourceType: 'ONT',
    });
    const cto = await service.createPhysicalResource({ name: 'CTO-1', resourceSpecificationId: ctoSpec.id });
    const splitter = await service.createPhysicalResource({
      name: 'Splitter-1', resourceSpecificationId: splitterSpec.id,
      characteristic: [{ name: 'razao', value: '1:8', valueType: 'string' }],
    });
    const port = await service.createPhysicalResource({
      name: 'FO.O.1', resourceSpecificationId: portSpec.id,
      characteristic: [
        { name: 'role', value: 'FO.O', valueType: 'string' },
        { name: 'index', value: '1', valueType: 'string' },
      ],
    });
    const drop = await service.createPhysicalResource({
      name: 'DROP-1', resourceSpecificationId: dropSpec.id,
    });
    const ont = await service.createPhysicalResource({
      name: 'ONT-1', resourceSpecificationId: ontSpec.id,
    });
    await service.addResourceRelationship(cto.id, {
      id: splitter.id, relationshipType: 'containsAsChild', '@referredType': 'Resource',
    });
    await service.addResourceRelationship(splitter.id, {
      id: port.id, relationshipType: 'containsAsChild', '@referredType': 'Resource',
    });
    await service.addResourceRelationship(drop.id, {
      id: port.id, relationshipType: 'connectedTo', '@referredType': 'Resource',
    });
    await service.addResourceRelationship(drop.id, {
      id: ont.id, relationshipType: 'connectedTo', '@referredType': 'Resource',
    });

    const view = await repository.getResourcePortsView(cto.id);
    assert.equal(view?.groups.length, 1);
    assert.equal(view?.groups[0]?.ports[0]?.resource.usageState, 'active');
    assert.equal(view?.groups[0]?.ports[0]?.drops[0]?.resource.id, drop.id);
    assert.equal(view?.groups[0]?.ports[0]?.drops[0]?.ont?.id, ont.id);

    const detail = await repository.getResourcePortDetail(port.id);
    assert.equal(detail?.splitter?.id, splitter.id);
    assert.equal(detail?.cto?.id, cto.id);
    assert.equal(detail?.splitRatio, '1:8');
    assert.equal(detail?.drops[0]?.ont?.id, ont.id);
    assert.equal((await repository.listIncidentResourceRelationships(port.id)).length, 2);
  } finally {
    PostgresDatabase.resetForTesting();
    cleanup();
  }
});

test('Resource repository persists resource specification characteristics and related parties', async () => {
  const { databaseUrl, cleanup } = createTestDatabase('nexus-resource-spec-');
  const sqlite = PostgresDatabase.getInstance(databaseUrl);
  await sqlite.initialize();

  try {
    const repository = new PostgresResourceRepository(sqlite);
    const appendEvent = vi.fn(() => undefined);
    const service = new ResourceService(repository, { appendEvent } as never);

    const created = await service.createResourceSpecification({
      name: 'CPE',
      category: 'Equipment.CustomerPremises',
      resourceType: 'CPE',
      resourceSpecificationCharacteristic: [
        { name: 'manufacturer', value: 'V.tal', valueType: 'string', group: 'commercial' },
        { name: 'stockable', value: true, valueType: 'boolean', group: 'capability' },
      ],
      relatedParty: [{ id: 'party-1', '@referredType': 'Organization', role: 'manufacturer' }],
    });

    const persisted = await repository.getResourceSpecification(created.id);
    assert.equal(persisted?.resourceSpecificationCharacteristic.length, 2);
    assert.equal(persisted?.resourceSpecificationCharacteristic[0]?.name, 'manufacturer');
    assert.equal(persisted?.relatedParty.length, 1);
    assert.equal(persisted?.relatedParty[0]?.role, 'manufacturer');
  } finally {
    PostgresDatabase.resetForTesting();
    cleanup();
  }
});
