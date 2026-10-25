import { useCallback, useEffect, useRef, useState } from 'react';
import {
  confirmResearchSessionAction,
  createResearchSession,
  getResearchSession,
  sendResearchMessageStream,
  updateResearchSessionTitle,
  type CopilotClientContext,
  type CopilotMapAction,
  type ResearchAssistantMessage,
  type ResearchSession,
} from '../../services/researchApi';

export type CopilotMessage = ResearchAssistantMessage;

export type PendingConfirmationItem = {
  model: string;
  manufacturerName: string;
  equipmentType: string;
};

export type PendingConfirmation = {
  confirmationToken: string;
  summary?: string;
  expiresAt?: string;
  domain?: string;
  operation?: string;
  items?: PendingConfirmationItem[];
};

type Options = {
  /** `null` é uma conversa nova: a sessão só é criada no primeiro envio. */
  sessionId: string | null;
  /** Estado do mapa a enviar com cada mensagem (só o painel do mapa usa). */
  getClientContext?: () => CopilotClientContext | undefined;
  /** Ações `map_*` pedidas pelo Copilot durante o stream. */
  onClientAction?: (action: CopilotMapAction) => void;
  /** Uma sessão criada no primeiro envio; chamado só depois do `done` do stream. */
  onSessionCreated?: (session: ResearchSession) => void;
  onSessionUpdated?: (session: ResearchSession) => void;
};

const SHORT_TITLE_LENGTH = 50;
const shortTitle = (text: string): string =>
  text.substring(0, SHORT_TITLE_LENGTH) + (text.length > SHORT_TITLE_LENGTH ? '...' : '');

const isAbort = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

/**
 * Estado de uma conversa do Copilot (mensagens, stream, criação lazy da sessão e confirmações).
 * Vive fora do componente de visão para sobreviver quando o painel do mapa troca de conteúdo no
 * meio de um stream (ex.: o Copilot foca um local e o painel de detalhe abre).
 */
