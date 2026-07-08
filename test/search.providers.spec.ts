import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { ChatGPTProvider } from '../src/modules/search/chatgpt-provider.js';
import { LocalKnowledgeProvider } from '../src/modules/search/local-knowledge-provider.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('ChatGPTProvider rejeita chave ausente', () => {
  assert.throws(() => new ChatGPTProvider(''), /OPENAI_API_KEY environment variable is required/);
});

test('ChatGPTProvider completa mensagens, usa endpoint sanitizado e propaga metadados', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        model: 'gpt-4o-mini',
        choices: [{ finish_reason: 'stop', message: { content: 'Resposta' } }],
        usage: { total_tokens: 77 },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });

  vi.stubGlobal('fetch', fetchMock);

  const provider = new ChatGPTProvider('secret-key', 'https://api.openai.com/v1/');
  const result = await provider.complete(
    [{ role: 'system', content: 'Contexto' }, { role: 'user', content: 'Pergunta' }],
    'gpt-4o',
    0.2,
    120,
  );

  const firstCall = fetchMock.mock.calls[0];
  assert.ok(firstCall);
  const requestInit = firstCall[1];
  assert.equal(firstCall[0], 'https://api.openai.com/v1/chat/completions');
  assert.ok(requestInit?.body);
  assert.deepEqual(JSON.parse(String(requestInit.body)), {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Contexto' },
      { role: 'user', content: 'Pergunta' },
    ],
    temperature: 0.2,
    max_tokens: 120,
  });
  assert.equal(result.content, 'Resposta');
  assert.equal(result.tokensUsed, 77);
  assert.deepEqual(result.metadata, { model: 'gpt-4o-mini', finish_reason: 'stop' });
});

test('ChatGPTProvider converte respostas inválidas em erro explícito', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response('boom', { status: 500, statusText: 'Internal Server Error' });
    }),
  );

  const provider = new ChatGPTProvider('secret-key');

  await assert.rejects(
    () => provider.complete([{ role: 'user', content: 'Pergunta' }]),
    /Failed to call ChatGPT: OpenAI API error: 500 boom/,
  );
});

test('ChatGPTProvider rejeita quando a resposta vem sem mensagem', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(JSON.stringify({ choices: [{}] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );

  const provider = new ChatGPTProvider('secret-key');

  await assert.rejects(
    () => provider.complete([{ role: 'user', content: 'Pergunta' }]),
    /Failed to call ChatGPT: No message returned from OpenAI API/,
  );
});

test('ChatGPTProvider aceita resposta com tool calls e argumentos JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: {
                      name: 'geo.list_sites',
                      arguments: '{}',
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }),
  );

  const provider = new ChatGPTProvider('secret-key');
  const result = await provider.complete([{ role: 'user', content: 'Liste os sites' }]);

  assert.equal(result.content, '');
  assert.equal(result.finishReason, 'tool_calls');
  assert.equal(result.toolCalls?.[0]?.id, 'call-1');
  assert.equal(result.toolCalls?.[0]?.name, 'geo.list_sites');
  assert.deepEqual(result.toolCalls?.[0]?.arguments, {});
});

test('ChatGPTProvider monta contexto, histórico e mensagem atual ao chamar call', async () => {
  const provider = new ChatGPTProvider('secret-key');
  const completeSpy = vi.spyOn(provider, 'complete').mockResolvedValue({ content: 'ok' });

  await provider.call(
    'Contexto do sistema',
    [
      { '@type': 'ResearchMessage', id: '1', researchSessionId: 'session-1', role: 'assistant', content: 'Anterior', createdAt: '2026-01-01T00:00:00.000Z' },
      { '@type': 'ResearchMessage', id: '2', researchSessionId: 'session-1', role: 'user', content: 'Pergunta anterior', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    'Pergunta atual',
    'gpt-4o',
    0.3,
    90,
  );

  assert.equal(completeSpy.mock.calls[0]?.[0]?.length, 4);
  assert.deepEqual(completeSpy.mock.calls[0]?.[0], [
    { role: 'system', content: 'Contexto do sistema' },
    { role: 'assistant', content: 'Anterior' },
    { role: 'user', content: 'Pergunta anterior' },
    { role: 'user', content: 'Pergunta atual' },
  ]);
  assert.equal(completeSpy.mock.calls[0]?.[1], 'gpt-4o');
  assert.equal(completeSpy.mock.calls[0]?.[2], 0.3);
  assert.equal(completeSpy.mock.calls[0]?.[3], 90);
});

test('LocalKnowledgeProvider responde com conteúdo curado e fallback local', async () => {
  const provider = new LocalKnowledgeProvider();

  const curated = await provider.complete([
    { role: 'assistant', content: 'Ignorar isso' },
    { role: 'user', content: 'Preciso da triade do Nexus' },
  ]);

  assert.equal(curated.metadata?.source, 'local-docs');
  assert.equal(curated.metadata?.fallback, true);
  assert.match(curated.content, /triade do Nexus/);

  const fallback = await provider.complete([{ role: 'user', content: 'qwertyuiopas' }]);
  assert.match(fallback.content, /Nao consegui usar o provedor externo/);
  assert.match(fallback.content, /Tente reformular/);
});

test('LocalKnowledgeProvider reconhece o Nexus Copilot como contexto especializado', async () => {
  const provider = new LocalKnowledgeProvider();
  const result = await provider.complete([{ role: 'user', content: 'Quem e o Nexus Copilot?' }]);

  assert.match(result.content, /Nexus Copilot/);
  assert.match(result.content, /Telecom/);
});

test('LocalKnowledgeProvider responde pergunta de capacidades sem colar trechos aleatorios', async () => {
  const provider = new LocalKnowledgeProvider();
  const result = await provider.complete([{ role: 'user', content: 'o que vc pode fazer?' }]);

  assert.match(result.content, /modo de fallback local/);
  assert.match(result.content, /nao consigo consultar dados reais do inventario/i);
  assert.doesNotMatch(result.content, /VRF do cliente/);
});

test('LocalKnowledgeProvider informa indisponibilidade clara para operacoes de inventario sem MCP', async () => {
  const provider = new LocalKnowledgeProvider();
  const result = await provider.complete([{ role: 'user', content: 'liste os sites do inventario' }]);

  assert.match(result.content, /nao pode usar MCP/i);
  assert.match(result.content, /nao consigo consultar dados reais do inventario/i);
});

test('LocalKnowledgeProvider monta mensagens corretas ao chamar call', async () => {
  const provider = new LocalKnowledgeProvider();
  const completeSpy = vi.spyOn(provider, 'complete').mockResolvedValue({ content: 'ok' });

  await provider.call(
    'Contexto local',
    [
      { '@type': 'ResearchMessage', id: '1', researchSessionId: 'session-1', role: 'assistant', content: 'Anterior', createdAt: '2026-01-01T00:00:00.000Z' },
      { '@type': 'ResearchMessage', id: '2', researchSessionId: 'session-1', role: 'user', content: 'Pergunta anterior', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    'Pergunta atual',
  );

  assert.deepEqual(completeSpy.mock.calls[0]?.[0], [
    { role: 'system', content: 'Contexto local' },
    { role: 'assistant', content: 'Anterior' },
    { role: 'user', content: 'Pergunta anterior' },
    { role: 'user', content: 'Pergunta atual' },
  ]);
  assert.equal(completeSpy.mock.calls[0]?.[1], 'nexus-local-docs');
});
