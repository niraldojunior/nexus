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
      throw new Error('OPENAI_API_KEY environment variable is required');
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
  ): Promise<LLMResponse> {
    const streaming = typeof onDelta === 'function';
    try {
      const apiResponse = await fetch(`${this.apiEndpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((message) => toOpenAiMessage(message)),
          temperature,
          max_tokens: maxTokens,
          ...(streaming ? { stream: true } : {}),
          ...(tools && tools.length > 0
            ? {
                tools: tools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
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
      const errorMsg = error instanceof Error ? error.message : String(error);
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

        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        if (typeof chunk.model === 'string') model = chunk.model;
        if (chunk.usage?.total_tokens !== undefined) totalTokens = chunk.usage.total_tokens;

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

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
            if (toolCallDelta.function?.arguments) existing.arguments += toolCallDelta.function.arguments;
            toolCallsByIndex.set(index, existing);
          }
        }
      }
    }

    const toolCalls: LLMToolCall[] = [...toolCallsByIndex.values()]
      .filter((call): call is { id: string; name: string; arguments: string } => Boolean(call.id && call.name))
      .map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {},
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
          arguments: JSON.stringify(toolCall.arguments),
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
  toolCalls: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }> | undefined,
): LLMToolCall[] => {
  if (!toolCalls) return [];
  return toolCalls.map((toolCall) => {
    if (!toolCall.id || toolCall.type !== 'function' || !toolCall.function?.name) {
      throw new Error('Malformed tool call received from OpenAI API');
    }
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) as Record<string, unknown> : {},
    };
  });
};

const sanitizeToolName = (name: string): string => name.replace(/[^a-zA-Z0-9_-]/g, '__');
