import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { startHttpTestApp } from './test-utils.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

test('Copilot consulta sites via MCP e devolve dados reais do inventario', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  let sawSanitizedToolCatalog = false;

  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const messages = body.messages as Array<Record<string, unknown>>;
    const lastMessage = messages[messages.length - 1];
    const tools = body.tools as Array<{ function?: { name?: string } }> | undefined;

    if (tools?.some((tool) => tool.function?.name === 'geo__list_sites')) {
      sawSanitizedToolCatalog = true;
    }

    if (lastMessage?.role === 'tool') {
      const toolResult = JSON.parse(String(lastMessage.content)) as {
        data: { items: Array<{ name: string }> };
      };
      const siteName = toolResult.data.items[0]?.name ?? 'desconhecido';
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [{ finish_reason: 'stop', message: { content: `Encontrei o site ${siteName}.` } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

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
                  id: 'call-sites',
                  type: 'function',
                  function: {
                    name: 'geo__list_sites',
                    arguments: JSON.stringify({}),
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

  const app = await startHttpTestApp('nexus-mcp-int-');

  try {
    const spec = await app.requestJson('POST', '/v1/geo/site-specifications', {
      name: 'Access Site',
      category: 'Site',
    });
    assert.equal(spec.statusCode, 201);

    const site = await app.requestJson('POST', '/v1/geo/sites', {
      name: 'CO Botafogo',
      siteSpecificationId: (spec.body as { id: string }).id,
    });
    assert.equal(site.statusCode, 201);

    const session = await app.requestJson('POST', '/v1/research/sessions', { title: 'Consulta MCP' });
    const sessionId = (session.body as { id: string }).id;

    const reply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: 'Liste os sites disponiveis no inventario.',
    });

    assert.equal(reply.statusCode, 201);
    const assistant = (reply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    assert.match(assistant.content, /CO Botafogo/);
    const executions = assistant.metadata?.toolExecutions as Array<{ toolName: string }> | undefined;
    assert.equal(sawSanitizedToolCatalog, true);
    assert.equal(executions?.[0]?.toolName, 'geo.list_sites');
  } finally {
    await app.cleanup();
  }
});

test('Copilot prepara cadastro de PhysicalResource, exige confirmacao e faz commit depois', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const messages = body.messages as Array<Record<string, unknown>>;
    const lastMessage = messages[messages.length - 1];
    const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content as string | undefined;

    if (lastMessage?.role === 'tool' && String(lastMessage.name) === 'resource.create_physical_resource') {
      const prepared = JSON.parse(String(lastMessage.content)) as {
        data: { confirmationToken: string };
      };
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `Cadastro preparado. Confirme usando o token ${prepared.data.confirmationToken}.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (lastMessage?.role === 'tool' && String(lastMessage.name) === 'resource.commit_create_physical_resource') {
      const committed = JSON.parse(String(lastMessage.content)) as {
        data: { id: string; name: string };
      };
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `Recurso ${committed.data.name} criado com id ${committed.data.id}.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (latestUser?.includes('Confirme usando o token')) {
      throw new Error('unexpected prompt echo');
    }

    if (latestUser?.toLowerCase().includes('confirme o cadastro')) {
      const tokenMatch = latestUser.match(/[0-9a-f-]{36}/i);
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
                    id: 'call-commit-resource',
                    type: 'function',
                    function: {
                      name: 'resource.commit_create_physical_resource',
                      arguments: JSON.stringify({ confirmationToken: tokenMatch?.[0] }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

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
                  id: 'call-create-resource',
                  type: 'function',
                  function: {
                    name: 'resource.create_physical_resource',
                    arguments: JSON.stringify({
                      payload: {
                        name: 'ONT-0001',
                        resourceSpecificationId: 'RESOURCE_SPEC_ID',
                        placeId: 'SITE_ID',
                        placeType: 'GeographicSite',
                        serialNumber: 'ONT-0001',
                      },
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

  const app = await startHttpTestApp('nexus-mcp-int-');

  try {
    const siteSpec = await app.requestJson('POST', '/v1/geo/site-specifications', {
      name: 'Access Site',
      category: 'Site',
    });
    const site = await app.requestJson('POST', '/v1/geo/sites', {
      name: 'CO Botafogo',
      siteSpecificationId: (siteSpec.body as { id: string }).id,
    });
    const resourceSpec = await app.requestJson('POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
      name: 'ONT',
      category: 'Equipment.CustomerPremises',
      resourceType: 'ONT',
    });

    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const messages = body.messages as Array<Record<string, unknown>>;
      const lastMessage = messages[messages.length - 1];
      const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content as string | undefined;

      if (lastMessage?.role === 'tool' && String(lastMessage.name) === 'resource.create_physical_resource') {
        const prepared = JSON.parse(String(lastMessage.content)) as {
          data: { confirmationToken: string };
        };
        return new Response(
          JSON.stringify({
            model: 'gpt-4o-mini',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: `Cadastro preparado. Confirme o cadastro com o token ${prepared.data.confirmationToken}.`,
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (lastMessage?.role === 'tool' && String(lastMessage.name) === 'resource.commit_create_physical_resource') {
        const committed = JSON.parse(String(lastMessage.content)) as {
          data: { id: string; name: string };
        };
        return new Response(
          JSON.stringify({
            model: 'gpt-4o-mini',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: `Recurso ${committed.data.name} criado com id ${committed.data.id}.`,
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (latestUser?.toLowerCase().includes('confirme o cadastro')) {
        const tokenMatch = latestUser.match(/[0-9a-f-]{36}/i);
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
                      id: 'call-commit-resource',
                      type: 'function',
                      function: {
                        name: 'resource.commit_create_physical_resource',
                        arguments: JSON.stringify({ confirmationToken: tokenMatch?.[0] }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

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
                    id: 'call-create-resource',
                    type: 'function',
                    function: {
                      name: 'resource.create_physical_resource',
                      arguments: JSON.stringify({
                        payload: {
                          name: 'ONT-0001',
                          resourceSpecificationId: (resourceSpec.body as { id: string }).id,
                          placeId: (site.body as { id: string }).id,
                          placeType: 'GeographicSite',
                          serialNumber: 'ONT-0001',
                        },
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

    const session = await app.requestJson('POST', '/v1/research/sessions', { title: 'Cadastro MCP' });
    const sessionId = (session.body as { id: string }).id;

    const preparedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: 'Cadastre um novo equipamento ONT no site CO Botafogo.',
    });
    assert.equal(preparedReply.statusCode, 201);
    const preparedAssistant = (preparedReply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    const preparedExecution = (preparedAssistant.metadata?.toolExecutions as Array<{ result: { data: { confirmationToken: string } } }> | undefined)?.[0];
    const confirmationToken = preparedExecution?.result.data.confirmationToken;
    assert.match(confirmationToken ?? '', /^[0-9a-f-]{36}$/);

    const committedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: `Confirme o cadastro com o token ${confirmationToken}.`,
    });
    assert.equal(committedReply.statusCode, 201);
    const committedAssistant = (committedReply.body as { assistantMessage: { metadata?: Record<string, unknown> } }).assistantMessage;
    const committedExecution = (committedAssistant.metadata?.toolExecutions as Array<{ result: { data: { id: string; name: string } }; toolName: string }> | undefined)?.[0];
    assert.equal(committedExecution?.toolName, 'resource.commit_create_physical_resource');

    const resourceId = committedExecution?.result.data.id;
    const events = await app.requestJson('GET', `/tmf-api/eventManagement/v4/event?correlationId=${resourceId}`);
    assert.equal(events.statusCode, 200);
    assert.ok((events.body as Array<{ eventType: string }>).some((event) => event.eventType === 'ResourceCreateEvent'));
  } finally {
    await app.cleanup();
  }
});

test('Copilot cadastra modelo de ONT resolvendo fabricante sem pedir ID', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const messages = body.messages as Array<Record<string, unknown>>;
    const lastMessage = messages[messages.length - 1];
    const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content as string | undefined;
    const assistantBeforeTool = messages.length >= 2 ? messages[messages.length - 2] : undefined;
    const firstToolName = Array.isArray(assistantBeforeTool?.tool_calls)
      ? (assistantBeforeTool?.tool_calls as Array<{ function?: { name?: string } }>)?.[0]?.function?.name
      : undefined;

    if (lastMessage?.role === 'tool' && firstToolName === 'resource__create_equipment_model') {
      const prepared = JSON.parse(String(lastMessage.content)) as {
        data: { confirmationToken: string };
      };
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `Modelo preparado com sucesso. Confirme usando o token ${prepared.data.confirmationToken}.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (lastMessage?.role === 'tool' && firstToolName === 'resource__commit_create_equipment_model') {
      const committed = JSON.parse(String(lastMessage.content)) as {
        data: { name: string; relatedParty?: Array<{ name?: string }> };
      };
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `Modelo ${committed.data.name} cadastrado para ${committed.data.relatedParty?.[0]?.name ?? 'fabricante conhecido'}.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (latestUser?.toLowerCase().includes('confirme o cadastro')) {
      const tokenMatch = latestUser.match(/[0-9a-f-]{36}/i);
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
                    id: 'call-commit-equipment-model',
                    type: 'function',
                    function: {
                      name: 'resource.commit_create_equipment_model',
                      arguments: JSON.stringify({ confirmationToken: tokenMatch?.[0] }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

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
                  id: 'call-create-equipment-model',
                  type: 'function',
                  function: {
                    name: 'resource.create_equipment_model',
                    arguments: JSON.stringify({
                      payload: {
                        model: 'F6201BV9.3.12',
                        manufacturerName: 'ZTE',
                        equipmentType: 'ONT',
                      },
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

  const app = await startHttpTestApp('nexus-mcp-int-');

  try {
    const session = await app.requestJson('POST', '/v1/research/sessions', { title: 'Cadastro ONT' });
    const sessionId = (session.body as { id: string }).id;

    const preparedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: 'quero cadastrar um novo modelo de ONT F6201BV9.3.12 da ZTE',
    });
    assert.equal(preparedReply.statusCode, 201);
    const preparedAssistant = (preparedReply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    assert.match(preparedAssistant.content, /Cadastro preparado/i);
    assert.doesNotMatch(preparedAssistant.content, /token|relatedParty|ResourceSpecification|ID/i);
    const pendingConfirmation = preparedAssistant.metadata?.pendingConfirmation as { confirmationToken?: string } | undefined;
    const preparedExecution = (preparedAssistant.metadata?.toolExecutions as Array<{ result: { data: { confirmationToken: string } } }> | undefined)?.[0];
    const confirmationToken = pendingConfirmation?.confirmationToken ?? preparedExecution?.result.data.confirmationToken;
    assert.match(confirmationToken ?? '', /^[0-9a-f-]{36}$/);

    const committedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/confirmations`, {
      confirmationToken,
    });
    assert.equal(committedReply.statusCode, 200);
    const committedAssistant = (committedReply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> }; confirmation: { ok: boolean; shouldRefreshResourceCatalog: boolean } }).assistantMessage;
    assert.match(committedAssistant.content, /cadastrado com sucesso/i);
    assert.doesNotMatch(committedAssistant.content, /token|relatedParty|ResourceSpecification|ID/i);
    const committedConfirmation = (committedReply.body as { confirmation: { ok: boolean; shouldRefreshResourceCatalog: boolean } }).confirmation;
    assert.equal(committedConfirmation.ok, true);
    assert.equal(committedConfirmation.shouldRefreshResourceCatalog, true);

    const catalogReply = await app.requestJson('GET', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification?name=F6201BV9.3.12');
    assert.equal(catalogReply.statusCode, 200);
    const catalogItems = catalogReply.body as Array<{ name: string; relatedParty?: Array<{ name?: string }> }>;
    assert.equal(catalogItems.some((item) => item.name === 'F6201BV9.3.12' && item.relatedParty?.[0]?.name === 'ZTE'), true);
  } finally {
    await app.cleanup();
  }
});

test('Copilot cadastra varios modelos de ONT em lote e mostra a lista completa na confirmacao', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const messages = body.messages as Array<Record<string, unknown>>;
    const lastMessage = messages[messages.length - 1];
    const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content as string | undefined;
    const assistantBeforeTool = messages.length >= 2 ? messages[messages.length - 2] : undefined;
    const firstToolName = Array.isArray(assistantBeforeTool?.tool_calls)
      ? (assistantBeforeTool?.tool_calls as Array<{ function?: { name?: string } }>)?.[0]?.function?.name
      : undefined;

    if (lastMessage?.role === 'tool' && firstToolName === 'resource__create_equipment_models') {
      const prepared = JSON.parse(String(lastMessage.content)) as {
        data: { confirmationToken: string; payload?: { items?: Array<{ model: string }> } };
      };
      const itemCount = prepared.data.payload?.items?.length ?? 3;
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `Cadastro preparado. Revise os ${itemCount} itens abaixo e confirme para concluir.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (lastMessage?.role === 'tool' && firstToolName === 'resource__commit_create_equipment_models') {
      const committed = JSON.parse(String(lastMessage.content)) as {
        data: { items: Array<{ name: string; relatedParty?: Array<{ name?: string }> }> };
      };
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `${committed.data.items.length} modelos cadastrados com sucesso.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (latestUser?.toLowerCase().includes('confirme o cadastro')) {
      const tokenMatch = latestUser.match(/[0-9a-f-]{36}/i);
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
                    id: 'call-commit-equipment-models',
                    type: 'function',
                    function: {
                      name: 'resource.commit_create_equipment_models',
                      arguments: JSON.stringify({ confirmationToken: tokenMatch?.[0] }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

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
                  id: 'call-create-equipment-models',
                  type: 'function',
                  function: {
                    name: 'resource.create_equipment_models',
                    arguments: JSON.stringify({
                      payload: {
                        items: [
                          { model: 'G-010G-Q', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                          { model: 'G-0425G-C', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                          { model: 'G-140W-H', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                        ],
                      },
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

  const app = await startHttpTestApp('nexus-mcp-int-');

  try {
    const session = await app.requestJson('POST', '/v1/research/sessions', { title: 'Cadastro em lote' });
    const sessionId = (session.body as { id: string }).id;

    const preparedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: 'agora quero que crie esses modelos abaixo\n\nG-010G-Q NOKIA\nG-0425G-C NOKIA\nG-140W-H NOKIA',
    });
    assert.equal(preparedReply.statusCode, 201);
    const preparedAssistant = (preparedReply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    assert.match(preparedAssistant.content, /Revise os 3 itens/i);
    const pendingConfirmation = preparedAssistant.metadata?.pendingConfirmation as {
      confirmationToken?: string;
      operation?: string;
      items?: Array<{ model: string }>;
    } | undefined;
    assert.equal(pendingConfirmation?.operation, 'create_equipment_models');
    assert.equal(pendingConfirmation?.items?.length, 3);
    assert.match(pendingConfirmation?.confirmationToken ?? '', /^[0-9a-f-]{36}$/);
    assert.match((preparedAssistant.content.split('\n').join(' ')), /Cadastro preparado/i);
    assert.match(preparedAssistant.content, /Revise os 3 itens/);

    const committedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/confirmations`, {
      confirmationToken: pendingConfirmation?.confirmationToken,
    });
    assert.equal(committedReply.statusCode, 200);
    const committedAssistant = (committedReply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    assert.match(committedAssistant.content, /3 modelos.*cadastrados com sucesso/i);

    const catalogReply = await app.requestJson('GET', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification?includeEnded=true');
    assert.equal(catalogReply.statusCode, 200);
    const catalogItems = catalogReply.body as Array<{ name: string }>;
    assert.equal(catalogItems.some((item) => item.name === 'G-010G-Q'), true);
    assert.equal(catalogItems.some((item) => item.name === 'G-0425G-C'), true);
    assert.equal(catalogItems.some((item) => item.name === 'G-140W-H'), true);
  } finally {
    await app.cleanup();
  }
});

test('Copilot remove modelo de ONT usando o mesmo fluxo de confirmacao', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const messages = body.messages as Array<Record<string, unknown>>;
    const lastMessage = messages[messages.length - 1];
    const assistantBeforeTool = messages.length >= 2 ? messages[messages.length - 2] : undefined;
    const firstToolName = Array.isArray(assistantBeforeTool?.tool_calls)
      ? (assistantBeforeTool?.tool_calls as Array<{ function?: { name?: string } }>)?.[0]?.function?.name
      : undefined;

    if (lastMessage?.role === 'tool' && firstToolName === 'resource__delete_equipment_model') {
      const prepared = JSON.parse(String(lastMessage.content)) as {
        data: { confirmationToken: string };
      };
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `Remocao preparada. Confirme usando o token ${prepared.data.confirmationToken}.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (lastMessage?.role === 'tool' && firstToolName === 'resource__commit_delete_equipment_model') {
      const committed = JSON.parse(String(lastMessage.content)) as {
        data: { name: string; relatedParty?: Array<{ name?: string }> };
      };
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: `Modelo ${committed.data.name} removido do catalogo.`,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (Array.isArray(body.tools) && body.tools.some((tool: { function?: { name?: string } }) => tool.function?.name === 'resource__delete_equipment_model')) {
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
                    id: 'call-delete-equipment-model',
                    type: 'function',
                    function: {
                      name: 'resource__delete_equipment_model',
                      arguments: JSON.stringify({
                        payload: {
                          model: 'F6201BV9.3.12',
                          manufacturerName: 'ZTE',
                          equipmentType: 'ONT',
                        },
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
    }

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
                  id: 'call-delete-equipment-model',
                  type: 'function',
                  function: {
                    name: 'resource__delete_equipment_model',
                    arguments: JSON.stringify({
                      payload: {
                        model: 'F6201BV9.3.12',
                        manufacturerName: 'ZTE',
                        equipmentType: 'ONT',
                      },
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

  const app = await startHttpTestApp('nexus-mcp-int-');

  try {
    const manufacturer = await app.requestJson('POST', '/tmf-api/partyManagement/v4/party', {
      name: 'ZTE',
      partyType: 'Organization',
    });
    assert.equal(manufacturer.statusCode, 201);

    const resourceSpec = await app.requestJson('POST', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification', {
      name: 'F6201BV9.3.12',
      category: 'Equipment.CustomerPremises',
      resourceType: 'ONT',
      relatedParty: [
        {
          id: (manufacturer.body as { id: string }).id,
          '@referredType': 'Organization',
          role: 'manufacturer',
          name: 'ZTE',
        },
      ],
    });
    assert.equal(resourceSpec.statusCode, 201);

    const session = await app.requestJson('POST', '/v1/research/sessions', { title: 'Remocao ONT' });
    const sessionId = (session.body as { id: string }).id;

    const preparedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: 'remova o modelo F6201BV9.3.12 da ZTE',
    });
    assert.equal(preparedReply.statusCode, 201);
    const preparedAssistant = (preparedReply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    assert.match(preparedAssistant.content, /Remocao preparada/i);
    const pendingConfirmation = preparedAssistant.metadata?.pendingConfirmation as { confirmationToken?: string; operation?: string } | undefined;
    assert.equal(pendingConfirmation?.operation, 'delete_equipment_model');
    const confirmationToken = pendingConfirmation?.confirmationToken;
    assert.match(confirmationToken ?? '', /^[0-9a-f-]{36}$/);

    const committedReply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/confirmations`, {
      confirmationToken,
    });
    assert.equal(committedReply.statusCode, 200);
    const committedAssistant = (committedReply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    assert.match(committedAssistant.content, /removido do catalogo/i);

    const catalogReply = await app.requestJson('GET', '/tmf-api/resourceCatalogManagement/v4/resourceSpecification?name=F6201BV9.3.12&includeEnded=true');
    assert.equal(catalogReply.statusCode, 200);
    const catalogItems = catalogReply.body as Array<{ name: string; validFor?: { endDateTime?: string } }>;
    assert.equal(catalogItems.length, 1);
    assert.ok(catalogItems[0]?.validFor?.endDateTime);
  } finally {
    await app.cleanup();
  }
});

test('Fallback local sem OpenAI nao executa ferramentas MCP', async () => {
  const app = await startHttpTestApp('nexus-mcp-int-');

  try {
    const session = await app.requestJson('POST', '/v1/research/sessions', { title: 'Fallback local' });
    const sessionId = (session.body as { id: string }).id;

    const reply = await app.requestJson('POST', `/v1/research/sessions/${sessionId}/messages`, {
      message: 'Liste os sites do inventario.',
    });

    assert.equal(reply.statusCode, 201);
    const assistant = (reply.body as { assistantMessage: { content: string; metadata?: Record<string, unknown> } }).assistantMessage;
    assert.match(assistant.content, /Nao consegui/);
    assert.equal(assistant.metadata?.toolExecutions, undefined);
  } finally {
    await app.cleanup();
  }
});
