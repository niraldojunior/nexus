import { AlertCircle, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Field from '../../../components/Field';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';
import {
  type GeoProjectStatusBehavior,
  type GeoProjectStatusCatalogItem,
  type GeoProjectWorkflowAction,
  type GeoProjectWorkflowReadModel,
  type GeoProjectWorkflowRole,
  type GeoProjectWorkflowTransition,
} from '../../../services/geoProjectApi';
import { SortableHeader, sortedBy, useSort } from '../../config-tabs/sortable';

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
const behaviors: Array<{ value: GeoProjectStatusBehavior; label: string }> = [
  { value: 'planning', label: 'Planejamento' },
  { value: 'execution', label: 'Execução' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'close-release', label: 'Encerrar e liberar' },
];
type WorkflowSnapshot = Partial<Omit<GeoProjectWorkflowReadModel, 'fallback' | 'publicationChecksum'>>;
type StateDraft = Pick<GeoProjectStatusCatalogItem, 'name' | 'behavior' | 'sortOrder'>;
type StateEditDraft = StateDraft & Pick<GeoProjectStatusCatalogItem, 'active'>;
type Tab = 'states' | 'transitions';

const emptyStateDraft = (): StateDraft => ({ name: '', behavior: 'planning', sortOrder: 100 });
const workflowDefaults = (): WorkflowSnapshot => ({
  schemaVersion: 1,
  workflowId: 'geo-project',
  initialStateCode: undefined,
  states: [],
  transitions: [],
});

export function GeoProjectWorkflowStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: GeoProjectWorkflowStudioProps) {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>({});
  const [checksum, setChecksum] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('states');
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [stateDraft, setStateDraft] = useState<StateDraft>(emptyStateDraft());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<StateEditDraft | null>(null);
  const [savingState, setSavingState] = useState(false);
  const [stateSort, onStateSort] = useSort<'name' | 'behavior' | 'sortOrder' | 'active'>();
  const wasEditingRef = useRef(isEditing);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await getStudioStatus('rules-workflows');
      const version = status.draftVersion ?? status.publishedVersion;
      setSnapshot((version?.snapshot as WorkflowSnapshot | undefined) ?? {});
      setChecksum(status.draftVersion?.checksum);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar workflow de projetos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) void load();
    wasEditingRef.current = isEditing;
  }, [isEditing, load]);

  const buildSnapshot = useCallback(async (): Promise<Record<string, unknown>> => snapshot, [snapshot]);
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
    () => [...(snapshot.states ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [snapshot.states],
  );
  const sortedStates = useMemo(
    () =>
      sortedBy(states, stateSort, (state, key) => {
        if (key === 'name') return state.name;
        if (key === 'behavior') return behaviors.find((item) => item.value === state.behavior)?.label ?? state.behavior;
        if (key === 'sortOrder') return state.sortOrder;
        return state.active ? 1 : 0;
      }),
    [states, stateSort],
  );
  const transitions = snapshot.transitions ?? [];
  const updateSnapshot = (change: (current: Required<WorkflowSnapshot>) => Required<WorkflowSnapshot>) =>
    setSnapshot((current) => change({ ...workflowDefaults(), ...current } as Required<WorkflowSnapshot>));

  const createState = (event: FormEvent) => {
    event.preventDefault();
    if (!stateDraft.name.trim()) return;
    setSavingState(true);
    updateSnapshot((current) => {
      const code = `state-${Date.now()}`;
      const states = [...current.states, { ...stateDraft, name: stateDraft.name.trim(), code, active: true }];
      return { ...current, states, initialStateCode: current.initialStateCode ?? code };
    });
    setSavingState(false);
    setStateModalOpen(false);
  };
  const startEdit = (state: GeoProjectStatusCatalogItem) => {
    setEditingCode(state.code);
    setEditDraft({ name: state.name, behavior: state.behavior, sortOrder: state.sortOrder, active: state.active });
  };
  const saveEdit = () => {
    if (!editingCode || !editDraft || !editDraft.name.trim()) return;
    updateSnapshot((current) => ({
      ...current,
      states: current.states.map((state) =>
        state.code === editingCode ? { ...state, ...editDraft, name: editDraft.name.trim() } : state,
      ),
      // O estado inicial não pode ser um estado inativo: se a edição desativou o estado que era
      // o inicial, a seleção é limpa e a validação de publicação exige escolher outro.
      initialStateCode:
        current.initialStateCode === editingCode && !editDraft.active ? '' : current.initialStateCode,
    }));
    setEditingCode(null);
    setEditDraft(null);
  };
  const removeState = (code: string) => {
    updateSnapshot((current) => ({
      ...current,
      states: current.states.filter((state) => state.code !== code),
      transitions: current.transitions.filter((transition) =>
        transition.toStateCode !== code && !transition.fromStateCodes.includes(code),
      ),
      initialStateCode: current.initialStateCode === code ? '' : current.initialStateCode,
    }));
  };
  const setInitialState = (code: string) => updateSnapshot((current) => ({ ...current, initialStateCode: code }));
  const addTransition = () => {
    const firstState = states[0]?.code;
    if (!firstState) return;
    updateSnapshot((current) => ({
      ...current,
      transitions: [
        ...current.transitions,
        {
          id: `trans-${Date.now()}`,
          fromStateCodes: [firstState],
          toStateCode: firstState,
          allowedRoles: [...ALL_ROLES],
          actions: ['update-project'],
        },
      ],
    }));
  };
  const updateTransition = (id: string, patch: Partial<GeoProjectWorkflowTransition>) =>
    updateSnapshot((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => (transition.id === id ? { ...transition, ...patch } : transition)),
    }));

  if (loading) return <p className="text-[0.85rem] text-app-muted">Carregando regras de workflow…</p>;

  return (
    <div className="space-y-5">
      {error ? <ErrorMessage message={error} /> : null}
      <div role="tablist" aria-label="Workflow de Projetos" className="flex gap-1 border-b border-app-border">
        <TabButton active={tab === 'states'} onClick={() => setTab('states')} id="workflow-states-tab" controls="workflow-states">
          Estados
        </TabButton>
        <TabButton active={tab === 'transitions'} onClick={() => setTab('transitions')} id="workflow-transitions-tab" controls="workflow-transitions">
          Transições
        </TabButton>
      </div>

      {tab === 'states' ? (
        <section id="workflow-states" role="tabpanel" aria-labelledby="workflow-states-tab">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.82rem] text-app-muted">Estados declarados no snapshot publicado ou em edição.</p>
            {canMutate ? <Button onClick={() => { setStateDraft(emptyStateDraft()); setStateModalOpen(true); }} iconLeft={<Plus className="h-4 w-4" />}>Adicionar</Button> : null}
          </div>
          <div className="vt-card vt-table-card overflow-hidden p-0">
            <table className="vt-table min-w-[720px]">
              <thead><tr>
                <SortableHeader label="Nome" sortKey="name" sort={stateSort} onSort={onStateSort} />
                <th>Código</th>
                <SortableHeader label="Comportamento" sortKey="behavior" sort={stateSort} onSort={onStateSort} />
                <SortableHeader label="Ordem" sortKey="sortOrder" sort={stateSort} onSort={onStateSort} />
                <SortableHeader label="Ativo" sortKey="active" sort={stateSort} onSort={onStateSort} />
                <th>Estado inicial</th>
                <th aria-label="Ações" />
              </tr></thead>
              <tbody>{sortedStates.length === 0 ? <tr><td colSpan={7}>Nenhum estado configurado neste snapshot.</td></tr> : sortedStates.map((state) => {
                const editing = editingCode === state.code;
                const isInitial = snapshot.initialStateCode === state.code;
                const activeNow = editing && editDraft ? editDraft.active : state.active;
                return <tr key={state.code}>
                  <td>{editing && editDraft ? <input autoFocus className="geo-input h-9 text-[0.86rem]" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} /> : <span className="font-medium">{state.name}</span>}</td>
                  <td className="font-mono text-[0.8rem]">{state.code}</td>
                  <td>{editing && editDraft ? <select className="geo-input h-9 text-[0.86rem]" value={editDraft.behavior} onChange={(event) => setEditDraft({ ...editDraft, behavior: event.target.value as GeoProjectStatusBehavior })}>{behaviors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : behaviors.find((item) => item.value === state.behavior)?.label}</td>
                  <td>{editing && editDraft ? <input type="number" className="geo-input h-9 w-24 text-[0.86rem]" value={editDraft.sortOrder} onChange={(event) => setEditDraft({ ...editDraft, sortOrder: Number(event.target.value) })} /> : state.sortOrder}</td>
                  <td>{editing && editDraft ? <input type="checkbox" checked={editDraft.active} onChange={(event) => setEditDraft({ ...editDraft, active: event.target.checked })} aria-label={`Estado ${state.name} ativo`} /> : state.active ? 'Sim' : 'Não'}</td>
                  <td>
                    <input
                      type="radio"
                      name="workflow-initial-state"
                      checked={isInitial}
                      disabled={!canMutate || !activeNow}
                      onChange={() => setInitialState(state.code)}
                      aria-label={`Definir ${state.name} como estado inicial`}
                    />
                  </td>
                  <td><div className="flex justify-end gap-1">{canMutate ? editing ? <><IconButton label={`Salvar ${state.name}`} onClick={saveEdit}><Check className="h-4 w-4" /></IconButton><IconButton label={`Cancelar edição de ${state.name}`} onClick={() => { setEditingCode(null); setEditDraft(null); }}><X className="h-4 w-4" /></IconButton></> : <><IconButton label={`Editar ${state.name}`} onClick={() => startEdit(state)}><Pencil className="h-4 w-4" /></IconButton><IconButton label={`Remover ${state.name}`} danger onClick={() => removeState(state.code)}><Trash2 className="h-4 w-4" /></IconButton></> : null}</div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {!snapshot.initialStateCode && states.some((state) => state.active) ? (
            <p className="mt-2 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
              Selecione um estado inicial antes de publicar.
            </p>
          ) : null}
          {stateModalOpen ? <StateModal draft={stateDraft} saving={savingState} onChange={setStateDraft} onClose={() => setStateModalOpen(false)} onSubmit={createState} /> : null}
        </section>
      ) : (
        <section id="workflow-transitions" role="tabpanel" aria-labelledby="workflow-transitions-tab" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[0.82rem] text-app-muted">Matriz de transições permitidas e ações de ciclo de vida.</p>{canMutate ? <Button onClick={addTransition} disabled={states.length === 0} iconLeft={<Plus className="h-4 w-4" />}>Adicionar</Button> : null}</div>
          {states.length === 0 ? <p className="rounded-[10px] bg-app-accent-soft p-3 text-[0.82rem] text-app-muted">Adicione um estado antes de configurar transições.</p> : null}
          <div className="space-y-3">{transitions.map((transition) => <TransitionCard key={transition.id} transition={transition} states={states} canMutate={canMutate} onChange={updateTransition} onRemove={() => updateSnapshot((current) => ({ ...current, transitions: current.transitions.filter((item) => item.id !== transition.id) }))} />)}</div>
        </section>
      )}
    </div>
  );
}

function TabButton({ active, onClick, id, controls, children }: { active: boolean; onClick: () => void; id: string; controls: string; children: string }) { return <button type="button" role="tab" id={id} aria-controls={controls} aria-selected={active} tabIndex={active ? 0 : -1} onClick={onClick} className={`border-b-2 px-3 py-2 text-[0.82rem] font-semibold ${active ? 'border-app-text text-app-text' : 'border-transparent text-app-muted hover:text-app-text'}`}>{children}</button>; }
function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) { return <button type="button" aria-label={label} onClick={onClick} className={`rounded-xl border border-transparent p-1.5 transition ${danger ? 'text-status-red hover:border-status-red hover:bg-status-red-soft' : 'text-app-muted hover:border-app-border hover:bg-app-accent-soft'}`}>{children}</button>; }
function ErrorMessage({ message }: { message: string }) { return <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red"><AlertCircle className="h-4 w-4" />{message}</div>; }

function StateModal({ draft, saving, onChange, onClose, onSubmit }: { draft: StateDraft; saving: boolean; onChange: (next: StateDraft) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) { return <Modal title="Criar estado de Projeto" onClose={onClose} width={480} footer={<><Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="submit" form="workflow-state-form" disabled={saving || !draft.name.trim()}>{saving ? 'Salvando...' : 'Criar'}</Button></>}><form id="workflow-state-form" onSubmit={onSubmit} className="grid gap-4"><Field label="Nome"><input autoFocus className="geo-input" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field><Field label="Comportamento"><select className="geo-input" value={draft.behavior} onChange={(event) => onChange({ ...draft, behavior: event.target.value as GeoProjectStatusBehavior })}>{behaviors.filter((item) => item.value !== 'close-release').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field label="Ordem"><input type="number" className="geo-input" value={draft.sortOrder} onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })} /></Field></form></Modal>; }

