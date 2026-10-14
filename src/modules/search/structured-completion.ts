import { ChatGPTProvider } from './chatgpt-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { resolveDefaultModel, resolveResearchProvider } from './provider-router.js';
import type { ResourceCatalogAiCompletionPort } from '../resource/resource-catalog-ai-optimizer.js';

/**
 * Cria a porta de conclusão estruturada (um único tool call) sobre os providers OpenAI/Gemini já
 * existentes. Devolve `undefined` quando nenhum provider está configurado, o que torna a
 * otimização por IA indisponível (503) em vez de cair num fallback local.
 */
export const createStructuredCompletionPort = (
  env: NodeJS.ProcessEnv = process.env,
): ResourceCatalogAiCompletionPort | undefined => {
  const chatGptProvider = env.OPENAI_API_KEY
    ? new ChatGPTProvider(env.OPENAI_API_KEY, env.API_ENDPOINT || 'https://api.openai.com/v1')
    : null;
  const geminiProvider = env.GEMINI_API_KEY
    ? new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_API_ENDPOINT)
    : null;
  const model = resolveDefaultModel(env);
  const provider = resolveResearchProvider(model, { chatGptProvider, geminiProvider });
  if (!provider) return undefined;

  const MAX_ATTEMPTS = 3;

  return {
    completeWithTool: async (request) => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await attemptOnce(request);
        } catch (error) {
          // O Gemini às vezes gera a chamada da ferramenta com JSON inválido; é intermitente.
          const transient = error instanceof Error && /MALFORMED_FUNCTION_CALL/.test(error.message);
          if (!transient || attempt >= MAX_ATTEMPTS || request.signal?.aborted) throw error;
        }
      }
    },
  };

  async function attemptOnce(
    request: Parameters<ResourceCatalogAiCompletionPort['completeWithTool']>[0],
  ) {
    const response = await provider!.complete(
      [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      model,
      0.2,
      // Folga para o raciocínio interno do Gemini 2.5, que conta contra o limite de saída.
      32000,
      [
        {
          name: request.toolName,
          description: request.toolDescription,
          inputSchema: request.inputSchema,
        },
      ],
      undefined,
      request.signal,
    );
    const call = response.toolCalls?.[0];
    return call ? { toolName: call.name, arguments: call.arguments } : undefined;
  }
};
