import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

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
 * ResearchHistoryPage — Sidebar component showing recent research sessions (20 items max)
 * Used as quick-access list in the main Sidebar, not a standalone page
 */
export const ResearchHistoryPage: React.FC<{
  onSessionSelected?: (sessionId: string) => void;
  refreshTrigger?: number;
}> = ({ onSessionSelected, refreshTrigger }) => {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecentSessions();
  }, [refreshTrigger]);

  const loadRecentSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/v1/research/sessions', {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });

      if (!response.ok) throw new Error('Erro ao carregar pesquisas');

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
    if (!confirm('Arquivar esta pesquisa?')) return;

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

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-red-600">
        Erro ao carregar
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.6">
      {loading && (
        <div className="px-3 py-2 text-xs text-app-muted">
          Carregando...
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="px-3 py-2 text-xs text-app-muted">
          Nenhuma pesquisa ainda
        </div>
      )}

      {!loading &&
        sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSessionSelected?.(session.id)}
            className="flex items-start justify-between gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-app-accent-soft transition group"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm text-app-text truncate">
                {session.title}
              </div>
            </div>
            <button
              onClick={(e) => handleDelete(session.id, e)}
              className="opacity-0 group-hover:opacity-100 transition p-1 text-app-muted hover:text-red-600 flex-shrink-0"
              title="Arquivar"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </button>
        ))}
    </div>
  );
};
