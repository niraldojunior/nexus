const API_BASE_URL = '/v1';

export type ResearchAssistantMessage = {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ResearchConfirmationResponse = {
  assistantMessage: ResearchAssistantMessage;
  confirmation: {
    ok: boolean;
    domain: string;
    operation: string;
    shouldRefreshResourceCatalog: boolean;
  };
};

export type ResearchMessageStreamResult = {
  userMessage: ResearchAssistantMessage;
  assistantMessage: ResearchAssistantMessage;
};

export type ResearchMessageStreamHandlers = {
  onDelta?: (textChunk: string) => void;
  signal?: AbortSignal;
};

/**
 * Sends a chat message and streams the assistant's reply via SSE, invoking `onDelta` for
 * each text chunk as it arrives. Resolves with the final persisted messages once the server
 * emits its `done` event; rejects (including with `AbortError` when `signal` is aborted) if
 * the stream fails before that.
 */
export async function sendResearchMessageStream(
  sessionId: string,
  message: string,
  { onDelta, signal }: ResearchMessageStreamHandlers = {},
): Promise<ResearchMessageStreamResult> {
  const response = await fetch(`${API_BASE_URL}/research/sessions/${encodeURIComponent(sessionId)}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('authToken') || 'change-me'}`,
    },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    const errorMessage = (typeof payload?.message === 'string' && payload.message.trim())
      || (typeof payload?.error === 'string' && payload.error.trim())
      || `Failed to send message: ${response.status}`;
    throw new Error(errorMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ResearchMessageStreamResult | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const rawEvents = buffer.split('\n\n');
    buffer = rawEvents.pop() ?? '';

    for (const rawEvent of rawEvents) {
      const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) continue;
      const eventLine = rawEvent.split('\n').find((line) => line.startsWith('event:'));
      const eventType = eventLine?.slice('event:'.length).trim() ?? 'message';

      let data: any;
      try {
        data = JSON.parse(dataLine.slice('data:'.length).trim());
      } catch {
        continue;
      }

      if (eventType === 'delta' && typeof data.text === 'string') {
        onDelta?.(data.text);
      } else if (eventType === 'done') {
        result = data as ResearchMessageStreamResult;
      } else if (eventType === 'error') {
        streamError = typeof data.message === 'string' ? data.message : 'Erro ao gerar resposta.';
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error('A resposta terminou de forma inesperada.');
  return result;
}

export async function confirmResearchSessionAction(
  sessionId: string,
  confirmationToken: string,
): Promise<ResearchConfirmationResponse> {
  const response = await fetch(`${API_BASE_URL}/research/sessions/${encodeURIComponent(sessionId)}/confirmations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('authToken') || 'change-me'}`,
    },
    body: JSON.stringify({ confirmationToken }),
  });

  const payload = await response.json().catch(() => null) as
    | ResearchConfirmationResponse
    | { message?: string; error?: string }
    | null;

  if (!response.ok) {
    const errorPayload = payload as { message?: string; error?: string } | null;
    const message = errorPayload
      ? (typeof errorPayload.message === 'string' && errorPayload.message.trim()
          ? errorPayload.message
          : typeof errorPayload.error === 'string' && errorPayload.error.trim()
            ? errorPayload.error
            : `Confirmation request failed (${response.status})`)
      : `Confirmation request failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload || !('assistantMessage' in payload)) {
    throw new Error('Confirmation response was empty.');
  }

  return payload as ResearchConfirmationResponse;
}
