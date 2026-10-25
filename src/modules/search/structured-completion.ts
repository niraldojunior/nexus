import { createCopilotProvider, resolveCopilotModel } from './copilot-provider.js';
import type { ResourceCatalogAiCompletionPort } from '../resource/resource-catalog-ai-optimizer.js';

/**
 * Cria a porta de conclusão estruturada (um único tool call) sobre o provider do Copilot
 * (`COPILOT_*`). Devolve `undefined` quando ele não está configurado, o que torna a otimização
 * por IA indisponível (503) em vez de cair num fallback local.
 */
export const createStructuredCompletionPort = (
  env: NodeJS.ProcessEnv = process.env,
): ResourceCatalogAiCompletionPort | undefined => {
  const provider = createCopilotProvider(env);
  const model = resolveCopilotModel(env);
  if (!provider) return undefined;

  const MAX_ATTEMPTS = 4;
  const BACKOFF_MS = [2000, 5000, 10000];

  // Alguns modelos (ex.: Gemini) às vezes geram a chamada da ferramenta com JSON inválido.
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
      // Folga para modelos com raciocínio interno, que conta contra o limite de saída.
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
      // Só modelos Gemini: limita o raciocínio para responder antes da conexão ociosa cair (~60s).
      model.toLowerCase().startsWith('gemini') ? 'low' : undefined,
    );
    const call = response.toolCalls?.[0];
    return call ? { toolName: call.name, arguments: call.arguments } : undefined;
  }
};
