import type { ChatGPTProvider } from './chatgpt-provider.js';
import type { GeminiProvider } from './gemini-provider.js';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Default model for a new conversation when the client omits one. Prefers Gemini when a
 * `GEMINI_API_KEY` is configured (it is the working provider today), otherwise falls back to OpenAI.
 */
export const resolveDefaultModel = (env: NodeJS.ProcessEnv = process.env): string =>
  env.GEMINI_API_KEY
    ? env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
    : env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

/**
 * Picks the LLM provider for a conversation from its `model`: `gemini*` routes to Gemini, anything
 * else to OpenAI. Returns `null` when the chosen provider has no API key configured (its instance is
 * `null`), so the caller falls back to the local-docs provider.
 */
export const resolveResearchProvider = (
  model: string | undefined,
  providers: { chatGptProvider: ChatGPTProvider | null; geminiProvider: GeminiProvider | null },
): ChatGPTProvider | null =>
  typeof model === 'string' && model.toLowerCase().startsWith('gemini')
    ? providers.geminiProvider
    : providers.chatGptProvider;
