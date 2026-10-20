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

  const MAX_ATTEMPTS = 4;
  const BACKOFF_MS = [2000, 5000, 10000];

  // O Gemini às vezes gera a chamada da ferramenta com JSON inválido; é intermitente.
  // Picos de demanda do provider (429/5xx, "UNAVAILABLE") também são temporários.
  const isTransient = (error: unknown): boolean =>
    error instanceof Error &&
    /MALFORMED_FUNCTION_CALL|fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|API error: (429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(
      error.message,
    );

  const wait = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });

  return {
    completeWithTool: async (request) => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await attemptOnce(request);
        } catch (error) {
          if (!isTransient(error) || attempt >= MAX_ATTEMPTS || request.signal?.aborted) {
            throw error;
          }
          await wait(BACKOFF_MS[attempt - 1] ?? 10000, request.signal);
          if (request.signal?.aborted) throw error;
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
      // Streaming (delta descartado) mantém a conexão ativa durante o raciocínio longo; sem ele
      // a resposta única passa ~60s muda e a conexão cai com "fetch failed".
      () => undefined,
      request.signal,
      // Só o Gemini: limita o raciocínio para responder antes da conexão ociosa cair (~60s).
      model.startsWith('gemini') ? 'low' : undefined,
    );
    const call = response.toolCalls?.[0];
    return call ? { toolName: call.name, arguments: call.arguments } : undefined;
  }
};
