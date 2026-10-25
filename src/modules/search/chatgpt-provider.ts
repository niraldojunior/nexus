import type {
  ResearchMessage,
  LLMConversationMessage,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  LLMToolDefinition,
} from './domain.js';

type OpenAIChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
};

type OpenAIStreamChunk = {
  model?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    delta?: {
      content?: unknown;
      tool_calls?: Array<{
        index?: unknown;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  usage?: {
    total_tokens?: unknown;
  };
};

/**
 * ChatGPT/OpenAI Provider for LLM responses
 * Integrates with OpenAI API
 */
export class ChatGPTProvider {
  public readonly apiEndpoint: string;

  constructor(
    private readonly apiKey: string,
    apiEndpoint = 'https://api.openai.com/v1',
  ) {
    if (!apiKey) {
      throw new Error('COPILOT_API_KEY environment variable is required');
    }

    this.apiEndpoint = apiEndpoint;
  }

  /**
   * Call ChatGPT API and get response
   */
  async complete(
    messages: LLMConversationMessage[],
    model: string = 'gpt-4o-mini',
    temperature: number = 0.7,
    maxTokens: number = 2000,
    tools?: LLMToolDefinition[],
    onDelta?: (textChunk: string) => void,
    signal?: AbortSignal,
    reasoningEffort?: 'low' | 'medium' | 'high',
  ): Promise<LLMResponse> {
    const streaming = typeof onDelta === 'function';
    try {
      const apiResponse = await fetch(`${this.apiEndpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((message) => toOpenAiMessage(message)),
          temperature,
          max_tokens: maxTokens,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(streaming ? { stream: true } : {}),
          ...(tools && tools.length > 0
            ? {
                tools: tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: encodeSchemaKeys(tool.inputSchema),
                  },
                })),
                tool_choice: 'auto',
              }
            : {}),
        }),
        ...(signal ? { signal } : {}),
      });

      if (!apiResponse.ok) {
        const error = await apiResponse.text();
        throw new Error(`OpenAI API error: ${apiResponse.status} ${error}`);
      }

      if (streaming && apiResponse.body) {
        return await this.consumeStream(apiResponse.body, onDelta!);
      }
      // Roteadores OpenAI-compatíveis podem responder em SSE mesmo sem `stream: true`.
      const contentType = apiResponse.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream') && apiResponse.body) {
        return await this.consumeStream(apiResponse.body, () => {});
      }

      const data = (await apiResponse.json()) as OpenAIChatCompletionResponse;

      const choices = data.choices ?? [];
      const firstChoice = choices[0];
      const toolCalls = parseToolCalls(firstChoice?.message?.tool_calls);
      const assistantMessage = firstChoice?.message?.content ?? '';
      if (!assistantMessage && toolCalls.length === 0) {
        throw new Error('No message returned from OpenAI API');
      }

      const result: LLMResponse = {
        content: assistantMessage,
      };
      if (data.usage?.total_tokens !== undefined) {
        result.tokensUsed = data.usage.total_tokens;
      }
      result.metadata = {
        model: data.model,
        finish_reason: firstChoice?.finish_reason,
      };
      if (toolCalls.length > 0) {
        result.toolCalls = toolCalls;
      }
      if (firstChoice?.finish_reason) {
        result.finishReason = firstChoice.finish_reason;
      }
      return result;
    } catch (error) {
      let errorMsg = error instanceof Error ? error.message : String(error);
      const cause =
        error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
      if (cause?.code) errorMsg += ` (${cause.code})`;
      throw new Error(`Failed to call ChatGPT: ${errorMsg}`);
    }
  }

  /**
   * Reads an OpenAI `stream: true` SSE response, forwarding text deltas as they arrive
   * and accumulating tool-call fragments (which OpenAI splits across many chunks by index).
   */
  private async consumeStream(
    body: ReadableStream<Uint8Array>,
    onDelta: (textChunk: string) => void,
  ): Promise<LLMResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let model: string | undefined;
    let finishReason: string | undefined;
    let totalTokens: number | undefined;
    const toolCallsByIndex = new Map<number, { id?: string; name?: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        let chunk: OpenAIStreamChunk;
        try {
          chunk = JSON.parse(payload) as OpenAIStreamChunk;
        } catch {
          continue;
        }

        if (typeof chunk.model === 'string') model = chunk.model;
        if (typeof chunk.usage?.total_tokens === 'number') totalTokens = chunk.usage.total_tokens;

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;

        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          content += delta.content;
          onDelta(delta.content);
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = typeof toolCallDelta.index === 'number' ? toolCallDelta.index : 0;
            const existing = toolCallsByIndex.get(index) ?? { arguments: '' };
            if (toolCallDelta.id) existing.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) existing.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments)
              existing.arguments += toolCallDelta.function.arguments;
            toolCallsByIndex.set(index, existing);
          }
        }
      }
    }

    // O Gemini (surface OpenAI-compat) emite a tool call sem `id`; gera um para não descartá-la.
    const toolCalls: LLMToolCall[] = [...toolCallsByIndex.entries()]
      .filter(([, call]) => Boolean(call.name))
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name as string,
        arguments: call.arguments ? decodeArguments(JSON.parse(call.arguments)) : {},
      }));

    if (!content && toolCalls.length === 0) {
      throw new Error('No message returned from OpenAI API');
    }

    const result: LLMResponse = { content };
    if (totalTokens !== undefined) result.tokensUsed = totalTokens;
    result.metadata = { model, finish_reason: finishReason };
    if (toolCalls.length > 0) result.toolCalls = toolCalls;
    if (finishReason) result.finishReason = finishReason;
    return result;
  }

  async call(
    context: string,
    messages: ResearchMessage[],
    userMessage: string,
    model: string = 'gpt-4o-mini',
    temperature: number = 0.7,
    maxTokens: number = 2000,
    tools?: LLMToolDefinition[],
  ): Promise<LLMResponse> {
    const openaiMessages: LLMConversationMessage[] = [
      ...(context ? [{ role: 'system' as const, content: context }] : []),
      ...messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    return this.complete(openaiMessages, model, temperature, maxTokens, tools);
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    return this.complete(
      request.transcript,
      request.model,
      request.temperature,
      request.maxTokens,
      request.tools,
      request.onDelta,
      request.signal,
    );
  }
}

const toOpenAiMessage = (message: LLMConversationMessage): Record<string, unknown> => {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: message.content.length > 0 ? message.content : null,
      tool_calls: message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: sanitizeToolName(toolCall.name),
          arguments: JSON.stringify(encodeArgumentKeys(toolCall.arguments)),
        },
      })),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
};

const parseToolCalls = (
  toolCalls:
    | Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>
    | undefined,
): LLMToolCall[] => {
  if (!toolCalls) return [];
  return toolCalls.map((toolCall) => {
    if (!toolCall.id || toolCall.type !== 'function' || !toolCall.function?.name) {
      throw new Error('Malformed tool call received from OpenAI API');
    }
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: toolCall.function.arguments
        ? decodeArguments(JSON.parse(toolCall.function.arguments))
        : {},
    };
  });
};

const sanitizeToolName = (name: string): string => name.replace(/[^a-zA-Z0-9_-]/g, '__');

// Backends atrás de roteadores OpenAI-compat (ex.: Anthropic) só aceitam chaves de propriedade
// `^[a-zA-Z0-9_.-]{1,64}$` no schema das tools e recusam a requisição inteira com `@type`/
// `@referredType` (TMF). Codifica cada caractere inválido como `_xHH_` na ida e desfaz na volta.
const INVALID_KEY_CHAR = /[^a-zA-Z0-9_.-]/g;
const ENCODED_KEY_CHAR = /_x([0-9a-f]{2,4})_/g;

export const encodePropertyKey = (key: string): string =>
  key.replace(INVALID_KEY_CHAR, (char) => `_x${char.charCodeAt(0).toString(16)}_`);

export const decodePropertyKey = (key: string): string =>
  key.replace(ENCODED_KEY_CHAR, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const encodeSchemaKeys = (schema: unknown): Record<string, unknown> =>
  encodeSchemaNode(schema) as Record<string, unknown>;

const encodeSchemaNode = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(encodeSchemaNode);
  if (!isPlainObject(node)) return node;
  const encoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && isPlainObject(value)) {
      encoded[key] = Object.fromEntries(
        Object.entries(value).map(([prop, propSchema]) => [
          encodePropertyKey(prop),
          encodeSchemaNode(propSchema),
        ]),
      );
    } else if (key === 'required' && Array.isArray(value)) {
      encoded[key] = value.map((item) =>
        typeof item === 'string' ? encodePropertyKey(item) : item,
      );
    } else {
      encoded[key] = encodeSchemaNode(value);
    }
  }
  return encoded;
};

const mapKeysDeep = (value: unknown, mapKey: (key: string) => string): unknown => {
  if (Array.isArray(value)) return value.map((item) => mapKeysDeep(item, mapKey));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [mapKey(key), mapKeysDeep(item, mapKey)]),
  );
};

const decodeArguments = (value: unknown): Record<string, unknown> => {
  const decoded = mapKeysDeep(value, decodePropertyKey);
  return isPlainObject(decoded) ? decoded : {};
};

const encodeArgumentKeys = (value: Record<string, unknown>): unknown =>
  mapKeysDeep(value, encodePropertyKey);
