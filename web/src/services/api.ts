import { bearerToken } from './session';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const API_BASE_URL = '/v1';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  message?: string;
  error?: string;
};

export const sendMessage = async (messages: ChatMessage[]) => {
  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken()}`,
    },
    // Sem `model`: o backend sempre usa o COPILOT_MODEL configurado.
    body: JSON.stringify({
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

  if (!response.ok) {
    const message = data?.message || data?.error || `Chat request failed: ${response.status}`;
    throw new Error(message);
  }

  const assistantMessage = data?.choices?.[0]?.message?.content;
  if (!assistantMessage) {
    throw new Error('A resposta do Copilot veio vazia.');
  }

  return assistantMessage as string;
};
