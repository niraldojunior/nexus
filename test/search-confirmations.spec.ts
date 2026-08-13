import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { ResearchMessage, ResearchSession } from '../src/modules/search/domain.js';
import { SearchService } from '../src/modules/search/index.js';
import type { PostgresSearchRepository } from '../src/modules/search/postgres-repository.js';

test('SearchService preserva todas as confirmacoes preparadas no mesmo turno', async () => {
  const session: ResearchSession = {
    '@type': 'ResearchSession',
    id: 'session-multiple-confirmations',
    href: '/v1/search/sessions/session-multiple-confirmations',
    userId: 'tenant-1',
    title: 'Operacoes geograficas',
    status: 'active',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const repository = {
    getSession: vi.fn().mockReturnValue(session),
    addMessage: vi
      .fn()
      .mockImplementation((sessionId: string, message: ResearchMessage & { id: string }) => ({
        ...message,
        '@type': 'ResearchMessage',
        researchSessionId: sessionId,
        createdAt: '2026-01-01T00:00:00.000Z',
      })),
  } as unknown as PostgresSearchRepository;
  const service = new SearchService(repository);
  const llmProvider = vi
    .fn()
    .mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'tool-address',
          name: 'geo.create_address',
          arguments: { payload: { street: 'Rua A' } },
        },
        {
          id: 'tool-site',
          name: 'geo.create_site',
          arguments: { payload: { name: 'Site A' } },
        },
      ],
      finishReason: 'tool_calls',
    })
    .mockResolvedValueOnce({ content: 'Operacoes preparadas.', finishReason: 'stop' });
  const executeTool = vi.fn().mockImplementation((name: string) => ({
    ok: true,
    domain: 'geo',
    operation: name.split('.')[1],
    data: {
      confirmationToken: name === 'geo.create_address' ? 'token-address' : 'token-site',
      summary: `Resumo ${name}`,
      expiresAt: '2026-01-01T00:30:00.000Z',
    },
  }));

  const result = await service.addMessageAndGetResponse(
    session.id,
    'Crie o endereco e o site',
    llmProvider,
    {
      tools: [
        {
          name: 'geo.create_address',
          description: 'Cria endereco',
          inputSchema: { type: 'object' },
        },
        {
          name: 'geo.create_site',
          description: 'Cria site',
          inputSchema: { type: 'object' },
        },
      ],
      executeTool,
    },
  );

  const confirmations = result.assistantMessage.metadata?.pendingConfirmations as
    Array<{ confirmationToken: string; operation: string }> | undefined;
  assert.deepEqual(
    confirmations?.map(({ confirmationToken, operation }) => ({ confirmationToken, operation })),
    [
      { confirmationToken: 'token-address', operation: 'create_address' },
      { confirmationToken: 'token-site', operation: 'create_site' },
    ],
  );
  assert.equal(
    (result.assistantMessage.metadata?.pendingConfirmation as { confirmationToken?: string })
      .confirmationToken,
    'token-address',
  );
});
