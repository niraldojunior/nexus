import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { InMemoryEntityRepository } from '../src/shared/persistence/in-memory-entity-repository.js';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { PostgresSearchRepository as SharedSqliteSearchRepository } from '../src/shared/persistence/postgres-search-repository.js';
import { PostgresUserRepository } from '../src/shared/persistence/postgres-user-repository.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  PostgresDatabase.resetForTesting();
});

const setupDatabase = async () => {
  const database = createTestDatabase('nexus-shared-persistence-');
  const sqlite = PostgresDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();
  return {
    sqlite,
    cleanup: () => {
      PostgresDatabase.resetForTesting();
      database.cleanup();
    },
  };
};

test('InMemoryEntityRepository cria, conta e entrega listas independentes', async () => {
  const repository = new InMemoryEntityRepository();
  const first = await repository.create({ label: 'bootstrap' });
  const second = await repository.create({ label: 'shadow' });

  const snapshot = await repository.list();
  snapshot.pop();

  assert.equal(repository.count(), 2);
  assert.equal(first.label, 'bootstrap');
  assert.equal(second.label, 'shadow');
  assert.equal(repository.list().length, 2);
});

test('PostgresUserRepository persiste e atualiza usuários', async () => {
  const { sqlite, cleanup } = await setupDatabase();

  try {
    const repository = new PostgresUserRepository(sqlite);
    const created = await repository.create({
      externalId: 'ext-1',
      name: 'Operações',
      email: 'ops@vtal.com',
    });

    assert.equal(created.externalId, 'ext-1');
    assert.equal(await repository.count(), 1);
    assert.equal((await repository.getById(created.id))?.name, 'Operações');
    assert.equal((await repository.getByExternalId('ext-1'))?.email, 'ops@vtal.com');
    assert.equal((await repository.list())[0]?.id, created.id);

    const updated = await repository.update(created.id, { name: 'Operações NOC' });
    assert.equal(updated?.name, 'Operações NOC');
    assert.equal(await repository.delete(created.id), true);
    assert.equal(await repository.count(), 0);
    assert.equal(await repository.getById(created.id), undefined);
  } finally {
    cleanup();
  }
});

test('PostgresSearchRepository persiste filtros, resultados e remoção em lote', async () => {
  const { sqlite, cleanup } = await setupDatabase();

  try {
    const users = new PostgresUserRepository(sqlite);
    const userOne = await users.create({ externalId: 'user-1', name: 'Tenant One' });
    const userTwo = await users.create({ externalId: 'user-2', name: 'Tenant Two' });

    const repository = new SharedSqliteSearchRepository(sqlite);
    const first = await repository.create({
      userId: userOne.id,
      query: 'geographic site',
      filters: { domain: 'geo' },
      results: { total: 2 },
    });
    const second = await repository.create({
      userId: userOne.id,
      query: 'service inventory',
      results: { total: 1 },
    });
    await repository.create({
      userId: userTwo.id,
      query: 'resource inventory',
    });

    assert.equal(await repository.count(), 3);
    assert.equal(await repository.countByUserId(userOne.id), 2);
    assert.equal((await repository.getById(first.id))?.filters?.domain, 'geo');
    assert.equal((await repository.getById(second.id))?.results?.total, 1);
    assert.equal((await repository.listByUserId(userOne.id)).length, 2);
    assert.ok((await repository.list()).some((entry) => entry.userId === userTwo.id));

    const updated = await repository.update(first.id, {
      query: 'geographic site updated',
      filters: { domain: 'geo', scope: 'site' },
    });
    assert.equal(updated?.query, 'geographic site updated');
    assert.equal(updated?.filters?.scope, 'site');
    assert.equal(await repository.delete(second.id), true);
    assert.equal(await repository.deleteByUserId(userTwo.id), 1);
    assert.equal(await repository.count(), 1);
    assert.equal(await repository.update('missing', { query: 'noop' }), undefined);
  } finally {
    cleanup();
  }
});
