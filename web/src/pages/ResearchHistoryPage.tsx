import React, { useEffect, useRef, useState } from 'react';
import { PencilLine, Trash2 } from 'lucide-react';

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
  messages?: any[];
  createdAt: string;
  updatedAt: string;
}

/**
 * ResearchHistoryPage — Sidebar component showing recent conversation sessions (20 items max)
 * Used as quick-access list in the main Sidebar, not a standalone page
 */
export const ResearchHistoryPage: React.FC<{
  onSessionSelected?: (sessionId: string) => void;
  refreshTrigger?: number;
}> = ({ onSessionSelected, refreshTrigger }) => {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editingInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadRecentSessions();
  }, [refreshTrigger]);

  useEffect(() => {
    if (editingSessionId) {
      editingInputRef.current?.focus();
      editingInputRef.current?.select();
    }
  }, [editingSessionId]);

  const loadRecentSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/v1/research/sessions', {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });

      if (!response.ok) throw new Error('Erro ao carregar conversas');

      const data = await response.json();
      setSessions(
        data
          .filter((s: ResearchSession) => s.status === 'active')
          .sort((a: ResearchSession, b: ResearchSession) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          .slice(0, 20) // Only 20 most recent
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      console.error('Error loading recent sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Arquivar esta conversa?')) return;

    try {
      const response = await fetch(`/v1/research/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });

      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  const beginEdit = (session: ResearchSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const cancelEdit = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const saveEdit = async (sessionId: string) => {
    const nextTitle = editingTitle.trim();
    const currentTitle = sessions.find((session) => session.id === sessionId)?.title ?? '';

    if (!nextTitle) {
      cancelEdit();
      return;
    }

    if (nextTitle === currentTitle) {
      cancelEdit();
      return;
    }

    try {
      const response = await fetch(`/v1/research/sessions/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ title: nextTitle }),
      });

      if (!response.ok) {
        throw new Error(`Falha ao atualizar conversa: ${response.status}`);
      }

      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, title: nextTitle, updatedAt: new Date().toISOString() }
            : session,
        ),
      );
      cancelEdit();
    } catch (err) {
      console.error('Error updating session title:', err);
    }
  };

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-red-600">
        Erro ao carregar
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[2px]">
      {loading && (
        <div className="px-3 py-2 text-xs text-app-muted">
          Carregando...
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="px-3 py-2 text-xs text-app-muted">
          Nenhuma conversa ainda
        </div>
      )}

      {!loading &&
        sessions.map((session) => (
          <div
            key={session.id}
            className="group flex items-start justify-between gap-1.5 rounded-md px-2 py-[2px] text-left transition hover:bg-app-accent-soft"
          >
            <div className="flex-1 min-w-0">
              {editingSessionId === session.id ? (
                <input
                  ref={editingInputRef}
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onBlur={() => {
                    void saveEdit(session.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveEdit(session.id);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelEdit();
                    }
                  }}
                  className="w-full rounded-[10px] border border-app-accent-border bg-white px-2.5 py-1 text-sm text-app-text outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSessionSelected?.(session.id)}
                  className="w-full text-left"
                  title={session.title}
                >
                  <div className="truncate text-[0.92rem] leading-[1.1] text-app-text">{session.title}</div>
                </button>
              )}
            </div>
            {editingSessionId === session.id ? null : (
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => beginEdit(session, e)}
                  className="opacity-0 transition p-1 text-app-muted hover:text-app-text group-hover:opacity-100"
                  title="Editar conversa"
                >
                  <PencilLine className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(session.id, e)}
                  className="opacity-0 transition p-1 text-app-muted hover:text-red-600 group-hover:opacity-100"
                  title="Arquivar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
    </div>
  );
};
