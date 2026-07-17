import React, { useState } from 'react';
import { Send } from 'lucide-react';
import MarkdownMessage from './MarkdownMessage';
import CopilotPendingResponse from './CopilotPendingResponse';
import NexusLoadingMark from './NexusLoadingMark';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';
import { scrollChatAnchorIntoView, scrollChatToBottom } from '../utils/chatScroll';

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

interface ResearchChatProps {
  sessionId?: string;
  showHeader?: boolean;
  onSessionCreated?: (session: ResearchSession) => void;
  onSessionUpdated?: (session: ResearchSession) => void;
}

export const ResearchChat: React.FC<ResearchChatProps> = ({ 
  sessionId, 
  showHeader = true,
  onSessionUpdated 
}) => {
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingMessageIdRef = React.useRef<string | null>(null);
  const activeTurnAnchorRef = React.useRef<HTMLDivElement>(null);
  const messagesScrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResizeTextarea(input, 220);

  React.useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId]);

  const loadSession = async (id: string) => {
    try {
      setLoadingSession(true);
      const response = await fetch(`/v1/research/sessions/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });

      if (!response.ok) throw new Error(`Failed to load session: ${response.status}`);

      const data = await response.json() as ResearchSession;
      setSession(data);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingSession(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !session) return;

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
        updateSessionTitle(shortTitle);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticUserMessage.id));
      setInput(userInput);
      setError(err instanceof Error ? err.message : 'Unknown error');
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
      console.error('Failed to update title:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  React.useEffect(() => {
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

  if (loadingSession && !session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <NexusLoadingMark size={32} className="mx-auto mb-4 h-8 w-8" />
          <p className="text-app-muted">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-app-muted">
          <p>Nenhuma conversa selecionada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-app-canvas">
      {/* Header - only show if showHeader is true */}
      {showHeader && (
        <div className="flex-shrink-0 border-b border-app-border bg-white px-6 py-4">
          <h2 className="font-semibold text-app-text">{session.title}</h2>
          {session.description && (
            <p className="text-sm text-app-muted mt-1">{session.description}</p>
          )}
        </div>
      )}

      {/* Messages container - scrollable */}
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto flex min-h-full w-full max-w-[780px] flex-col justify-start gap-6 pb-10 pt-6">
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
                      <div ref={activeTurnAnchorRef} className="h-1 w-full scroll-mt-6" />
                    ) : null}
                    <div className="ml-auto w-fit max-w-[70%] rounded-[24px] border border-app-border bg-white px-4 py-3 shadow-sm">
                      <p className="whitespace-pre-wrap text-[0.94rem] leading-[1.64] text-app-text">
                        {msg.content}
                      </p>
                      <div className="mt-2 text-xs text-app-muted">
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
                    <div className="mt-2 text-xs text-app-muted">
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

      {/* Error message */}
      {error && (
        <div className="flex-shrink-0 px-6 py-3 bg-red-50 border-t border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Input area - fixed at bottom with attractive styling */}
      <div className="flex-shrink-0 px-6 py-4 bg-app-canvas">
        <div className="mx-auto w-full max-w-[780px] bg-white border border-app-border rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-end gap-4 px-5 py-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta..."
            rows={1}
            className="flex-1 min-h-[72px] max-h-[220px] resize-none overflow-y-auto bg-transparent text-base leading-[1.6] text-app-text placeholder-app-muted outline-none"
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
