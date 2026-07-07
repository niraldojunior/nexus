type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const API_BASE_URL = '/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  message?: string;
  error?: string;
};

const getAuthToken = (): string => localStorage.getItem('authToken') || 'change-me';

export const sendMessage = async (messages: ChatMessage[]) => {
  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
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
    throw new Error('A resposta do ChatGPT veio vazia.');
  }

  return assistantMessage as string;
};
