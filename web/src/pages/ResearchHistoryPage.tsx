import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, PencilLine, Trash2 } from 'lucide-react';

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

/**
 * Modal de confirmação de arquivamento — popover flutuante do design system
 * (`.vt-popover`: hairline + shadow-lg), botão primário amarelo no confirmar.
 * Exportado para reuso na página de histórico (PesquisasPage).
 */
export const ArchiveConfirmModal: React.FC<{
  sessionTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ sessionTitle, onConfirm, onCancel }) => (
  <div
    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30"
    onClick={onCancel}
    role="dialog"
    aria-modal="true"
    aria-label="Arquivar conversa"
  >
    <div
      className="vt-popover w-[340px] p-5"
      style={{ borderRadius: 'var(--radius-xl)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3
        className="text-app-text"
        style={{ font: 'var(--text-h3)', letterSpacing: 'var(--tracking-snug)' }}
      >
        Arquivar conversa
      </h3>
      <p
        className="mt-2 text-app-muted"
        style={{ font: 'var(--text-body)' }}
      >
        Arquivar “{sessionTitle}”? A conversa sai da lista, mas o histórico é
        preservado (soft-delete).
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-app-border bg-white px-3.5 py-1.5 text-[0.84rem] text-app-text transition hover:bg-neutral-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md px-3.5 py-1.5 text-[0.84rem] font-semibold transition"
          style={{
            background: 'var(--vt-yellow)',
            color: 'var(--vt-ink)',
            border: '1px solid var(--vt-yellow)',
          }}
        >
          Arquivar
        </button>
      </div>
    </div>
  </div>
);

/**
 * ResearchHistoryPage — Sidebar component showing recent conversation sessions (20 items max)
 * Used as quick-access list in the main Sidebar, not a standalone page
 */
export const ResearchHistoryPage: React.FC<{
  onSessionSelected?: (sessionId: string) => void;
  refreshTrigger?: number;
  activeSessionId?: string | null;
}> = ({ onSessionSelected, refreshTrigger, activeSessionId }) => {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<ResearchSession | null>(null);
  const [expanded, setExpanded] = useState(true);
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
          .sort(
            (a: ResearchSession, b: ResearchSession) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )
          .slice(0, 20), // Only 20 most recent
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
      console.error('Error deleting session:', err);
    } finally {
      setArchiveTarget(null);
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
    return <div className="px-3 py-2 text-xs text-red-600">Erro ao carregar</div>;
  }

  return (
    <>
      {archiveTarget ? (
        <ArchiveConfirmModal
          sessionTitle={archiveTarget.title}
          onConfirm={() => {
            void confirmArchive();
          }}
          onCancel={() => setArchiveTarget(null)}
        />
      ) : null}
      <div className="flex flex-col">
      {loading && <div className="px-2.5 py-1.5 text-xs text-app-muted">Carregando...</div>}

      {!loading && sessions.length === 0 && (
        <div className="px-2.5 py-1.5 text-xs text-app-muted">Nenhuma conversa ainda</div>
      )}

      {!loading && sessions.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-3 flex w-full items-center rounded-md px-2.5 py-1.5 text-left transition hover:bg-neutral-100"
            aria-expanded={expanded}
            aria-label={expanded ? 'Recolher conversas recentes' : 'Expandir conversas recentes'}
            title={expanded ? 'Recolher' : 'Expandir'}
          >
            <span
              className="flex-1 truncate text-xs font-medium"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {expanded ? 'Conversas recentes' : `${sessions.length} conversa(s)`}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                expanded ? '' : '-rotate-90'
              }`}
              strokeWidth={1.8}
              style={{ color: 'var(--text-tertiary)' }}
            />
          </button>
          {expanded ? (
            <div className="flex flex-col gap-0.5 mt-0.5">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative flex h-[30px] items-center rounded-md px-2.5 text-left transition ${
                    activeSessionId === session.id
                      ? 'bg-app-accent-soft text-app-text font-medium'
                      : 'text-app-text hover:bg-neutral-100'
                  }`}
                  style={{ color: 'var(--sidebar-fg)' }}
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
                  className="w-full rounded border border-app-border bg-white px-2 py-0.5 text-xs text-app-text outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSessionSelected?.(session.id)}
                  className="w-full text-left"
                  title={session.title}
                >
                  <div className="truncate text-xs leading-none">{session.title}</div>
                </button>
              )}
            </div>
            {editingSessionId === session.id ? null : (
              <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded bg-white/90 pl-1 opacity-0 shadow-sm transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={(e) => beginEdit(session, e)}
                  className="rounded p-0.5 text-app-muted transition hover:text-app-text"
                  title="Editar conversa"
                  aria-label={`Editar conversa ${session.title}`}
                >
                  <PencilLine className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(session.id, e)}
                  className="rounded p-0.5 text-app-muted transition hover:text-red-600"
                  title="Arquivar"
                  aria-label={`Arquivar conversa ${session.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      </div>
    </>
  );
};
