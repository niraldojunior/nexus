import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { LLMRequest, ResearchMessage, ResearchSession } from '../src/modules/search/domain.js';
import { SearchService } from '../src/modules/search/index.js';
import type { SqliteSearchRepository } from '../src/modules/search/sqlite-repository.js';

const createRepositoryMock = () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  listSessionsByUser: vi.fn(),
  addMessage: vi.fn(),
  updateSessionTitle: vi.fn(),
  archiveSession: vi.fn(),
}) as unknown as SqliteSearchRepository & {
  createSession: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  listSessionsByUser: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
  updateSessionTitle: ReturnType<typeof vi.fn>;
  archiveSession: ReturnType<typeof vi.fn>;
};

test('SearchService cria sessoes com defaults canonicos e campos opcionais', async () => {
  const repository = createRepositoryMock();
  repository.createSession.mockImplementation((session: ResearchSession) => ({ ...session, messages: [] }));
  const service = new SearchService(repository);

  const session = await service.createSession('tenant-1', {
    title: 'Nova conversa',
    description: 'Contexto inicial',
    context: 'Voce e o Nexus',
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 900,
  });

  assert.equal(session.title, 'Nova conversa');
  assert.equal(session.description, 'Contexto inicial');
  assert.equal(session.context, 'Voce e o Nexus');
  assert.equal(session.model, 'gpt-4o');
  assert.equal(session.temperature, 0.2);
  assert.equal(session.maxTokens, 900);
  assert.equal(session.status, 'active');
  assert.match(session.id, /^[0-9a-f-]{36}$/);
  assert.equal(repository.createSession.mock.calls.length, 1);
  assert.match(repository.createSession.mock.calls[0]?.[0].href, /^\/v1\/search\/sessions\//);
});

test('SearchService preenche defaults quando criacao nao traz opcionais', async () => {
  const repository = createRepositoryMock();
  repository.createSession.mockImplementation((session: ResearchSession) => ({ ...session, messages: [] }));
  const service = new SearchService(repository);

  await service.createSession('tenant-2', { title: 'Sessao sem extras' });

  const payload = repository.createSession.mock.calls[0]?.[0] as ResearchSession;
  assert.equal(payload.model, 'gpt-4o-mini');
  assert.equal(payload.temperature, 0.7);
  assert.equal(payload.maxTokens, 2000);
  assert.equal(payload.description, undefined);
  assert.ok(payload.context);
  assert.match(payload.context, /Nexus Copilot/);
  assert.match(payload.context, /TMF/i);
});

test('SearchService adiciona mensagem, preserva contexto e faz fallback quando o provedor falha', async () => {
  const repository = createRepositoryMock();
  const session: ResearchSession = {
    '@type': 'ResearchSession',
    id: 'session-1',
    href: '/v1/search/sessions/session-1',
    userId: 'tenant-1',
    title: 'Sessao',
    context: 'Contexto local',
    status: 'active',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2000,
    messages: [
      {
        '@type': 'ResearchMessage',
        id: 'msg-0',
        researchSessionId: 'session-1',
        role: 'assistant',
        content: 'Resposta anterior',
        createdAt: '2026-01-01T00:00:00.000Z',
      } satisfies ResearchMessage,
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  repository.getSession.mockReturnValue(session);
  repository.addMessage.mockImplementation((sessionId: string, message: ResearchMessage & { id: string }) => ({
    '@type': 'ResearchMessage',
    id: message.id,
    researchSessionId: sessionId,
    role: message.role,
    content: message.content,
    tokensUsed: message.tokensUsed,
    metadata: message.metadata,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  const service = new SearchService(repository);
  const llmProvider = vi.fn(async (_request: LLMRequest) => ({
    content: 'Resposta do modelo',
    tokensUsed: 12,
    metadata: { model: 'gpt-4o-mini', finish_reason: 'stop' },
  }));

  const result = await service.addMessageAndGetResponse('session-1', 'Qual a triade?', llmProvider);

  assert.equal(llmProvider.mock.calls[0]?.[0]?.context, 'Contexto local');
  assert.equal(llmProvider.mock.calls[0]?.[0]?.latestUserMessage, 'Qual a triade?');
  assert.equal(llmProvider.mock.calls[0]?.[0]?.transcript.at(-1)?.content, 'Qual a triade?');
  assert.equal(result.userMessage.role, 'user');
  assert.equal(result.userMessage.content, 'Qual a triade?');
  assert.equal(result.assistantMessage.content, 'Resposta do modelo');
  assert.equal(result.assistantMessage.tokensUsed, 12);
  assert.deepEqual(result.assistantMessage.metadata, { model: 'gpt-4o-mini', finish_reason: 'stop' });
  assert.equal(repository.addMessage.mock.calls.length, 2);
});

test('SearchService retorna fallback quando o provedor de IA falha', async () => {
  const repository = createRepositoryMock();
  const session: ResearchSession = {
    '@type': 'ResearchSession',
    id: 'session-2',
    href: '/v1/search/sessions/session-2',
    userId: 'tenant-2',
    title: 'Sessao sem contexto',
    status: 'active',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  repository.getSession.mockReturnValue(session);
  repository.addMessage.mockImplementation((sessionId: string, message: ResearchMessage & { id: string }) => ({
    '@type': 'ResearchMessage',
    id: message.id,
    researchSessionId: sessionId,
    role: message.role,
    content: message.content,
    tokensUsed: message.tokensUsed,
    metadata: message.metadata,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  const service = new SearchService(repository);
  const llmProvider = vi.fn().mockRejectedValue(new Error('OpenAI fora do ar'));

  const result = await service.addMessageAndGetResponse('session-2', 'Preciso de ajuda', llmProvider);

  assert.equal(result.assistantMessage.role, 'assistant');
  assert.match(result.assistantMessage.content, /Nao consegui gerar uma resposta automatica agora/);
  assert.deepEqual(result.assistantMessage.metadata, {
    fallback: true,
    error: 'OpenAI fora do ar',
  });
  assert.match(llmProvider.mock.calls[0]?.[0]?.context ?? '', /Nexus Copilot/);
});

test('SearchService delega leitura, listagem, renomeacao e arquivamento ao repositorio', async () => {
  const repository = createRepositoryMock();
  const session: ResearchSession = {
    '@type': 'ResearchSession',
    id: 'session-3',
    href: '/v1/search/sessions/session-3',
    userId: 'tenant-3',
    title: 'Sessao',
    status: 'active',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  repository.getSession.mockReturnValue(session);
  repository.listSessionsByUser.mockReturnValue([session]);
  repository.updateSessionTitle.mockReturnValue({ ...session, title: 'Atualizada' });
  repository.archiveSession.mockReturnValue({ ...session, status: 'archived' });

  const service = new SearchService(repository);

  assert.equal(await service.getSession('session-3'), session);
  assert.deepEqual(await service.listUserSessions('tenant-3', 10), [session]);
  assert.equal((await service.updateSessionTitle('session-3', 'Atualizada'))?.title, 'Atualizada');
  assert.equal((await service.archiveSession('session-3'))?.status, 'archived');
});

test('SearchService executa loop de ferramentas e persiste metadados de tool execution', async () => {
  const repository = createRepositoryMock();
  const session: ResearchSession = {
    '@type': 'ResearchSession',
    id: 'session-tools',
    href: '/v1/search/sessions/session-tools',
    userId: 'tenant-tools',
    title: 'Sessao com tools',
    status: 'active',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  repository.getSession.mockReturnValue(session);
  repository.addMessage.mockImplementation((sessionId: string, message: ResearchMessage & { id: string }) => ({
    '@type': 'ResearchMessage',
    id: message.id,
    researchSessionId: sessionId,
    role: message.role,
    content: message.content,
    tokensUsed: message.tokensUsed,
    metadata: message.metadata,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  const service = new SearchService(repository);
  const llmProvider = vi
    .fn()
    .mockResolvedValueOnce({
      content: '',
      toolCalls: [{ id: 'tool-1', name: 'geo.list_sites', arguments: {} }],
      finishReason: 'tool_calls',
    })
    .mockResolvedValueOnce({
      content: 'Encontrei 1 site.',
      metadata: { model: 'gpt-4o-mini' },
      finishReason: 'stop',
    });

  const executeTool = vi.fn().mockResolvedValue({
    ok: true,
    domain: 'geo',
    operation: 'list_sites',
    data: { items: [{ id: 'site-1', name: 'CO Botafogo' }] },
    warnings: [],
    source: 'nexus-tmf-mcp',
    correlationId: 'corr-1',
  });

  const result = await service.addMessageAndGetResponse('session-tools', 'Liste os sites', llmProvider, {
    tools: [{ name: 'geo.list_sites', description: 'Lista sites', inputSchema: { type: 'object', properties: {} } }],
    executeTool,
  });

  assert.equal(llmProvider.mock.calls.length, 2);
  assert.equal(executeTool.mock.calls[0]?.[0], 'geo.list_sites');
  assert.equal(result.assistantMessage.content, 'Encontrei 1 site.');
  assert.equal(
    (result.assistantMessage.metadata?.toolExecutions as Array<{ toolName: string }> | undefined)?.[0]?.toolName,
    'geo.list_sites',
  );
});

test('SearchService carrega confirmacao em lote com lista de itens', async () => {
  const repository = createRepositoryMock();
  const session: ResearchSession = {
    '@type': 'ResearchSession',
    id: 'session-batch',
    href: '/v1/search/sessions/session-batch',
    userId: 'tenant-batch',
    title: 'Sessao em lote',
    status: 'active',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  repository.getSession.mockReturnValue(session);
  repository.addMessage.mockImplementation((sessionId: string, message: ResearchMessage & { id: string }) => ({
    '@type': 'ResearchMessage',
    id: message.id,
    researchSessionId: sessionId,
    role: message.role,
    content: message.content,
    tokensUsed: message.tokensUsed,
    metadata: message.metadata,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  const service = new SearchService(repository);
  const llmProvider = vi
    .fn()
    .mockResolvedValueOnce({
      content: '',
      toolCalls: [{
        id: 'tool-1',
        name: 'resource.create_equipment_models',
        arguments: { payload: { items: [
          { model: 'G-010G-Q', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
          { model: 'G-0425G-C', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
        ] } },
      }],
      finishReason: 'tool_calls',
    })
    .mockResolvedValueOnce({
      content: 'Cadastro preparado. Revise os 2 itens abaixo e confirme para concluir.',
      metadata: { model: 'gpt-4o-mini' },
      finishReason: 'stop',
    });

  const executeTool = vi.fn().mockResolvedValue({
    ok: true,
    domain: 'resource',
    operation: 'create_equipment_models',
    data: {
      confirmationToken: 'token-batch',
      summary: '2 modelos de ONT da NOKIA serao criados no catalogo.',
      expiresAt: '2026-01-01T00:30:00.000Z',
      payload: {
        items: [
          { model: 'G-010G-Q', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
          { model: 'G-0425G-C', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
        ],
      },
    },
    warnings: [],
    source: 'nexus-tmf-mcp',
    correlationId: 'corr-batch',
  });

  const result = await service.addMessageAndGetResponse('session-batch', 'Cadastre dois modelos', llmProvider, {
    tools: [{ name: 'resource.create_equipment_models', description: 'Cadastro em lote', inputSchema: { type: 'object', properties: {} } }],
    executeTool,
  });

  assert.equal(result.assistantMessage.content, 'Cadastro preparado. Revise os 2 itens abaixo e confirme para concluir.');
  assert.deepEqual(
    result.assistantMessage.metadata?.pendingConfirmation,
    {
      confirmationToken: 'token-batch',
      domain: 'resource',
      operation: 'create_equipment_models',
      summary: '2 modelos de ONT da NOKIA serao criados no catalogo.',
      expiresAt: '2026-01-01T00:30:00.000Z',
      items: [
        { model: 'G-010G-Q', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
        { model: 'G-0425G-C', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
      ],
    },
  );
});