function TransitionCard({ transition, states, canMutate, onChange, onRemove }: { transition: GeoProjectWorkflowTransition; states: GeoProjectStatusCatalogItem[]; canMutate: boolean; onChange: (id: string, patch: Partial<GeoProjectWorkflowTransition>) => void; onRemove: () => void }) { return <div className="vt-card space-y-3 p-4"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[0.78rem] font-semibold text-app-text">{transition.id}</span>{canMutate ? <IconButton label={`Remover transição ${transition.id}`} danger onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></IconButton> : null}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="Origens (fromStateCodes)"><input className="geo-input" disabled={!canMutate} value={transition.fromStateCodes.join(', ')} onChange={(event) => onChange(transition.id, { fromStateCodes: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></Field><Field label="Destino (toStateCode)"><select className="geo-input" disabled={!canMutate} value={transition.toStateCode} onChange={(event) => onChange(transition.id, { toStateCode: event.target.value })}>{states.map((state) => <option key={state.code} value={state.code}>{state.name} ({state.code})</option>)}</select></Field></div><TransitionOptions label="Papéis autorizados" options={ALL_ROLES} values={transition.allowedRoles} disabled={!canMutate} onChange={(allowedRoles) => onChange(transition.id, { allowedRoles: allowedRoles as GeoProjectWorkflowRole[] })} /><TransitionOptions label="Ações tipadas" options={ALL_ACTIONS} values={transition.actions} disabled={!canMutate} required="update-project" onChange={(actions) => onChange(transition.id, { actions: actions as GeoProjectWorkflowAction[] })} /></div>; }
function TransitionOptions({ label, options, values, disabled, required, onChange }: { label: string; options: readonly string[]; values: readonly string[]; disabled: boolean; required?: string; onChange: (values: string[]) => void }) { return <fieldset><legend className="text-[0.72rem] font-semibold text-app-muted">{label}</legend><div className="mt-1 flex flex-wrap gap-3">{options.map((option) => <label key={option} className="inline-flex items-center gap-1 text-[0.76rem] text-app-text"><input type="checkbox" checked={values.includes(option)} disabled={disabled || option === required} onChange={(event) => onChange(event.target.checked ? [...values, option] : values.filter((value) => value !== option))} />{option}</label>)}</div></fieldset>; }
