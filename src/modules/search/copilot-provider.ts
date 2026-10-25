import { ChatGPTProvider } from './chatgpt-provider.js';

export const DEFAULT_COPILOT_MODEL = 'gpt-4o-mini';
export const DEFAULT_COPILOT_API_ENDPOINT = 'https://api.openai.com/v1';

/**
 * Modelo único do Copilot, vindo de `COPILOT_MODEL`. Não há escolha por conversa nem por
 * requisição: o modelo pedido pelo cliente ou gravado na sessão é ignorado.
 */
export const resolveCopilotModel = (env: NodeJS.ProcessEnv = process.env): string =>
  env.COPILOT_MODEL?.trim() || DEFAULT_COPILOT_MODEL;

/**
 * Provider único do Copilot: qualquer endpoint compatível com a API OpenAI (`/chat/completions`),
 * inclusive roteadores de LLM. Sem `COPILOT_API_KEY` devolve `null` e o chamador cai no fallback
 * local sobre `docs/`.
 */
export const createCopilotProvider = (
  env: NodeJS.ProcessEnv = process.env,
): ChatGPTProvider | null => {
  const apiKey = env.COPILOT_API_KEY?.trim();
  if (!apiKey) return null;
  return new ChatGPTProvider(
    apiKey,
    env.COPILOT_API_ENDPOINT?.trim() || DEFAULT_COPILOT_API_ENDPOINT,
  );
};
