import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Database, Save, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui';
import {
  deactivateReferenceDataSet,
  updateReferenceDataSet,
  type ReferenceDataSet,
  type ReferenceDataSetInput,
} from '../../../services/studioReferenceDataApi';
import { ReferenceDataValueEditor } from './ReferenceDataValueEditor';

export type ReferenceDataSetDetailProps = {
  set: ReferenceDataSet;
  canMutate: boolean;
  onUpdated: (set: ReferenceDataSet) => void;
  onDeactivated: (id: string) => void;
};

const toDraft = (set: ReferenceDataSet): ReferenceDataSetInput => ({
  key: set.key,
  name: set.name,
  description: set.description ?? '',
});

export function ReferenceDataSetDetail({ set, canMutate, onUpdated, onDeactivated }: ReferenceDataSetDetailProps) {
  const [draft, setDraft] = useState<ReferenceDataSetInput>(() => toDraft(set));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setDraft(toDraft(set));
    setError(null);
    setSuccess(false);
  }, [set]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateReferenceDataSet(set.id, {
        key: draft.key.trim(),
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
      });
      onUpdated(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o conjunto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm(`Inativar ${set.name}? Os valores existentes serão preservados.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deactivateReferenceDataSet(set.id);
      onDeactivated(set.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível inativar o conjunto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vt-card flex h-full flex-col overflow-hidden p-0">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-sky-200 bg-sky-50 text-sky-600">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-bold leading-tight text-app-text">{set.name}</h3>
              <p className="mt-0.5 truncate text-[0.78rem] font-normal leading-tight text-app-muted">
                {set.description}
              </p>
            </div>
          </div>
          {canMutate && (
            <Button
              variant="danger"
              size="sm"
              iconLeft={<Trash2 className="h-4 w-4" />}
              onClick={() => void handleDeactivate()}
              disabled={saving}
            >
              Inativar
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-4">
        <form onSubmit={(event) => void handleSave(event)} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-[0.84rem] text-emerald-800">
              <Check className="h-4 w-4 text-emerald-600" />
              Alterações salvas com sucesso.
            </div>
          )}
          {canMutate ? (
            <>
              <div className="flex items-center justify-between border-b border-app-border pb-2">
                <span className="text-[0.78rem] text-app-muted">Altere os dados deste conjunto.</span>
                <Button type="submit" variant="primary" size="sm" iconLeft={<Save className="h-4 w-4" />} disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-[0.8rem] font-semibold text-app-text">
                  Nome *
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className="mt-1.5 w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.88rem] font-normal outline-none focus:border-app-accent"
                  />
                </label>
                <label className="block text-[0.8rem] font-semibold text-app-text">
                  Chave *
                  <input
                    value={draft.key}
                    onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                    className="mt-1.5 w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.88rem] font-mono font-normal outline-none focus:border-app-accent"
                  />
                </label>
              </div>
              <label className="block text-[0.8rem] font-semibold text-app-text">
                Descrição
                <textarea
                  value={draft.description ?? ''}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={2}
                  className="mt-1.5 w-full rounded-[10px] border border-app-border bg-white px-3 py-2 text-[0.88rem] font-normal outline-none focus:border-app-accent"
                />
              </label>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ['Nome', set.name],
                ['Chave', set.key],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[10px] border border-app-border p-4">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>{label}</span>
                  <p className="mt-1 text-[0.95rem] font-medium text-app-text">{value}</p>
                </div>
              ))}
            </div>
          )}
        </form>

        <div>
          <h4 className="mb-3" style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
            Valores
          </h4>
          <ReferenceDataValueEditor setId={set.id} canMutate={canMutate} />
        </div>
      </div>
    </div>
  );
}
