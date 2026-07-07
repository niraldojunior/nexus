import assert from 'node:assert/strict';
import { test } from 'vitest';
import { InMemoryEntityRepository } from '../src/shared/persistence/in-memory-entity-repository.js';

test('InMemoryEntityRepository tracks entities', () => {
  const repository = new InMemoryEntityRepository();
  const entity = repository.create({ label: 'bootstrap' });

  assert.equal(repository.count(), 1);
  assert.equal(repository.list()[0]?.id, entity.id);
  assert.equal(entity.label, 'bootstrap');
});
