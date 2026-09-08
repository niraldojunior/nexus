import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Plus, Search, Users } from 'lucide-react';
import { Button, Modal } from '../../../components/ui';
import Field from '../../../components/Field';
import {
  createPartyRoleType,
  listPartyRoleTypes,
  type PartyRoleType,
  type PartyRoleTypeInput,
} from '../../../services/partyRoleTypeApi';
import { PartyTypeDetail } from './PartyTypeDetail';

export type PartyModelStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
};

const emptyDraft = (): PartyRoleTypeInput => ({ key: '', roleName: '', label: '', description: '' });

export function PartyModelStudio({ canEdit }: PartyModelStudioProps) {
  const [types, setTypes] = useState<PartyRoleType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PartyRoleTypeInput>(emptyDraft());
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      const next = await listPartyRoleTypes();
      setTypes(next);
      setSelectedId((current) => (next.some((item) => item.id === current) ? current : next[0]?.id ?? null));
    } catch {
      setError('Não foi possível carregar os tipos de parte.');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const filteredTypes = useMemo(() => {
    const term = filterText.toLowerCase().trim();
    if (!term) return types;
    return types.filter((item) =>
      [item.label, item.description, item.roleName, item.key].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      ),
    );
  }, [filterText, types]);
  const selectedPartyType = types.find((item) => item.id === selectedId) ?? null;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createPartyRoleType({
        ...draft,
        key: draft.key.trim(),
        roleName: draft.roleName.trim(),
        label: draft.label.trim(),
        description: draft.description?.trim() || null,
      });
      setTypes((current) => [...current, created].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')));
      setSelectedId(created.id);
      setCreating(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o tipo de parte.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && !creating && (
        <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="vt-card flex min-h-[580px] flex-col p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-app-border pb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
              <input
                type="text"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder="Buscar tipo de parte..."
                className="w-full rounded-[10px] border border-app-border bg-white py-1.5 pl-8 pr-3 text-[0.82rem] text-app-text outline-none focus:border-app-accent"
              />
            </div>
            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                title="Novo tipo de parte"
                aria-label="Novo tipo de parte"
                onClick={() => {
                  setDraft(emptyDraft());
                  setError(null);
                  setCreating(true);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="max-h-[640px] flex-1 space-y-1.5 overflow-y-auto pr-1">
            {filteredTypes.length === 0 ? (
              <div className="p-8 text-center text-[0.84rem] text-app-muted">Nenhum tipo de parte encontrado.</div>
            ) : (
              filteredTypes.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(item.id);
                    }
                  }}
                  className={`cursor-pointer rounded-[10px] border p-3 text-[0.88rem] transition ${
                    selectedPartyType?.id === item.id
                      ? 'border-app-accent bg-app-accent-soft font-semibold text-app-text'
                      : 'border-app-border text-app-text hover:bg-black/[0.02]'
                  }`}
                >
                  <span className="block truncate font-medium">{item.label}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0">
          {selectedPartyType ? (
            <PartyTypeDetail
              partyType={selectedPartyType}
              canMutate={canEdit}
              onUpdated={(updated) =>
                setTypes((current) =>
                  current
                    .map((item) => (item.id === updated.id ? updated : item))
                    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
                )
              }
              onDeactivated={(id) => {
                setTypes((current) => {
                  const next = current.filter((item) => item.id !== id);
                  setSelectedId((selected) => (selected === id ? next[0]?.id ?? null : selected));
                  return next;
                });
              }}
            />
          ) : (
            <div className="flex min-h-[580px] flex-col items-center justify-center rounded-[10px] border border-dashed border-app-border p-12 text-center text-app-muted">
              <Users className="mb-3 h-10 w-10 opacity-30" />
              <h3 className="text-[1.1rem]">Nenhum tipo selecionado</h3>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <Modal
          title="Novo tipo de parte"
          onClose={() => !saving && setCreating(false)}
          width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={saving}>Cancelar</Button>
              <Button type="submit" form="party-role-type-form" disabled={saving}>
                {saving ? 'Criando…' : 'Criar'}
              </Button>
            </>
          }
        >
          {error && <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">{error}</p>}
          <form id="party-role-type-form" onSubmit={(event) => void handleCreate(event)} className="grid gap-4">
            <Field label="Título"><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className="geo-input" autoFocus /></Field>
            <Field label="Descrição"><textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="geo-input" rows={2} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Papel (roleName)"><input value={draft.roleName} onChange={(event) => setDraft({ ...draft, roleName: event.target.value })} className="geo-input font-mono" placeholder="manufacturer" /></Field>
              <Field label="Chave"><input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className="geo-input font-mono" placeholder="supplier" /></Field>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
