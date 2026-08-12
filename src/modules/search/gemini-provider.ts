import { ChatGPTProvider } from './chatgpt-provider.js';

/**
 * Default base URL for Google Gemini's OpenAI-compatible surface. It speaks the same
 * `/chat/completions` protocol as OpenAI (streaming + function calling included), so we reuse the
 * entire request/stream/tool-call machinery of {@link ChatGPTProvider} instead of reimplementing it.
 */
export const DEFAULT_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai';

/**
 * Google Gemini provider. Thin subclass of {@link ChatGPTProvider} that only fixes the default
 * endpoint — Gemini is reached through its OpenAI-compatible API, authenticated with the same
 * `Authorization: Bearer <key>` header.
 */
export class GeminiProvider extends ChatGPTProvider {
  constructor(apiKey: string, apiEndpoint?: string) {
    super(apiKey, apiEndpoint && apiEndpoint.trim() ? apiEndpoint : DEFAULT_GEMINI_ENDPOINT);
  }
}
