import { bearerToken } from './session';

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

export type ResearchSession = {
  '@type': 'ResearchSession';
  id: string;
  href: string;
  userId: string;
  title: string;
  description?: string;
  context?: string;
  status: 'active' | 'archived' | 'deleted';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages?: ResearchAssistantMessage[];
  createdAt: string;
  updatedAt: string;
};

/** Estado do mapa enviado junto da mensagem; o backend valida e limita cada campo. */
export type CopilotClientContext = {
  surface: 'geo-map';
  selection?: { kind: 'site' | 'resource' | 'address' | 'project'; id: string; label?: string };
  center?: { lat: number; lng: number };
  scaleMeters?: number;
  bounds?: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  layers?: {
    groups: Array<{ id: string; label: string; state: 'all' | 'some' | 'none' }>;
    entities: Array<{ id: string; label: string; groupId?: string; visible: boolean }>;
  };
};

/** Ação que o Copilot pede ao navegador (evento SSE `client_action`). */
export type CopilotMapAction =
  | { type: 'focus_place'; siteId?: string; resourceId?: string; label?: string }
  | { type: 'fly_to'; lat: number; lng: number; spanMeters?: number }
  | {
      type: 'show_points';
      points: Array<{
        lat: number;
        lng: number;
        label?: string;
        siteId?: string;
        resourceId?: string;
      }>;
      fit: boolean;
    }
  | { type: 'set_base_layer'; layerId: string }
  | {
      type: 'set_layers';
      mode: 'show' | 'hide' | 'only';
      layerIds: string[];
      groupIds: string[];
      all: boolean;
    }
  | { type: 'clear' };

export type ResearchMessageStreamHandlers = {
  onDelta?: (textChunk: string) => void;
  onClientAction?: (action: CopilotMapAction) => void;
  clientContext?: CopilotClientContext;
  signal?: AbortSignal;
};

const authHeaders = (json = false): Record<string, string> => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  Authorization: `Bearer ${bearerToken()}`,
});

const requestError = async (response: Response, fallback: string): Promise<Error> => {
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
  } | null;
  const message =
    (typeof payload?.message === 'string' && payload.message.trim()) ||
    (typeof payload?.error === 'string' && payload.error.trim()) ||
    `${fallback} (${response.status})`;
  return new Error(message);
};

/** Conversas ativas do usuário, da mais recente para a mais antiga. */
export async function listResearchSessions(): Promise<ResearchSession[]> {
  const response = await fetch(`${API_BASE_URL}/research/sessions`, { headers: authHeaders() });
  if (!response.ok) throw await requestError(response, 'Erro ao carregar conversas');
  const data = (await response.json()) as ResearchSession[];
  return data
    .filter((session) => session.status === 'active')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Cria uma conversa; o modelo é sempre o COPILOT_MODEL do backend. */
export async function createResearchSession(title: string): Promise<ResearchSession> {
  const response = await fetch(`${API_BASE_URL}/research/sessions`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw await requestError(response, 'Erro ao criar conversa');
  return (await response.json()) as ResearchSession;
}

export async function getResearchSession(sessionId: string): Promise<ResearchSession> {
  const response = await fetch(
    `${API_BASE_URL}/research/sessions/${encodeURIComponent(sessionId)}`,
    { headers: authHeaders() },
  );
  if (!response.ok) throw await requestError(response, 'Erro ao carregar conversa');
  return (await response.json()) as ResearchSession;
}

/** Arquiva (soft-delete) a conversa. */
export async function archiveResearchSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/research/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  if (!response.ok) throw await requestError(response, 'Erro ao arquivar conversa');
}

export async function updateResearchSessionTitle(
  sessionId: string,
  title: string,
): Promise<ResearchSession> {
  const response = await fetch(
    `${API_BASE_URL}/research/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ title }) },
  );
  if (!response.ok) throw await requestError(response, 'Erro ao atualizar título');
  return (await response.json()) as ResearchSession;
}

/**
 * Sends a chat message and streams the assistant's reply via SSE, invoking `onDelta` for
 * each text chunk as it arrives. Resolves with the final persisted messages once the server
 * emits its `done` event; rejects (including with `AbortError` when `signal` is aborted) if
 * the stream fails before that.
 */
export async function sendResearchMessageStream(
  sessionId: string,
  message: string,
  { onDelta, onClientAction, clientContext, signal }: ResearchMessageStreamHandlers = {},
): Promise<ResearchMessageStreamResult> {
  const response = await fetch(
    `${API_BASE_URL}/research/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken()}`,
      },
      body: JSON.stringify({ message, ...(clientContext ? { clientContext } : {}) }),
      signal,
    },
  );

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    const errorMessage =
      (typeof payload?.message === 'string' && payload.message.trim()) ||
      (typeof payload?.error === 'string' && payload.error.trim()) ||
      `Failed to send message: ${response.status}`;
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

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataLine.slice('data:'.length).trim()) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (eventType === 'delta' && typeof data.text === 'string') {
        onDelta?.(data.text);
      } else if (eventType === 'client_action' && typeof data.type === 'string') {
        onClientAction?.(data as unknown as CopilotMapAction);
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
  const response = await fetch(
    `${API_BASE_URL}/research/sessions/${encodeURIComponent(sessionId)}/confirmations`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken()}`,
      },
      body: JSON.stringify({ confirmationToken }),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    ResearchConfirmationResponse | { message?: string; error?: string } | null;

  if (!response.ok) {
    const errorPayload = payload as { message?: string; error?: string } | null;
    const message = errorPayload
      ? typeof errorPayload.message === 'string' && errorPayload.message.trim()
        ? errorPayload.message
        : typeof errorPayload.error === 'string' && errorPayload.error.trim()
          ? errorPayload.error
          : `Confirmation request failed (${response.status})`
      : `Confirmation request failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload || !('assistantMessage' in payload)) {
    throw new Error('Confirmation response was empty.');
  }

  return payload as ResearchConfirmationResponse;
}
