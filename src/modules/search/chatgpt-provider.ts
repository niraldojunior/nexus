import type { ResearchMessage, LLMResponse } from './domain.js';

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenAIChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
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
    messages: OpenAIChatMessage[],
    model: string = 'gpt-4o-mini',
    temperature: number = 0.7,
    maxTokens: number = 2000,
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
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!apiResponse.ok) {
        const error = await apiResponse.text();
        throw new Error(`OpenAI API error: ${apiResponse.status} ${error}`);
      }

      const data = (await apiResponse.json()) as OpenAIChatCompletionResponse;

      const choices = data.choices ?? [];
      const assistantMessage = choices[0]?.message?.content ?? undefined;
      if (!assistantMessage) {
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
        finish_reason: choices[0]?.finish_reason,
      };
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
  ): Promise<LLMResponse> {
    const openaiMessages: OpenAIChatMessage[] = [
      ...(context ? [{ role: 'system' as const, content: context }] : []),
      ...messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    return this.complete(openaiMessages, model, temperature, maxTokens);
  }
}
