import React, { useState, useEffect } from 'react';
import { Search, Clock, Trash2, Loader } from 'lucide-react';

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

export const ConversasPage: React.FC<{
  onSelectSession: (sessionId: string) => void;
}> = ({ onSelectSession }) => {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<ResearchSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    // Filtrar e paginar
    let filtered = sessions;
    if (searchQuery.trim()) {
      filtered = sessions.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredSessions(filtered);
    setPage(1); // Reset para página 1 ao filtrar
  }, [searchQuery, sessions]);

  const loadSessions = async () => {
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
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
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
      console.error('Erro ao arquivar:', err);
    }
  };

  // Paginação
  const startIdx = (page - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const paginatedSessions = filteredSessions.slice(startIdx, endIdx);
  const totalPages = Math.ceil(filteredSessions.length / ITEMS_PER_PAGE);

  return (
    <div className="min-h-full px-8 py-8 bg-app-canvas">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-4xl font-semibold text-app-text mb-2">
            Conversas
          </h1>
          <p className="text-app-muted">
            {filteredSessions.length} conversa(s) encontrada(s)
          </p>
        </div>

        {/* Search */}
        <div className="mb-8 flex items-center gap-3 bg-white border border-app-border rounded-xl px-4 py-3 shadow-sm">
          <Search className="h-5 w-5 text-app-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar conversas por título..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-app-text placeholder-app-muted outline-none text-base"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 px-6 py-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-8 w-8 animate-spin text-app-accent" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredSessions.length === 0 && (
          <div className="flex items-center justify-center py-12 text-center">
            <div>
              <p className="text-lg text-app-muted mb-2">
                {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-app-accent hover:underline text-sm"
                >
                  Limpar busca
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sessions list */}
        {!loading && filteredSessions.length > 0 && (
          <>
            <div className="space-y-3">
              {paginatedSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="w-full flex items-start justify-between p-4 bg-white border border-app-border rounded-lg hover:border-app-accent-border hover:bg-app-accent-soft transition group text-left"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-app-text truncate mb-1">
                      {session.title}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-app-muted">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span>
                        Modificado em{' '}
                        {new Date(session.updatedAt).toLocaleDateString('pt-BR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(session.id, e)}
                    className="ml-4 opacity-0 group-hover:opacity-100 transition p-2 text-app-muted hover:text-red-600 hover:bg-red-50 rounded"
                    title="Arquivar conversa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-accent-soft disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-2 rounded-lg transition ${
                        p === page
                          ? 'bg-app-accent text-white'
                          : 'border border-app-border text-app-text hover:bg-app-accent-soft'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-accent-soft disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
