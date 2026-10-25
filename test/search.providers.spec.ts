import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { ChatGPTProvider } from '../src/modules/search/chatgpt-provider.js';
import { LocalKnowledgeProvider } from '../src/modules/search/local-knowledge-provider.js';
import {
  createCopilotProvider,
  DEFAULT_COPILOT_API_ENDPOINT,
  resolveCopilotModel,
} from '../src/modules/search/copilot-provider.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('ChatGPTProvider rejeita chave ausente', () => {
  assert.throws(() => new ChatGPTProvider(''), /COPILOT_API_KEY environment variable is required/);
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
    [
      { role: 'system', content: 'Contexto' },
      { role: 'user', content: 'Pergunta' },
    ],
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
      {
        '@type': 'ResearchMessage',
        id: '1',
        researchSessionId: 'session-1',
        role: 'assistant',
        content: 'Anterior',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        '@type': 'ResearchMessage',
        id: '2',
        researchSessionId: 'session-1',
        role: 'user',
        content: 'Pergunta anterior',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
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

test('createCopilotProvider lê só COPILOT_API_KEY/COPILOT_API_ENDPOINT', () => {
  assert.equal(createCopilotProvider({} as NodeJS.ProcessEnv), null);
  assert.equal(createCopilotProvider({ COPILOT_API_KEY: '   ' } as NodeJS.ProcessEnv), null);
  // Variáveis antigas não habilitam mais o Copilot.
  assert.equal(
    createCopilotProvider({
      OPENAI_API_KEY: 'openai-key',
      GEMINI_API_KEY: 'gemini-key',
    } as NodeJS.ProcessEnv),
    null,
  );

  const defaultEndpoint = createCopilotProvider({
    COPILOT_API_KEY: 'copilot-key',
  } as NodeJS.ProcessEnv);
  assert.equal(defaultEndpoint?.apiEndpoint, DEFAULT_COPILOT_API_ENDPOINT);

  const routed = createCopilotProvider({
    COPILOT_API_KEY: 'copilot-key',
    COPILOT_API_ENDPOINT: 'https://router.local/v1',
  } as NodeJS.ProcessEnv);
  assert.equal(routed?.apiEndpoint, 'https://router.local/v1');
});

test('resolveCopilotModel usa COPILOT_MODEL e ignora OPENAI_MODEL/GEMINI_MODEL', () => {
  assert.equal(
    resolveCopilotModel({ COPILOT_MODEL: ' nexus-plan ' } as NodeJS.ProcessEnv),
    'nexus-plan',
  );
  assert.equal(
    resolveCopilotModel({
      OPENAI_MODEL: 'gpt-4o',
      GEMINI_MODEL: 'gemini-2.5-pro',
    } as NodeJS.ProcessEnv),
    'gpt-4o-mini',
  );
});

test('ChatGPTProvider lê resposta SSE mesmo sem stream: true (roteadores OpenAI-compat)', async () => {
  const sse = [
    'data: {"model":"nexus-plan","choices":[{"delta":{"content":"Olá "}}]}',
    'data: {"choices":[{"delta":{"content":"do roteador"},"finish_reason":"stop"}]}',
    'data: [DONE]',
    '',
  ].join('\n');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    ),
  );

  const provider = new ChatGPTProvider('copilot-key', 'https://router.local/v1');
  const result = await provider.complete([{ role: 'user', content: 'oi' }], 'nexus-plan');

  assert.equal(result.content, 'Olá do roteador');
  assert.equal(result.finishReason, 'stop');
});

test('ChatGPTProvider codifica chaves TMF (@type) no schema e decodifica nos argumentos', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
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
                    name: 'service__create_cfs',
                    arguments: JSON.stringify({
                      _x40_type: 'CustomerFacingService',
                      supportingResource: [{ id: 'r1', _x40_referredType: 'Resource' }],
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const provider = new ChatGPTProvider('copilot-key');
  const result = await provider.complete(
    [{ role: 'user', content: 'crie' }],
    'nexus-plan',
    0.2,
    100,
    [
      {
        name: 'service__create_cfs',
        description: 'Cria CFS',
        inputSchema: {
          type: 'object',
          required: ['@type'],
          properties: {
            '@type': { type: 'string' },
            supportingResource: {
              type: 'array',
              items: { type: 'object', properties: { '@referredType': { type: 'string' } } },
            },
          },
        },
      },
    ],
  );

  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
    tools: Array<{ function: { parameters: Record<string, unknown> } }>;
  };
  const keys = JSON.stringify(body.tools[0]?.function.parameters);
  assert.doesNotMatch(keys, /@/);
  assert.match(keys, /"required":\["_x40_type"\]/);
  assert.deepEqual(result.toolCalls?.[0]?.arguments, {
    '@type': 'CustomerFacingService',
    supportingResource: [{ id: 'r1', '@referredType': 'Resource' }],
  });
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
  const result = await provider.complete([
    { role: 'user', content: 'liste os sites do inventario' },
  ]);

  assert.match(result.content, /nao pode usar MCP/i);
  assert.match(result.content, /nao consigo consultar dados reais do inventario/i);
});

test('LocalKnowledgeProvider entende que modelo de ONT e ResourceSpecification', async () => {
  const provider = new LocalKnowledgeProvider();
  const result = await provider.complete([
    { role: 'user', content: 'quero cadastrar um modelo de ONT F6201BV9.3.12 da Huawei' },
  ]);

  assert.match(result.content, /modelo de ONT|catalogo de equipamento/i);
  assert.match(result.content, /Equipment\.CustomerPremises|Equipamentos de Cliente/i);
  assert.match(result.content, /fabricante/i);
  assert.doesNotMatch(result.content, /ID de party|relatedParty/i);
});

test('LocalKnowledgeProvider entende que remover modelo e soft-delete de ResourceSpecification', async () => {
  const provider = new LocalKnowledgeProvider();
  const result = await provider.complete([
    { role: 'user', content: 'remova o modelo F6201BV9.3.12 da ZTE' },
  ]);

  assert.match(result.content, /soft-delete|ResourceSpecification/i);
  assert.match(result.content, /sem exclusao fisica|nao faz exclusao fisica/i);
  assert.match(result.content, /causa/i);
});

test('LocalKnowledgeProvider monta mensagens corretas ao chamar call', async () => {
  const provider = new LocalKnowledgeProvider();
  const completeSpy = vi.spyOn(provider, 'complete').mockResolvedValue({ content: 'ok' });

  await provider.call(
    'Contexto local',
    [
      {
        '@type': 'ResearchMessage',
        id: '1',
        researchSessionId: 'session-1',
        role: 'assistant',
        content: 'Anterior',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        '@type': 'ResearchMessage',
        id: '2',
        researchSessionId: 'session-1',
        role: 'user',
        content: 'Pergunta anterior',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
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
