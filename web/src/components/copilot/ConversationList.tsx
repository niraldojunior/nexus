import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Loader, Search, Trash2 } from 'lucide-react';
import { ArchiveConfirmModal } from '../../pages/ResearchHistoryPage';
import {
  archiveResearchSession,
  listResearchSessions,
  type ResearchSession,
} from '../../services/researchApi';

const ITEMS_PER_PAGE = 20;

type ConversationListProps = {
  onSelectSession: (sessionId: string) => void;
  /** Modo do painel lateral: busca enxuta e lista densa com rolagem própria, sem paginação. */
  compact?: boolean;
  /** Chamado depois de arquivar, para quem mantém a conversa aberta poder reagir. */
  onArchived?: (sessionId: string) => void;
};

const formatCompactDate = (iso: string): string => {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

/** Busca por título + cartões de conversas. Usada pela página Conversas e pelo painel do mapa. */
export function ConversationList({
  onSelectSession,
  compact = false,
  onArchived,
}: ConversationListProps) {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [archiveTarget, setArchiveTarget] = useState<ResearchSession | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSessions(await listResearchSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const filteredSessions = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return term ? sessions.filter((s) => s.title.toLowerCase().includes(term)) : sessions;
  }, [searchQuery, sessions]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    const sessionId = archiveTarget.id;
    try {
      await archiveResearchSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      onArchived?.(sessionId);
    } catch (err) {
      console.error('Erro ao arquivar:', err);
    } finally {
      setArchiveTarget(null);
    }
  };

  const startIdx = (page - 1) * ITEMS_PER_PAGE;
  const paginatedSessions = filteredSessions.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredSessions.length / ITEMS_PER_PAGE);

  const archiveModal = archiveTarget ? (
    <ArchiveConfirmModal
      sessionTitle={archiveTarget.title}
      onConfirm={() => {
        void confirmArchive();
      }}
      onCancel={() => setArchiveTarget(null)}
    />
  ) : null;

  if (compact) {
    // Painel do mapa (396px): busca enxuta fixa no topo + lista densa com rolagem própria.
    // Sem paginação — o servidor devolve no máximo as 50 sessões mais recentes.
    return (
      <div className="flex h-full min-h-0 flex-col">
        {archiveModal}
        <div className="shrink-0 px-3 pb-2 pt-2.5">
          <div className="flex h-8 items-center gap-2 rounded-md border border-app-border bg-white px-2.5 transition focus-within:border-app-accent-border">
            <Search className="h-3.5 w-3.5 shrink-0 text-app-muted" strokeWidth={1.8} />
            <input
              type="text"
              placeholder="Buscar por título..."
              aria-label="Buscar conversas por título"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="min-w-0 flex-1 border-0 bg-transparent text-app-text outline-none placeholder:text-app-muted"
              style={{ fontSize: 'var(--fs-body)' }}
            />
          </div>
          <p className="mt-1.5 text-app-muted" style={{ fontSize: 'var(--fs-xs)' }}>
            {loading
              ? 'Carregando…'
              : `${filteredSessions.length} conversa${filteredSessions.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mx-3 mb-2 shrink-0 rounded-md px-3 py-2"
            style={{
              fontSize: 'var(--fs-sm)',
              background: 'var(--status-red-soft)',
              color: 'var(--status-red)',
              border: '1px solid var(--status-red-border)',
            }}
          >
            {error}
          </div>
        ) : null}

        <div className="hover-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader className="h-5 w-5 animate-spin text-app-accent" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="py-8 text-center" style={{ fontSize: 'var(--fs-body)' }}>
              <p className="text-app-muted">
                {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </p>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-1 text-app-accent hover:underline"
                >
                  Limpar busca
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-app-border">
              {filteredSessions.map((session) => (
                <li
                  key={session.id}
                  className="group relative flex items-center gap-2 px-1.5 py-2 transition hover:bg-app-accent-soft"
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(session.id)}
                    aria-label={`Abrir conversa: ${session.title}`}
                    className="absolute inset-0 rounded-[inherit]"
                  />
                  <div className="pointer-events-none min-w-0 flex-1">
                    <p
                      className="truncate font-medium text-app-text"
                      style={{ fontSize: 'var(--fs-body)' }}
                    >
                      {session.title}
                    </p>
                    <p className="truncate text-app-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      {formatCompactDate(session.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchiveTarget(session);
                    }}
                    className="vt-hover-danger relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-app-muted opacity-0 transition focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                    title="Arquivar conversa"
                    aria-label={`Arquivar conversa: ${session.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {archiveModal}

      <div className={`vt-searchbar vt-searchbar-flat mb-6`}>
        <Search className="h-4 w-4 shrink-0 text-app-muted" strokeWidth={1.8} />
        <input
          type="text"
          placeholder="Buscar conversas por título..."
          aria-label="Buscar conversas por título"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <p className="-mt-4 mb-6 text-app-muted" style={{ fontSize: 'var(--fs-sm)' }}>
        {filteredSessions.length} conversa(s) encontrada(s)
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 text-sm"
          style={{
            background: 'var(--status-red-soft)',
            color: 'var(--status-red)',
            border: '1px solid var(--status-red-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader className="h-6 w-6 animate-spin text-app-accent" />
        </div>
      )}

      {!loading && filteredSessions.length === 0 && (
        <div className="flex items-center justify-center py-12 text-center">
          <div>
            <p className="mb-2 text-app-muted" style={{ fontSize: 'var(--fs-body-relaxed)' }}>
              {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-app-accent hover:underline"
              >
                Limpar busca
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && filteredSessions.length > 0 && (
        <>
          <div className="space-y-3">
            {paginatedSessions.map((session) => (
              <div
                key={session.id}
                className="vt-card-interactive group relative flex items-center p-4 text-left"
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  aria-label={`Abrir conversa: ${session.title}`}
                  className="absolute inset-0 rounded-[inherit]"
                />
                <div className="pointer-events-none min-w-0 flex-1">
                  <h3 className="mb-1 truncate text-app-text" style={{ font: 'var(--text-h3)' }}>
                    {session.title}
                  </h3>
                  <div
                    className="flex items-center gap-1.5 text-app-muted"
                    style={{ fontSize: 'var(--fs-sm)' }}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                    <span>
                      Modificado em
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setArchiveTarget(session);
                  }}
                  className="vt-hover-danger relative ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-app-muted opacity-0 transition focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                  title="Arquivar conversa"
                  aria-label={`Arquivar conversa: ${session.title}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="vt-hover-muted rounded-lg border border-app-border px-3.5 py-1.5 text-sm text-app-text transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${
                      p === page
                        ? 'bg-app-accent font-semibold text-app-ink'
                        : 'vt-hover-muted border border-app-border text-app-text'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="vt-hover-muted rounded-lg border border-app-border px-3.5 py-1.5 text-sm text-app-text transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
