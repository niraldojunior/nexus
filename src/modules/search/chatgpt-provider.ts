import type { ResearchMessage, LLMResponse } from './domain.js';

/**
 * ChatGPT/OpenAI Provider for LLM responses
 * Integrates with OpenAI API
 */
export class ChatGPTProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  /**
   * Call ChatGPT API and get response
   */
  async call(
    context: string,
    messages: ResearchMessage[],
    userMessage: string,
    model: string = 'gpt-4',
    temperature: number = 0.7,
    maxTokens: number = 2000,
  ): Promise<LLMResponse> {
    // Convert internal message format to OpenAI format
    const openaiMessages = [
      ...(context ? [{ role: 'system' as const, content: context }] : []),
      ...messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: openaiMessages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json() as any;

      const assistantMessage = data.choices[0]?.message?.content;
      if (!assistantMessage) {
        throw new Error('No message returned from OpenAI API');
      }

      return {
        content: assistantMessage,
        tokensUsed: data.usage?.total_tokens,
        metadata: {
          model: data.model,
          finish_reason: data.choices[0]?.finish_reason,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('ChatGPT API Error:', { apiKey: this.apiKey.substring(0, 20) + '...', error: errorMsg });
      throw new Error(`Failed to call ChatGPT: ${errorMsg}`);
    }
  }
}
