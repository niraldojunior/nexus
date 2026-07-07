import React, { useState } from 'react';
import { Send, Loader } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId]);

  const loadSession = async (id: string) => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !session) return;

    const userInput = input;
    setInput('');
    setError(null);

    try {
      setLoading(true);

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
      setMessages((prev) => [...prev, result.userMessage, result.assistantMessage]);

      // Auto-generate title from first message if needed
      if (messages.length === 0) {
        const shortTitle = userInput.substring(0, 50) + (userInput.length > 50 ? '...' : '');
        updateSessionTitle(shortTitle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
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

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading && !session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-app-accent mx-auto mb-4" />
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
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-end gap-6 pb-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center text-center">
              <p className="text-app-muted">Inicie uma conversa...</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-app-accent text-white'
                      : 'bg-white border border-app-border text-app-text'
                  }`}
                >
                  <p className="text-[0.98rem] leading-[1.76] whitespace-pre-wrap">{msg.content}</p>
                  <div className="text-xs opacity-70 mt-2">
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-app-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader className="h-4 w-4 animate-spin text-app-accent" />
                  <span className="text-sm text-app-muted">Pensando...</span>
                </div>
              </div>
            </div>
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
        <div className="mx-auto max-w-[720px] bg-white border border-app-border rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-end gap-4 px-5 py-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua pergunta..."
            rows={3}
            disabled={loading}
            className="flex-1 resize-none bg-transparent text-app-text placeholder-app-muted outline-none text-base disabled:opacity-50 max-h-[150px]"
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !input.trim()}
            className="inline-flex items-center justify-center rounded-full bg-app-accent w-10 h-10 text-white transition hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Enviar mensagem"
          >
            {loading ? (
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
