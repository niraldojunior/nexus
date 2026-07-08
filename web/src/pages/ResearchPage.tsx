import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Send, Loader } from 'lucide-react';
import MarkdownMessage from '../components/MarkdownMessage';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResizeTextarea(input, 220);

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendingMessage]);

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

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center h-full bg-app-canvas">
        <div className="text-center">
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
      <div className="flex-shrink-0 bg-app-canvas px-6 py-4">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
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
      <div className="flex-1 overflow-y-auto px-6 py-2">
        <div className="mx-auto min-h-full max-w-[720px]">
          <div className="flex min-h-full flex-col justify-end gap-5 pb-0">
          {messages.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center text-center">
              <p className="text-app-muted">Inicie uma conversa...</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[620px] rounded-[24px] border border-app-border bg-white px-6 py-5 shadow-sm">
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
                ) : (
                  <div className="max-w-[660px]">
                    <MarkdownMessage content={msg.content} />
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
          {sendingMessage && (
            <div className="flex justify-start">
              <div className="max-w-[640px]">
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin text-app-accent" />
                  <span className="text-sm text-app-muted">Pensando...</span>
                </div>
              </div>
            </div>
          )}
          </div>
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed Input Area - Bottom */}
      <div className="flex-shrink-0 px-6 py-4 bg-app-canvas">
        <div className="mx-auto max-w-[720px] bg-white border border-app-border rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-end gap-4 px-5 py-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua pergunta..."
            rows={1}
            disabled={sendingMessage}
            className="flex-1 min-h-[56px] max-h-[220px] resize-none overflow-y-auto bg-transparent text-[0.95rem] leading-[1.55] text-app-text placeholder-app-muted outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={sendingMessage || !input.trim()}
            className="inline-flex items-center justify-center rounded-full bg-app-accent w-10 h-10 text-white transition hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Enviar mensagem"
          >
            {sendingMessage ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
