import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';
import {
  fetchProjectWorkflow,
  type GeoProjectStatusBehavior,
  type GeoProjectStatusCatalogItem,
  type GeoProjectWorkflowAction,
  type GeoProjectWorkflowReadModel,
  type GeoProjectWorkflowRole,
  type GeoProjectWorkflowTransition,
} from '../../../services/geoProjectApi';

type GeoProjectWorkflowStudioProps = {
  canEdit: boolean;
  isEditing: boolean;
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

const ALL_ROLES: GeoProjectWorkflowRole[] = ['inventory.editor', 'platform.admin'];
const ALL_ACTIONS: GeoProjectWorkflowAction[] = [
  'update-project',
  'cascade-sites-planning',
  'cascade-sites-execution',
  'cascade-sites-suspended',
  'release-inventory',
  'terminate-inventory',
];
const ALL_BEHAVIORS: GeoProjectStatusBehavior[] = ['planning', 'execution', 'suspended', 'close-release'];

type WorkflowSnapshot = Omit<GeoProjectWorkflowReadModel, 'fallback' | 'publicationChecksum'>;

export function GeoProjectWorkflowStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: GeoProjectWorkflowStudioProps) {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null);
  const [checksum, setChecksum] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wasEditingRef = useRef(isEditing);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, fallbackWorkflow] = await Promise.all([
        getStudioStatus('rules-workflows'),
        fetchProjectWorkflow(),
      ]);
      const version = status.draftVersion ?? status.publishedVersion;
      const rawSnapshot = version?.snapshot as WorkflowSnapshot | undefined;
      setSnapshot({
        schemaVersion: 1,
        workflowId: 'geo-project',
        initialStateCode: rawSnapshot?.initialStateCode ?? fallbackWorkflow.initialStateCode,
        states: rawSnapshot?.states ?? fallbackWorkflow.states,
        transitions: rawSnapshot?.transitions ?? fallbackWorkflow.transitions,
      });
      setChecksum(status.draftVersion?.checksum);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar workflow de projetos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (wasEditingRef.current && !isEditing) void load();
    wasEditingRef.current = isEditing;
  }, [isEditing, load]);

  const buildSnapshot = useCallback(
    async (): Promise<Record<string, unknown>> => ({
      schemaVersion: 1,
      workflowId: 'geo-project',
      initialStateCode: snapshot?.initialStateCode ?? '1',
      states: snapshot?.states ?? [],
      transitions: snapshot?.transitions ?? [],
    }),
    [snapshot],
  );

  const captureDraft = useCallback(async () => {
    const next = await buildSnapshot();
    const status = await getStudioStatus('rules-workflows');
    await saveStudioDraft('rules-workflows', next, status.draftVersion?.checksum ?? checksum);
  }, [buildSnapshot, checksum]);

  useEffect(() => {
    onRegisterCaptureDraft?.(captureDraft);
    return () => onRegisterCaptureDraft?.(null);
  }, [captureDraft, onRegisterCaptureDraft]);

  useEffect(() => {
    onRegisterCaptureInitialSnapshot?.(buildSnapshot);
    return () => onRegisterCaptureInitialSnapshot?.(null);
  }, [buildSnapshot, onRegisterCaptureInitialSnapshot]);

  const canMutate = canEdit && isEditing;

  const states = useMemo(
    () => [...(snapshot?.states ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [snapshot],
  );
  const transitions = useMemo(() => snapshot?.transitions ?? [], [snapshot]);

  const updateState = (code: string, patch: Partial<GeoProjectStatusCatalogItem>) => {
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        states: current.states.map((s) => (s.code === code ? { ...s, ...patch } : s)),
      };
    });
  };

  const addState = () => {
    const code = `state-${Date.now()}`;
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        states: [
          ...current.states,
          {
            code,
            name: 'Novo estado',
            sortOrder: (current.states[current.states.length - 1]?.sortOrder ?? 0) + 10,
            active: true,
            behavior: 'planning',
          },
        ],
      };
    });
  };

  const updateTransition = (id: string, patch: Partial<GeoProjectWorkflowTransition>) => {
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        transitions: current.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      };
    });
  };

  const addTransition = () => {
    const id = `trans-${Date.now()}`;
    const firstState = states[0]?.code ?? '1';
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        transitions: [
          ...current.transitions,
          {
            id,
            fromStateCodes: [firstState],
            toStateCode: firstState,
            allowedRoles: ['inventory.editor', 'platform.admin'],
            actions: ['update-project', 'cascade-sites-planning'],
          },
        ],
      };
    });
  };

  if (loading) return <p className="text-[0.85rem] text-app-muted">Carregando regras de workflow…</p>;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[0.98rem] font-semibold text-app-text">Workflow de Projetos (GeoProject)</h2>
          <p className="text-[0.82rem] text-app-muted">
            Estados operacionais, matriz de transições permitidas e cascatas para Sites e Recursos.
          </p>
        </div>
        {canMutate ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addState}
              className="inline-flex items-center gap-1 rounded-[8px] border border-app-border px-2 py-1 text-[0.78rem] font-semibold text-app-text hover:bg-app-accent-soft"
            >
              <Plus className="h-3.5 w-3.5" /> Estado
            </button>
            <button
              type="button"
              onClick={addTransition}
              className="inline-flex items-center gap-1 rounded-[8px] border border-app-border px-2 py-1 text-[0.78rem] font-semibold text-app-text hover:bg-app-accent-soft"
            >
              <Plus className="h-3.5 w-3.5" /> Transição
            </button>
          </div>
        ) : null}
      </div>

      <section className="vt-card space-y-4 p-4">
        <h3 className="text-[0.88rem] font-semibold text-app-text">Estados declarados</h3>
        <div className="divide-y divide-app-border/70">
          {states.map((state) => (
            <div key={state.code} className="grid gap-2 py-2.5 sm:grid-cols-[10rem_1fr_8rem_6rem] sm:items-center">
              <div>
                <span className="text-[0.75rem] font-semibold text-app-muted">Código: </span>
                <span className="font-mono text-[0.82rem] text-app-text">{state.code}</span>
              </div>
              <input
                value={state.name}
                disabled={!canMutate}
                onChange={(e) => updateState(state.code, { name: e.target.value })}
                aria-label={`Nome do estado ${state.code}`}
                className="rounded-[8px] border border-app-border bg-white px-2 py-1 text-[0.82rem] text-app-text disabled:border-transparent disabled:px-0"
              />
              <select
                value={state.behavior}
                disabled={!canMutate}
                onChange={(e) => updateState(state.code, { behavior: e.target.value as GeoProjectStatusBehavior })}
                aria-label={`Comportamento do estado ${state.code}`}
                className="rounded-[8px] border border-app-border bg-white px-2 py-1 text-[0.78rem] text-app-text disabled:border-transparent"
              >
                {ALL_BEHAVIORS.map((behavior) => (
                  <option key={behavior} value={behavior}>
                    {behavior}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[0.76rem] text-app-muted">
                <input
                  type="checkbox"
                  checked={state.active}
                  disabled={!canMutate}
                  onChange={(e) => updateState(state.code, { active: e.target.checked })}
                />
                Ativo
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="vt-card space-y-4 p-4">
        <h3 className="text-[0.88rem] font-semibold text-app-text">Transições configuradas</h3>
        <div className="divide-y divide-app-border/70">
          {transitions.map((transition) => (
            <div key={transition.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[0.78rem] font-semibold text-app-text">{transition.id}</span>
                {canMutate ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSnapshot((current) =>
                        current
                          ? {
                              ...current,
                              transitions: current.transitions.filter((t) => t.id !== transition.id),
                            }
                          : current,
                      )
                    }
                    className="rounded-[6px] p-1 text-app-muted hover:bg-status-red-soft hover:text-status-red"
                    aria-label={`Remover transição ${transition.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[0.72rem] font-semibold text-app-muted">Origens (fromStateCodes):</label>
                  <input
                    value={transition.fromStateCodes.join(', ')}
                    disabled={!canMutate}
                    onChange={(e) =>
                      updateTransition(transition.id, {
                        fromStateCodes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    aria-label={`Origens da transição ${transition.id}`}
                    className="w-full rounded-[8px] border border-app-border bg-white px-2 py-1 text-[0.8rem] text-app-text disabled:border-transparent disabled:px-0"
                  />
                </div>
                <div>
                  <label className="block text-[0.72rem] font-semibold text-app-muted">Destino (toStateCode):</label>
                  <select
                    value={transition.toStateCode}
                    disabled={!canMutate}
                    onChange={(e) => updateTransition(transition.id, { toStateCode: e.target.value })}
                    aria-label={`Destino da transição ${transition.id}`}
                    className="w-full rounded-[8px] border border-app-border bg-white px-2 py-1 text-[0.8rem] text-app-text disabled:border-transparent"
                  >
                    {states.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.name} ({state.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[0.72rem] font-semibold text-app-muted">Papéis autorizados:</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {ALL_ROLES.map((role) => {
                      const checked = transition.allowedRoles.includes(role);
                      return (
                        <label key={role} className="inline-flex items-center gap-1 text-[0.74rem] text-app-text">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canMutate}
                            onChange={(e) => {
                              const nextRoles = e.target.checked
                                ? [...transition.allowedRoles, role]
                                : transition.allowedRoles.filter((r) => r !== role);
                              updateTransition(transition.id, { allowedRoles: nextRoles });
                            }}
                          />
                          {role}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-[0.72rem] font-semibold text-app-muted">Ações tipadas:</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {ALL_ACTIONS.map((action) => {
                      const checked = transition.actions.includes(action);
                      return (
                        <label key={action} className="inline-flex items-center gap-1 text-[0.74rem] text-app-text">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canMutate || action === 'update-project'}
                            onChange={(e) => {
                              const nextActions = e.target.checked
                                ? [...transition.actions, action]
                                : transition.actions.filter((a) => a !== action);
                              updateTransition(transition.id, { actions: nextActions });
                            }}
                          />
                          {action}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