export function useCopilotConversation({
  sessionId,
  getClientContext,
  onClientAction,
  onSessionCreated,
  onSessionUpdated,
}: Options) {
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmingToken, setConfirmingToken] = useState<string | null>(null);
  const [resolvedTokens, setResolvedTokens] = useState<Set<string>>(() => new Set());
  const pendingMessageIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Sessão que nós mesmos criamos: quando o pai a repassa como `sessionId`, não recarregar,
  // senão o reload apagaria o stream em andamento.
  const ownSessionIdRef = useRef<string | null>(null);

  // Callbacks por ref: o stream em andamento sempre chama a versão mais recente.
  const callbacksRef = useRef({
    getClientContext,
    onClientAction,
    onSessionCreated,
    onSessionUpdated,
  });
  callbacksRef.current = { getClientContext, onClientAction, onSessionCreated, onSessionUpdated };

  useEffect(() => {
    if (sessionId && sessionId === ownSessionIdRef.current) return;
    ownSessionIdRef.current = null;
    abortRef.current?.abort();
    setError(null);
    setInput('');
    setResolvedTokens(new Set());

    if (!sessionId) {
      setSession(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingSession(true);
    getResearchSession(sessionId)
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setMessages((data.messages ?? []).filter((m) => m.role !== 'system'));
      })
      .catch((err) => {
        if (cancelled) return;
        setSession(null);
        setMessages([]);
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async () => {
    const userInput = input.trim();
    if (!userInput || sending) return;

    const stamp = Date.now();
    const optimisticUser: CopilotMessage = {
      id: `temp-user-${stamp}`,
      role: 'user',
      content: userInput,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistantId = `temp-assistant-${stamp}`;
    const optimisticAssistant: CopilotMessage = {
      id: optimisticAssistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };
    const dropOptimistic = (prev: CopilotMessage[]) =>
      prev.filter((m) => m.id !== optimisticUser.id && m.id !== optimisticAssistantId);

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);
    pendingMessageIdRef.current = optimisticUser.id;
    const abortController = new AbortController();
    abortRef.current = abortController;
    setSending(true);

    let createdHere: ResearchSession | null = null;
    try {
      let active = session;
      const isFirstMessage = messages.length === 0;
      if (!active) {
        active = await createResearchSession(shortTitle(userInput));
        createdHere = active;
        ownSessionIdRef.current = active.id;
        setSession(active);
      }

      const clientContext = callbacksRef.current.getClientContext?.();
      const result = await sendResearchMessageStream(active.id, userInput, {
        signal: abortController.signal,
        ...(clientContext ? { clientContext } : {}),
        onClientAction: (action) => callbacksRef.current.onClientAction?.(action),
        onDelta: (textChunk) => {
          pendingMessageIdRef.current = null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticAssistantId ? { ...m, content: m.content + textChunk } : m,
            ),
          );
        },
      });

      setMessages((prev) => [...dropOptimistic(prev), result.userMessage, result.assistantMessage]);

      if (createdHere) {
        callbacksRef.current.onSessionCreated?.(createdHere);
      } else if (isFirstMessage) {
        // Sessão vazia preexistente (página de chat): o título vem da primeira pergunta.
        try {
          const updated = await updateResearchSessionTitle(active.id, shortTitle(userInput));
          setSession(updated);
          callbacksRef.current.onSessionUpdated?.(updated);
        } catch (err) {
          console.error('Erro ao atualizar título:', err);
        }
      }
    } catch (err) {
      if (isAbort(err)) {
        // Parada intencional: mantém o texto parcial já recebido.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticAssistantId
              ? { ...m, metadata: { ...(m.metadata ?? {}), stopped: true } }
              : m,
          ),
        );
        if (createdHere) callbacksRef.current.onSessionCreated?.(createdHere);
      } else {
        setMessages(dropOptimistic);
        setInput(userInput);
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        // A sessão criada neste envio fica vazia e reaproveitável no próximo.
      }
    } finally {
      setSending(false);
      pendingMessageIdRef.current = null;
      abortRef.current = null;
    }
  }, [input, messages.length, sending, session]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Volta a uma conversa nova mesmo quando `sessionId` já era `null` (botão "+"). */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    ownSessionIdRef.current = null;
    setSession(null);
    setMessages([]);
    setInput('');
    setError(null);
    setResolvedTokens(new Set());
  }, []);

  /** Renomeia a conversa ativa. Título vazio ou igual ao atual não gera requisição. */
  const rename = useCallback(
    async (title: string) => {
      const nextTitle = title.trim();
      if (!session || !nextTitle || nextTitle === session.title) return;
      try {
        const updated = await updateResearchSessionTitle(session.id, nextTitle);
        setSession(updated);
        callbacksRef.current.onSessionUpdated?.(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao atualizar título');
      }
    },
    [session],
  );

  const confirmPending = useCallback(
    async (message: CopilotMessage, pending: PendingConfirmation) => {
      if (!session || confirmingToken === pending.confirmationToken) return;
      setError(null);
      setConfirmingToken(pending.confirmationToken);
      try {
        const result = await confirmResearchSessionAction(session.id, pending.confirmationToken);
        setResolvedTokens((current) => new Set(current).add(pending.confirmationToken));
        setMessages((current) => [...current, result.assistantMessage]);
        if (result.confirmation.shouldRefreshResourceCatalog && result.confirmation.ok) {
          window.dispatchEvent(
            new CustomEvent('nexus:resource-catalog-updated', {
              detail: {
                sessionId: session.id,
                token: pending.confirmationToken,
                messageId: message.id,
                domain: result.confirmation.domain,
                operation: result.confirmation.operation,
              },
            }),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao confirmar cadastro.');
      } finally {
        setConfirmingToken(null);
      }
    },
    [confirmingToken, session],
  );

  return {
    session,
    messages,
    input,
    setInput,
    error,
    setError,
    loadingSession,
    sending,
    pendingMessageId: pendingMessageIdRef.current,
    confirmingToken,
    resolvedTokens,
    send,
    stop,
    reset,
    rename,
    confirmPending,
  };
}
