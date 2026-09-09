import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import { OracleSearchRepository } from '../src/modules/search/oracle-repository.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// Oracle round-trip coverage for the research-session repository (Nexus Copilot chat history).
// Runs against a real Oracle instance, same pattern as oracle-roundtrip.spec.ts — skips unless
// ORACLE_* is configured, so `npm run test:unit` never tries to connect. Run with
// `npm run test:oracle`.
const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

test.skipIf(!oracleConfigured)(
  'OracleSearchRepository persiste, recarrega e arquiva sessões e mensagens',
  async () => {
    const client = await getOracleTestClient();
    const repository = new OracleSearchRepository(client);

    const created = await repository.createSession({
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
    assert.equal(await repository.getSession('missing'), undefined);

    const storedMessage = await repository.addMessage('session-1', {
      id: 'message-1',
      role: 'user',
      content: 'Como validar a triade?',
      tokensUsed: 18,
      metadata: { intent: 'coverage' },
    });

    assert.equal(storedMessage.researchSessionId, 'session-1');
    assert.equal(storedMessage.tokensUsed, 18);
    assert.deepEqual(storedMessage.metadata, { intent: 'coverage' });
    assert.equal(await repository.getMessage('missing'), undefined);

    const session = await repository.getSession('session-1');
    assert.equal(session?.messages?.length, 1);
    assert.equal(session?.messages?.[0]?.id, 'message-1');

    const renamed = await repository.updateSessionTitle('session-1', 'Sessão atualizada');
    assert.equal(renamed?.title, 'Sessão atualizada');

    const archived = await repository.archiveSession('session-1');
    assert.equal(archived?.status, 'archived');

    await client.run(
      `INSERT INTO research_session
       (id, user_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, 'deleted', ?, ?)`,
      [
        'session-deleted',
        'tenant-1',
        'Sessão removida',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ],
    );

    const sessions = await repository.listSessionsByUser('tenant-1');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.id, 'session-1');
    assert.equal(sessions[0]?.status, 'archived');
  },
);

test.skipIf(!oracleConfigured)(
  'OracleSearchRepository lista várias sessões por usuário com limite',
  async () => {
    const client = await getOracleTestClient();
    const repository = new OracleSearchRepository(client);

    await repository.createSession({
      '@type': 'ResearchSession',
      id: 'session-a',
      href: '/v1/search/sessions/session-a',
      userId: 'tenant-2',
      title: 'Sessão A',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never);

    await repository.createSession({
      '@type': 'ResearchSession',
      id: 'session-b',
      href: '/v1/search/sessions/session-b',
      userId: 'tenant-2',
      title: 'Sessão B',
      status: 'active',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    } as never);

    const sessions = await repository.listSessionsByUser('tenant-2', 1);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.userId, 'tenant-2');
  },
);
