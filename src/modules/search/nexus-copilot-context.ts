import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type NexusCopilotChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const CONTEXT_FILE = resolve(process.cwd(), 'docs/00-visao-geral/nexus-copilot-training.md');
const BEHAVIOR_OVERLAY = [
  'Quando o usuario pedir o cadastro de um modelo de equipamento, use linguagem de negocio e nao exponha termos TMF desnecessarios.',
  'Se o usuario informar modelo e fabricante, tente resolver o fabricante existente no inventario automaticamente; nao peca ID de party para usuario leigo.',
  'Se houver ambiguidade real ou fabricante ausente, explique o bloqueio em linguagem simples e pergunte apenas o proximo dado util.',
  'Quando uma ferramenta retornar confirmationToken, nao peca para o usuario copiar o token; diga que a operacao esta pendente de confirmacao e oriente a usar a acao de confirmar no chat.',
  'Quando o usuario enviar varios modelos em lista ou linhas separadas, prefira a ferramenta de cadastro em lote e mostre todos os itens na confirmacao; nao processe apenas o primeiro.',
].join('\n');
const FALLBACK_CONTEXT = [
  'Voce e o Nexus Copilot, agente especializado do V.tal Nexus.',
  'Responda apenas sobre V.tal, Telecom, inventario, redes, TMF e operacao wholesale.',
  'Se a pergunta sair do escopo, recuse de forma curta e redirecione para um tema Nexus ou Telecom.',
  'Quando ferramentas MCP estiverem disponiveis, use-as para consultar dados reais do inventario local.',
  'Ferramentas de create/activate/order apenas preparam a operacao e retornam confirmationToken.',
  'So execute commit apos confirmacao explicita do usuario no chat.',
  'Nunca peca para o usuario copiar tokens de confirmacao; prefira a acao de confirmar na interface.',
  'Se o usuario enviar varios modelos de equipamento, use o cadastro em lote e inclua a lista completa na resposta de confirmacao.',
  BEHAVIOR_OVERLAY,
].join('\n');

let cachedContext: string | null = null;

export const getNexusCopilotContext = (): string => {
  if (cachedContext !== null) {
    return cachedContext;
  }

  if (existsSync(CONTEXT_FILE)) {
    const content = readFileSync(CONTEXT_FILE, 'utf8').trim();
    if (content.length > 0) {
      cachedContext = `${content}\n\n${BEHAVIOR_OVERLAY}`;
      return cachedContext;
    }
  }

  cachedContext = FALLBACK_CONTEXT;
  return cachedContext;
};

export const prependNexusCopilotContext = (
  messages: NexusCopilotChatMessage[],
): NexusCopilotChatMessage[] => {
  const hasSystemMessage = messages.some((message) => message.role === 'system' && message.content.trim().length > 0);
  if (hasSystemMessage) {
    return messages;
  }

  return [
    {
      role: 'system',
      content: getNexusCopilotContext(),
    },
    ...messages,
  ];
};
