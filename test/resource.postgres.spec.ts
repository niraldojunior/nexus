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

    const created = service.createResourceSpecification({
      name: 'OLT MA5800',
      category: 'Equipment.Access',
      resourceType: 'OLT',
    });

    assert.equal(created.validFor, undefined);

    const terminated = service.deleteResourceSpecification(created.id);
    assert.ok(terminated.validFor?.endDateTime);

    const persisted = repository.getResourceSpecification(created.id);
    assert.ok(persisted?.validFor?.endDateTime);
    assert.equal(persisted?.validFor?.endDateTime, terminated.validFor?.endDateTime);
    assert.equal(repository.listResourceSpecifications({ category: 'Equipment.Access' }).length, 0);
    assert.equal(repository.listResourceSpecifications({ category: 'Equipment.Access', includeEnded: true }).length, 1);
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

    const created = service.createResourceSpecification({
      name: 'CPE',
      category: 'Equipment.CustomerPremises',
      resourceType: 'CPE',
      resourceSpecificationCharacteristic: [
        { name: 'manufacturer', value: 'V.tal', valueType: 'string', group: 'commercial' },
        { name: 'stockable', value: true, valueType: 'boolean', group: 'capability' },
      ],
      relatedParty: [{ id: 'party-1', '@referredType': 'Organization', role: 'manufacturer' }],
    });

    const persisted = repository.getResourceSpecification(created.id);
    assert.equal(persisted?.resourceSpecificationCharacteristic.length, 2);
    assert.equal(persisted?.resourceSpecificationCharacteristic[0]?.name, 'manufacturer');
    assert.equal(persisted?.relatedParty.length, 1);
    assert.equal(persisted?.relatedParty[0]?.role, 'manufacturer');
  } finally {
    PostgresDatabase.resetForTesting();
    cleanup();
  }
});
