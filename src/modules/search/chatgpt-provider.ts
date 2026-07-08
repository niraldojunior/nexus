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
  ): Promise<LLMResponse> {
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
      });

      if (!apiResponse.ok) {
        const error = await apiResponse.text();
        throw new Error(`OpenAI API error: ${apiResponse.status} ${error}`);
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
