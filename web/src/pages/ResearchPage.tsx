import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Loader2, Trash2, Send } from 'lucide-react';
import MarkdownMessage from '../components/MarkdownMessage';
import CopilotPendingResponse from '../components/CopilotPendingResponse';
import NexusLoadingMark from '../components/NexusLoadingMark';
import Diamond from '../components/Diamond';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';
import { scrollChatAnchorIntoView, scrollChatToBottom } from '../utils/chatScroll';
import { confirmResearchSessionAction, type ResearchConfirmationResponse } from '../services/researchApi';

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
  return 'Confirmar operação';
};

const getPendingConfirmationTitle = (pending?: PendingConfirmationMetadata): string => {
  if (!pending?.operation) return 'Operação pendente';
  if (pending.operation === 'create_equipment_models') return 'Cadastro em lote pendente';
  if (pending.operation === 'delete_equipment_model') return 'Remoção pendente';
  if (pending.operation === 'create_equipment_model') return 'Cadastro pendente';
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
  const [resolvedConfirmationTokens, setResolvedConfirmationTokens] = useState<Set<string>>(() => new Set());
  const pendingMessageIdRef = useRef<string | null>(null);
  const activeTurnAnchorRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
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

      const data = await response.json() as ResearchSession;
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

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, optimisticUserMessage]);
    pendingMessageIdRef.current = optimisticUserMessage.id;

    try {
      setSendingMessage(true);

      const response = await fetch(`/v1/research/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ message: userInput }),
      });

      if (!response.ok) {
        const errorData = await response.json() as any;
        throw new Error(errorData.message || `Failed to send message: ${response.status}`);
      }

      const result = await response.json() as any;
      pendingMessageIdRef.current = null;
      setSendingMessage(false);
      setMessages((prev) => [
        ...prev.filter((message) => message.id !== optimisticUserMessage.id),
        result.userMessage,
        result.assistantMessage,
      ]);

      // Auto-generate title from first message if needed
      if (isFirstMessage) {
        const shortTitle = userInput.substring(0, 50) + (userInput.length > 50 ? '...' : '');
        await updateSessionTitle(shortTitle);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticUserMessage.id));
      setInput(userInput);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSendingMessage(false);
      pendingMessageIdRef.current = null;
    }
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
        const updated = await response.json() as ResearchSession;
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
      const result: ResearchConfirmationResponse = await confirmResearchSessionAction(session.id, pending.confirmationToken);
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
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const readPendingConfirmation = (message: Message): PendingConfirmationMetadata | undefined => {
    const confirmation = message.metadata?.pendingConfirmation;
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
                return typeof entry.model === 'string' && typeof entry.manufacturerName === 'string' && typeof entry.equipmentType === 'string';
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

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center h-full bg-app-canvas">
        <div className="text-center">
          <NexusLoadingMark size={40} className="mx-auto mb-4 h-10 w-10" />
          <p className="text-app-muted">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full bg-app-canvas">
        <div className="text-center text-app-muted">
          <p>Conversa não encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-app-canvas">
      {/* Fixed Header - Top */}
      <div className="flex-shrink-0 border-b border-app-border bg-app-canvas px-6 py-4">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Diamond size={7} />
            <h1 className="truncate text-[0.98rem] font-semibold text-app-text">
              {session.title}
            </h1>
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
        <div className="mx-auto flex min-h-full w-full max-w-[780px] flex-col justify-start gap-5 pb-10 pt-8">
            {messages.length === 0 ? (
              <div className="flex min-h-[240px] items-center justify-center text-center">
                <p className="text-app-muted">Inicie uma conversa...</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="flex w-full flex-col gap-3">
                      {pendingMessageIdRef.current === msg.id ? (
                        <div ref={activeTurnAnchorRef} className="h-1 w-full" />
                      ) : null}
                      <div className="ml-auto w-fit max-w-[760px] rounded-[24px] border border-app-border bg-white px-6 py-5 shadow-sm">
                        <p className="whitespace-pre-wrap text-[0.92rem] leading-[1.6] tracking-[-0.01em] text-app-text">
                          {msg.content}
                        </p>
                        <div className="mt-3 text-xs text-app-muted">
                          {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      {sendingMessage && pendingMessageIdRef.current === msg.id ? (
                        <CopilotPendingResponse />
                      ) : null}
                    </div>
                  ) : (
                  <div className="w-full">
                    <MarkdownMessage content={msg.content} />
                      {(() => {
                        const pending = readPendingConfirmation(msg);
                        if (!pending) return null;
                        if (resolvedConfirmationTokens.has(pending.confirmationToken)) return null;
                        const isConfirming = confirmingToken === pending.confirmationToken;
                        return (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-app-border border-l-[3px] border-l-app-accent bg-white px-4 py-3 shadow-soft">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                                <Diamond size={6} />
                                {getPendingConfirmationTitle(pending)}
                              </div>
                              <div className="mt-1 text-[0.92rem] leading-[1.55] text-app-text">
                                {pending.summary ?? 'Confirme para concluir a operação.'}
                              </div>
                              {pending.items?.length ? (
                                <div className="mt-3 space-y-2">
                                  {pending.items.map((item) => (
                                    <div
                                      key={`${item.manufacturerName}-${item.equipmentType}-${item.model}`}
                                      className="rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text shadow-soft"
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
                              style={{ border: '2px solid #000000' }}
                              className="inline-flex items-center gap-2 rounded-[16px] !border-2 !border-black bg-white px-4 py-2 text-[0.9rem] font-semibold text-app-text shadow-soft transition hover:bg-app-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              <span>{isConfirming ? 'Confirmando...' : getPendingConfirmationLabel(pending)}</span>
                            </button>
                          </div>
                        );
                      })()}
                      <div className="mt-3 text-xs text-app-muted">
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
        </div>
      </div>

      {/* Fixed Input Area - Bottom */}
      <div className="flex-shrink-0 px-6 py-4 bg-app-canvas">
        <div className="mx-auto w-full max-w-[780px] bg-white border border-app-border rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-end gap-4 px-5 py-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta..."
            rows={1}
            className="flex-1 min-h-[56px] max-h-[220px] resize-none overflow-y-auto bg-transparent text-[0.95rem] leading-[1.55] text-app-text placeholder-app-muted outline-none"
          />
          <button
            onClick={handleSendMessage}
            disabled={sendingMessage || !input.trim()}
            className="inline-flex items-center justify-center rounded-full bg-app-accent w-10 h-10 text-app-ink transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Enviar mensagem"
          >
            {sendingMessage ? (
              <NexusLoadingMark size={20} className="h-5 w-5" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
