import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { ResourceService } from '../src/modules/resource/service.js';
import { SqliteResourceRepository } from '../src/modules/resource/sqlite-repository.js';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  SqliteDatabase.resetForTesting();
});

test('Resource repository persists validFor when a resource specification is terminated', async () => {
  const { databaseUrl, cleanup } = createTestDatabase('nexus-resource-spec-');
  const sqlite = SqliteDatabase.getInstance(databaseUrl);
  await sqlite.initialize();

  try {
    const repository = new SqliteResourceRepository(sqlite);
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
    SqliteDatabase.resetForTesting();
    cleanup();
  }
});

test('Resource repository persists resource specification characteristics and related parties', async () => {
  const { databaseUrl, cleanup } = createTestDatabase('nexus-resource-spec-');
  const sqlite = SqliteDatabase.getInstance(databaseUrl);
  await sqlite.initialize();

  try {
    const repository = new SqliteResourceRepository(sqlite);
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
    SqliteDatabase.resetForTesting();
    cleanup();
  }
});
