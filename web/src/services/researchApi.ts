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
