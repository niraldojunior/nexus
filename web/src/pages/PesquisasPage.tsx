import React, { useState, useEffect } from 'react';
import { Search, Clock, Trash2, Loader } from 'lucide-react';
import { ArchiveConfirmModal } from './ResearchHistoryPage';

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
  messages?: unknown[];
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
  const [archiveTarget, setArchiveTarget] = useState<ResearchSession | null>(null);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    // Filtrar e paginar
    let filtered = sessions;
    if (searchQuery.trim()) {
      filtered = sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()));
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
          .sort(
            (a: ResearchSession, b: ResearchSession) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;
    setArchiveTarget(target);
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    const sessionId = archiveTarget.id;

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
    } finally {
      setArchiveTarget(null);
    }
  };

  // Paginação
  const startIdx = (page - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const paginatedSessions = filteredSessions.slice(startIdx, endIdx);
  const totalPages = Math.ceil(filteredSessions.length / ITEMS_PER_PAGE);

  return (
    <div className="min-h-full bg-white px-6 pb-8">
      {archiveTarget ? (
        <ArchiveConfirmModal
          sessionTitle={archiveTarget.title}
          onConfirm={() => {
            void confirmArchive();
          }}
          onCancel={() => setArchiveTarget(null)}
        />
      ) : null}
      <div className="mx-auto" style={{ maxWidth: 'var(--thread-max)' }}>
        {/* Header — o centro vertical do título "Conversas" alinha com o centro do
            item "Nova Conversa" da sidebar. Geometria: header da sidebar (pt 6px +
            item 48px + pb 2px = 56px) + metade do primeiro item do nav (34px/2 = 17px)
            ⇒ centro a 73px do topo. A página vive no wrapper scale-[0.93], então o
            padding-top compensa a escala: (73 − 12.8)/0.93 ≈ 65px. */}
        <div className="mb-6" style={{ paddingTop: 55 }}>
          <h1
            className="text-app-text"
            style={{
              font: 'var(--text-h1)',
              letterSpacing: 'var(--tracking-snug)',
              lineHeight: 'var(--lh-tight)',
            }}
          >
            Conversas
          </h1>
        </div>

        {/* Search */}
        <div className="vt-searchbar vt-searchbar-flat mb-6">
          <Search className="h-4 w-4 shrink-0 text-app-muted" strokeWidth={1.8} />
          <input
            type="text"
            placeholder="Buscar conversas por título..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <p className="-mt-4 mb-6 text-app-muted" style={{ fontSize: 'var(--fs-sm)' }}>
          {filteredSessions.length} conversa(s) encontrada(s)
        </p>

        {/* Error */}
        {error && (
          <div
            className="mb-6 px-4 py-3 text-sm"
            style={{
              background: 'var(--status-red-soft)',
              color: 'var(--status-red)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-6 w-6 animate-spin text-app-accent" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredSessions.length === 0 && (
          <div className="flex items-center justify-center py-12 text-center">
            <div>
              <p className="text-app-muted mb-2" style={{ fontSize: 'var(--fs-body-relaxed)' }}>
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
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="vt-card-interactive group flex items-center p-4 text-left hover:!bg-neutral-50 hover:!border-neutral-300"
                >
                  <div className="flex-1 min-w-0">
                    <h3
                      className="truncate mb-1 text-app-text"
                      style={{ font: 'var(--text-h3)' }}
                    >
                      {session.title}
                    </h3>
                    <div
                      className="flex items-center gap-1.5 text-app-muted"
                      style={{ fontSize: 'var(--fs-sm)' }}
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
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
                    className="ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-app-muted opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    title="Arquivar conversa"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3.5 py-1.5 border border-app-border rounded-lg text-app-text hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition ${
                        p === page
                          ? 'bg-app-accent text-app-ink font-semibold'
                          : 'border border-app-border text-app-text hover:bg-neutral-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3.5 py-1.5 border border-app-border rounded-lg text-app-text hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
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
