import assert from 'node:assert/strict';
import { InMemoryEntityRepository } from '../src/shared/persistence/in-memory-entity-repository.js';
const repository = new InMemoryEntityRepository();
const entity = repository.create({ label: 'bootstrap' });
assert.equal(repository.count(), 1);
assert.equal(repository.list()[0]?.id, entity.id);
assert.equal(entity.label, 'bootstrap');
//# sourceMappingURL=repository.spec.js.map