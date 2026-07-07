import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { InMemoryEntityRepository } from '../src/shared/persistence/in-memory-entity-repository.js';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';
import { SqliteSearchRepository as SharedSqliteSearchRepository } from '../src/shared/persistence/sqlite-search-repository.js';
import { SqliteUserRepository } from '../src/shared/persistence/sqlite-user-repository.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  SqliteDatabase.resetForTesting();
});

const setupDatabase = async () => {
  const database = createTestDatabase('nexus-shared-persistence-');
  const sqlite = SqliteDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();
  return {
    sqlite,
    cleanup: () => {
      SqliteDatabase.resetForTesting();
      database.cleanup();
    },
  };
};

test('InMemoryEntityRepository cria, conta e entrega listas independentes', () => {
  const repository = new InMemoryEntityRepository();
  const first = repository.create({ label: 'bootstrap' });
  const second = repository.create({ label: 'shadow' });

  const snapshot = repository.list();
  snapshot.pop();

  assert.equal(repository.count(), 2);
  assert.equal(first.label, 'bootstrap');
  assert.equal(second.label, 'shadow');
  assert.equal(repository.list().length, 2);
});

test('SqliteUserRepository persiste e atualiza usuários', async () => {
  const { sqlite, cleanup } = await setupDatabase();

  try {
    const repository = new SqliteUserRepository(sqlite);
    const created = repository.create({
      externalId: 'ext-1',
      name: 'Operações',
      email: 'ops@vtal.com',
    });

    assert.equal(created.externalId, 'ext-1');
    assert.equal(repository.count(), 1);
    assert.equal(repository.getById(created.id)?.name, 'Operações');
    assert.equal(repository.getByExternalId('ext-1')?.email, 'ops@vtal.com');
    assert.equal(repository.list()[0]?.id, created.id);

    const updated = repository.update(created.id, { name: 'Operações NOC' });
    assert.equal(updated?.name, 'Operações NOC');
    assert.equal(repository.delete(created.id), true);
    assert.equal(repository.count(), 0);
    assert.equal(repository.getById(created.id), undefined);
  } finally {
    cleanup();
  }
});

test('SqliteSearchRepository persiste filtros, resultados e remoção em lote', async () => {
  const { sqlite, cleanup } = await setupDatabase();

  try {
    const users = new SqliteUserRepository(sqlite);
    const userOne = users.create({ externalId: 'user-1', name: 'Tenant One' });
    const userTwo = users.create({ externalId: 'user-2', name: 'Tenant Two' });

    const repository = new SharedSqliteSearchRepository(sqlite);
    const first = repository.create({
      userId: userOne.id,
      query: 'geographic site',
      filters: { domain: 'geo' },
      results: { total: 2 },
    });
    const second = repository.create({
      userId: userOne.id,
      query: 'service inventory',
      results: { total: 1 },
    });
    repository.create({
      userId: userTwo.id,
      query: 'resource inventory',
    });

    assert.equal(repository.count(), 3);
    assert.equal(repository.countByUserId(userOne.id), 2);
    assert.equal(repository.getById(first.id)?.filters?.domain, 'geo');
    assert.equal(repository.getById(second.id)?.results?.total, 1);
    assert.equal(repository.listByUserId(userOne.id).length, 2);
    assert.ok(repository.list().some((entry) => entry.userId === userTwo.id));

    const updated = repository.update(first.id, {
      query: 'geographic site updated',
      filters: { domain: 'geo', scope: 'site' },
    });
    assert.equal(updated?.query, 'geographic site updated');
    assert.equal(updated?.filters?.scope, 'site');
    assert.equal(repository.delete(second.id), true);
    assert.equal(repository.deleteByUserId(userTwo.id), 1);
    assert.equal(repository.count(), 1);
    assert.equal(repository.update('missing', { query: 'noop' }), undefined);
  } finally {
    cleanup();
  }
});
