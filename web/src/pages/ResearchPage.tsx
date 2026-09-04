import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Loader2, Trash2, Send, Square } from 'lucide-react';
import MarkdownMessage from '../components/MarkdownMessage';
import CopilotPendingResponse from '../components/CopilotPendingResponse';
import NexusLoadingMark from '../components/NexusLoadingMark';
import Diamond from '../components/Diamond';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';
import { scrollChatAnchorIntoView, scrollChatToBottom } from '../utils/chatScroll';
import {
  confirmResearchSessionAction,
  sendResearchMessageStream,
  type ResearchConfirmationResponse,
} from '../services/researchApi';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

type PendingConfirmationMetadata = {
  confirmationToken: string;
  summary?: string;
  expiresAt?: string;
  domain?: string;
  operation?: string;
  items?: PendingConfirmationItem[];
};

type PendingConfirmationItem = {
  model: string;
  manufacturerName: string;
  equipmentType: string;
};

const getPendingConfirmationLabel = (pending?: PendingConfirmationMetadata): string => {
  if (!pending?.operation) return 'Confirmar operação';
  if (pending.operation === 'delete_equipment_model') return 'Confirmar remoção';
  if (pending.operation === 'create_equipment_models') return 'Confirmar cadastro';
  if (pending.operation === 'create_equipment_model') return 'Confirmar cadastro';
  if (pending.operation === 'create_condominium') return 'Confirmar cadastro';
  if (pending.operation === 'create_address') return 'Confirmar cadastro';
  if (pending.operation === 'create_site') return 'Confirmar cadastro';
  if (pending.operation === 'update_physical_resource') return 'Confirmar atualização';
  return 'Confirmar operação';
};

const getPendingConfirmationTitle = (pending?: PendingConfirmationMetadata): string => {
  if (!pending?.operation) return 'Operação pendente';
  if (pending.operation === 'create_equipment_models') return 'Cadastro em lote pendente';
  if (pending.operation === 'delete_equipment_model') return 'Remoção pendente';
  if (pending.operation === 'create_equipment_model') return 'Cadastro pendente';
  if (pending.operation === 'create_condominium') return 'Cadastro de condomínio pendente';
  if (pending.operation === 'create_address') return 'Cadastro de endereço pendente';
  if (pending.operation === 'create_site') return 'Cadastro de site pendente';
  if (pending.operation === 'update_physical_resource') return 'Atualização pendente';
  return 'Operação pendente';
};

const formatPendingItemLabel = (item: PendingConfirmationItem): string =>
  `${item.model} ${item.manufacturerName} ${item.equipmentType}`;

interface ResearchSession {
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
  messages?: Message[];
  createdAt: string;
  updatedAt: string;
}

