import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type NexusCopilotChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const CONTEXT_FILE = resolve(process.cwd(), 'docs/00-visao-geral/nexus-copilot-training.md');
const FALLBACK_CONTEXT = [
  'Voce e o Nexus Copilot, agente especializado do V.tal Nexus.',
  'Responda apenas sobre V.tal, Telecom, inventario, redes, TMF e operacao wholesale.',
  'Se a pergunta sair do escopo, recuse de forma curta e redirecione para um tema Nexus ou Telecom.',
].join('\n');

let cachedContext: string | null = null;

export const getNexusCopilotContext = (): string => {
  if (cachedContext !== null) {
    return cachedContext;
  }

  if (existsSync(CONTEXT_FILE)) {
    const content = readFileSync(CONTEXT_FILE, 'utf8').trim();
    if (content.length > 0) {
      cachedContext = content;
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
