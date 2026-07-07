import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';
import { SqliteSearchRepository } from '../src/modules/search/sqlite-repository.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  SqliteDatabase.resetForTesting();
});

const setupRepository = async () => {
  const database = createTestDatabase('nexus-search-repository-');
  const sqlite = SqliteDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();
  return {
    sqlite,
    repository: new SqliteSearchRepository(sqlite),
    cleanup: () => {
      SqliteDatabase.resetForTesting();
      database.cleanup();
    },
  };
};

test('SqliteSearchRepository persiste, recarrega e arquiva sessões e mensagens', async () => {
  const { sqlite, repository, cleanup } = await setupRepository();

  try {
    const created = repository.createSession({
      '@type': 'ResearchSession',
      id: 'session-1',
      href: '/v1/search/sessions/session-1',
      userId: 'tenant-1',
      title: 'Sessão inicial',
      description: 'Descricao',
      context: 'Contexto',
      status: 'active',
      model: 'gpt-4o-mini',
      temperature: 0.4,
      maxTokens: 500,
    });

    assert.equal(created.description, 'Descricao');
    assert.equal(created.context, 'Contexto');
    assert.equal(created.model, 'gpt-4o-mini');
    assert.equal(created.temperature, 0.4);
    assert.equal(created.maxTokens, 500);
    assert.equal(repository.getSession('missing'), undefined);

    const storedMessage = repository.addMessage('session-1', {
      id: 'message-1',
      role: 'user',
      content: 'Como validar a triade?',
      tokensUsed: 18,
      metadata: { intent: 'coverage' },
    });

    assert.equal(storedMessage.researchSessionId, 'session-1');
    assert.equal(storedMessage.tokensUsed, 18);
    assert.deepEqual(storedMessage.metadata, { intent: 'coverage' });
    assert.equal(repository.getMessage('missing'), undefined);

    const session = repository.getSession('session-1');
    assert.equal(session?.messages?.length, 1);
    assert.equal(session?.messages?.[0]?.id, 'message-1');

    const renamed = repository.updateSessionTitle('session-1', 'Sessão atualizada');
    assert.equal(renamed?.title, 'Sessão atualizada');

    const archived = repository.archiveSession('session-1');
    assert.equal(archived?.status, 'archived');

    sqlite.run(
      `INSERT INTO research_session
       (id, href, user_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'deleted', ?, ?)`,
      [
        'session-deleted',
        '/v1/search/sessions/session-deleted',
        'tenant-1',
        'Sessão removida',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ],
    );

    const sessions = repository.listSessionsByUser('tenant-1');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.id, 'session-1');
    assert.equal(sessions[0]?.status, 'archived');
  } finally {
    cleanup();
  }
});

test('SqliteSearchRepository lista várias sessões por usuário com limite', async () => {
  const { repository, cleanup } = await setupRepository();

  try {
    repository.createSession({
      '@type': 'ResearchSession',
      id: 'session-a',
      href: '/v1/search/sessions/session-a',
      userId: 'tenant-2',
      title: 'Sessão A',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never);

    repository.createSession({
      '@type': 'ResearchSession',
      id: 'session-b',
      href: '/v1/search/sessions/session-b',
      userId: 'tenant-2',
      title: 'Sessão B',
      status: 'active',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    } as never);

    const sessions = repository.listSessionsByUser('tenant-2', 1);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.userId, 'tenant-2');
  } finally {
    cleanup();
  }
});