export const ResearchPage: React.FC<{
  sessionId: string;
  onBack?: () => void;
  onSessionUpdated?: (session: ResearchSession) => void;
}> = ({ sessionId, onBack, onSessionUpdated }) => {
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [confirmingToken, setConfirmingToken] = useState<string | null>(null);
  const [resolvedConfirmationTokens, setResolvedConfirmationTokens] = useState<Set<string>>(
    () => new Set(),
  );
  const pendingMessageIdRef = useRef<string | null>(null);
  const activeTurnAnchorRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useAutoResizeTextarea(input, 220);

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sendingMessage && pendingMessageIdRef.current) {
      requestAnimationFrame(() => {
        scrollChatAnchorIntoView(messagesScrollRef.current, activeTurnAnchorRef.current);
      });
      return;
    }

    requestAnimationFrame(() => {
      scrollChatToBottom(messagesScrollRef.current);
    });
  }, [sessionId, messages.length, sendingMessage]);

  const loadSession = async (id: string) => {
    try {
      setLoadingSession(true);
      const response = await fetch(`/v1/research/sessions/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });

      if (!response.ok) throw new Error('Erro ao carregar conversa');

      const data = (await response.json()) as ResearchSession;
      setSession(data);
      setMessages((data.messages || []).filter((m) => m.role !== 'system'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoadingSession(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Arquivar esta conversa?')) return;

    try {
      const response = await fetch(`/v1/research/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });

      if (response.ok) {
        onBack?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao arquivar');
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !session || sendingMessage) return;

    const userInput = input.trim();
    const isFirstMessage = messages.length === 0;
    const optimisticUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: userInput,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistantId = `temp-assistant-${Date.now()}`;
    const optimisticAssistantMessage: Message = {
      id: optimisticAssistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, optimisticUserMessage, optimisticAssistantMessage]);
    pendingMessageIdRef.current = optimisticUserMessage.id;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setSendingMessage(true);

    try {
      const result = await sendResearchMessageStream(session.id, userInput, {
        signal: abortController.signal,
        onDelta: (textChunk) => {
          pendingMessageIdRef.current = null;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === optimisticAssistantId
                ? { ...message, content: message.content + textChunk }
                : message,
            ),
          );
        },
      });

      setMessages((prev) => [
        ...prev.filter(
          (message) =>
            message.id !== optimisticUserMessage.id && message.id !== optimisticAssistantId,
        ),
        result.userMessage,
        result.assistantMessage,
      ]);

      // Auto-generate title from first message if needed
      if (isFirstMessage) {
        const shortTitle = userInput.substring(0, 50) + (userInput.length > 50 ? '...' : '');
        await updateSessionTitle(shortTitle);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped generation on purpose: keep whatever partial text already streamed in.
        setMessages((prev) =>
          prev.map((message) =>
            message.id === optimisticAssistantId
              ? { ...message, metadata: { ...(message.metadata ?? {}), stopped: true } }
              : message,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.filter(
            (message) =>
              message.id !== optimisticUserMessage.id && message.id !== optimisticAssistantId,
          ),
        );
        setInput(userInput);
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      }
    } finally {
      setSendingMessage(false);
      pendingMessageIdRef.current = null;
      abortControllerRef.current = null;
    }
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
  };

  const updateSessionTitle = async (title: string) => {
    if (!session) return;

    try {
      const response = await fetch(`/v1/research/sessions/${session.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ title }),
      });

      if (response.ok) {
        const updated = (await response.json()) as ResearchSession;
        setSession(updated);
        onSessionUpdated?.(updated);
      }
    } catch (err) {
      console.error('Erro ao atualizar título:', err);
    }
  };

  const handleConfirmPending = async (message: Message, pending: PendingConfirmationMetadata) => {
    if (!session || confirmingToken === pending.confirmationToken) return;

    setError(null);
    setConfirmingToken(pending.confirmationToken);

    try {
      const result: ResearchConfirmationResponse = await confirmResearchSessionAction(
        session.id,
        pending.confirmationToken,
      );
      setResolvedConfirmationTokens((current) => {
        const next = new Set(current);
        next.add(pending.confirmationToken);
        return next;
      });
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const parsePendingConfirmation = (
    confirmation: unknown,
  ): PendingConfirmationMetadata | undefined => {
    if (!confirmation || typeof confirmation !== 'object') return undefined;
    const record = confirmation as Record<string, unknown>;
    const confirmationToken = record.confirmationToken;
    if (typeof confirmationToken !== 'string' || !confirmationToken.trim()) return undefined;

    return {
      confirmationToken,
      ...(typeof record.summary === 'string' ? { summary: record.summary } : {}),
      ...(typeof record.expiresAt === 'string' ? { expiresAt: record.expiresAt } : {}),
      ...(typeof record.domain === 'string' ? { domain: record.domain } : {}),
      ...(typeof record.operation === 'string' ? { operation: record.operation } : {}),
      ...(Array.isArray(record.items)
        ? {
            items: record.items
              .filter((item): item is PendingConfirmationItem => {
                if (!item || typeof item !== 'object') return false;
                const entry = item as Record<string, unknown>;
                return (
                  typeof entry.model === 'string' &&
                  typeof entry.manufacturerName === 'string' &&
                  typeof entry.equipmentType === 'string'
                );
              })
              .map((item) => ({
                model: item.model,
                manufacturerName: item.manufacturerName,
                equipmentType: item.equipmentType,
              })),
          }
        : {}),
    };
  };

  const readPendingConfirmations = (message: Message): PendingConfirmationMetadata[] => {
    const confirmations = message.metadata?.pendingConfirmations;
    if (Array.isArray(confirmations)) {
      return confirmations
        .map(parsePendingConfirmation)
        .filter((item): item is PendingConfirmationMetadata => Boolean(item));
    }
    const legacy = parsePendingConfirmation(message.metadata?.pendingConfirmation);
    return legacy ? [legacy] : [];
  };

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center">
          <NexusLoadingMark size={40} className="mx-auto mb-4 h-10 w-10" />
          <p className="text-app-muted">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center text-app-muted">
          <p>Conversa não encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Fixed Header - Top */}
      <div className="flex-shrink-0 border-b border-app-border bg-white px-6 py-4">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Diamond size={7} />
            <h1 className="truncate text-[0.98rem] font-semibold text-app-text">{session.title}</h1>
          </div>
          <button
            onClick={handleDelete}
            className="p-2 text-app-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition flex-shrink-0"
            title="Arquivar conversa"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex-shrink-0 px-6 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Scrollable Messages Area - Middle */}
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-6 py-2">
        <div className="vt-thread pb-10 pt-8">
          {messages.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center text-center">
              <p className="text-app-muted">Inicie uma conversa...</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`vt-turn ${msg.role === 'user' ? 'vt-turn-user' : 'vt-turn-assistant'}`}
              >
                {msg.role === 'user' ? (
                  <>
                    {pendingMessageIdRef.current === msg.id ? (
                      <div ref={activeTurnAnchorRef} className="h-1 w-full" />
                    ) : null}
                    <div className="vt-bubble">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <span className="vt-turn-time">
                      {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {sendingMessage && pendingMessageIdRef.current === msg.id ? (
                      <div className="w-full">
                        <CopilotPendingResponse />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="w-full">
                    <div className="vt-bubble">
                      <MarkdownMessage content={msg.content} />
                    </div>
                    {(() => {
                      const pendingItems = readPendingConfirmations(msg).filter(
                        (pending) => !resolvedConfirmationTokens.has(pending.confirmationToken),
                      );
                      if (pendingItems.length === 0) return null;
                      return (
                        <div className="mt-4 space-y-3">
                          {pendingItems.map((pending) => {
                            const isConfirming = confirmingToken === pending.confirmationToken;
                            return (
                              <div
                                key={pending.confirmationToken}
                                className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3"
                                style={{
                                  border: '1px solid var(--border)',
                                  borderLeft: '3px solid var(--vt-yellow)',
                                  borderRadius: 'var(--radius-lg)',
                                }}
                              >
                                <div className="min-w-0">
                                  <div
                                    className="flex items-center gap-2 uppercase tracking-[0.08em]"
                                    style={{
                                      font: 'var(--text-eyebrow)',
                                      color: 'var(--text-tertiary)',
                                    }}
                                  >
                                    <Diamond size={6} />
                                    {getPendingConfirmationTitle(pending)}
                                  </div>
                                  <div
                                    className="mt-1"
                                    style={{
                                      font: 'var(--fw-regular) var(--fs-body)/var(--lh-snug) var(--font-ui)',
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    {pending.summary ?? 'Confirme para concluir a operação.'}
                                  </div>
                                  {pending.items?.length ? (
                                    <div className="mt-3 space-y-2">
                                      {pending.items.map((item) => (
                                        <div
                                          key={`${item.manufacturerName}-${item.equipmentType}-${item.model}`}
                                          className="bg-white px-3 py-2 text-[0.88rem] text-app-text"
                                          style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius-md)',
                                          }}
                                        >
                                          {formatPendingItemLabel(item)}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleConfirmPending(msg, pending);
                                  }}
                                  disabled={isConfirming}
                                  className="inline-flex items-center gap-2 px-4 py-2 text-[0.88rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                                  style={{
                                    background: 'var(--vt-yellow)',
                                    color: 'var(--vt-ink)',
                                    border: '1px solid var(--vt-yellow)',
                                    borderRadius: 'var(--radius-md)',
                                  }}
                                >
                                  {isConfirming ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                  )}
                                  <span>
                                    {isConfirming
                                      ? 'Confirmando...'
                                      : getPendingConfirmationLabel(pending)}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <span className="vt-turn-time mt-2 block">
                      {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Fixed Input Area - Bottom */}
      <div className="flex-shrink-0 px-6 py-4 bg-white">
        <div className="mx-auto w-full" style={{ maxWidth: 'var(--thread-max)' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sendingMessage) {
                handleStopGenerating();
              } else {
                handleSendMessage();
              }
            }}
            className="vt-composer"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua pergunta..."
              rows={1}
              className="min-h-[26px] max-h-[220px] overflow-y-auto"
            />
            <button
              type="submit"
              disabled={!sendingMessage && !input.trim()}
              className="vt-send"
              title={sendingMessage ? 'Parar geração' : 'Enviar mensagem'}
              aria-label={sendingMessage ? 'Parar geração' : 'Enviar mensagem'}
            >
              {sendingMessage ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Send className="h-[18px] w-[18px]" strokeWidth={1.8} />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
