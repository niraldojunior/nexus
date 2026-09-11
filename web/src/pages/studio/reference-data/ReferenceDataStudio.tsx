// Studio -> Dados de Referência (issue #196/#191): conjuntos e valores reutilizáveis por
// characteristics de qualquer módulo. Mesmo padrão de PartyModelStudio: lista à esquerda com
// busca/criação, detalhe à direita; captura de snapshot leva sets + values para o publish do
// ReferenceDataStudioAdapter.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Database, Plus, Search } from 'lucide-react';
import { Button, Modal } from '../../../components/ui';
import Field from '../../../components/Field';
import {
  createReferenceDataSet,
  listReferenceDataSets,
  listReferenceDataValues,
  type ReferenceDataSet,
  type ReferenceDataSetInput,
} from '../../../services/studioReferenceDataApi';
import { ReferenceDataSetDetail } from './ReferenceDataSetDetail';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';

export type ReferenceDataStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
  isEditing: boolean;
  onRegisterCaptureDraft: (capture: (() => Promise<void>) | null) => void;
  onRegisterCaptureInitialSnapshot: (
    capture: (() => Promise<Record<string, unknown>>) | null,
  ) => void;
};

const emptyDraft = (): ReferenceDataSetInput => ({ key: '', name: '', description: '' });

export function ReferenceDataStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: ReferenceDataStudioProps) {
  const [sets, setSets] = useState<ReferenceDataSet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReferenceDataSetInput>(emptyDraft());
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      const next = await listReferenceDataSets();
      setSets(next);
      setSelectedId((current) => (next.some((item) => item.id === current) ? current : next[0]?.id ?? null));
    } catch {
      setError('Não foi possível carregar os conjuntos de dados de referência.');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  // Assíncrono: o snapshot publicado precisa levar os valores de cada conjunto, senão o publish
  // do ReferenceDataStudioAdapter os desativaria por ausência (diff contra o catálogo existente).
  const captureSnapshot = useCallback(async (): Promise<Record<string, unknown>> => {
    const snapshotSets = await Promise.all(
      sets.map(async (set) => {
        const values = await listReferenceDataValues(set.id);
        return {
          id: set.id,
          key: set.key,
          name: set.name,
          description: set.description,
          active: set.active,
          values: values.map((value) => ({
            id: value.id,
            key: value.key,
            label: value.label,
            sortOrder: value.sortOrder,
            active: value.active,
          })),
        };
      }),
    );
    return { sets: snapshotSets };
  }, [sets]);

  useEffect(() => {
    const capture = async (): Promise<void> => {
      const status = await getStudioStatus('reference-data');
      await saveStudioDraft('reference-data', await captureSnapshot(), status.draftVersion?.checksum);
    };
    onRegisterCaptureDraft(capture);
    onRegisterCaptureInitialSnapshot(captureSnapshot);
    return () => {
      onRegisterCaptureDraft(null);
      onRegisterCaptureInitialSnapshot(null);
    };
  }, [captureSnapshot, onRegisterCaptureDraft, onRegisterCaptureInitialSnapshot]);

  const filteredSets = useMemo(() => {
    const term = filterText.toLowerCase().trim();
    if (!term) return sets;
    return sets.filter((item) =>
      [item.name, item.description, item.key].some((value) => (value ?? '').toLowerCase().includes(term)),
    );
  }, [filterText, sets]);
  const selectedSet = sets.find((item) => item.id === selectedId) ?? null;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createReferenceDataSet({
        key: draft.key.trim(),
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
      });
      setSets((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setSelectedId(created.id);
      setCreating(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o conjunto.');
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
                placeholder="Buscar conjunto..."
                aria-label="Buscar conjunto"
                className="w-full rounded-[10px] border border-app-border bg-white py-1.5 pl-8 pr-3 text-[0.82rem] text-app-text outline-none focus:border-app-accent"
              />
            </div>
            {canEdit && isEditing && (
              <Button
                variant="primary"
                size="sm"
                title="Novo conjunto"
                aria-label="Novo conjunto"
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
            {filteredSets.length === 0 ? (
              <div className="p-8 text-center text-[0.84rem] text-app-muted">Nenhum conjunto encontrado.</div>
            ) : (
              filteredSets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedSet?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-[10px] border p-3 text-left text-[0.88rem] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                    selectedSet?.id === item.id
                      ? 'border-app-accent bg-app-accent-soft font-semibold text-app-text'
                      : 'border-app-border text-app-text hover:bg-black/[0.02]'
                  }`}
                >
                  <span className="block truncate font-medium">{item.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0">
          {selectedSet ? (
            <ReferenceDataSetDetail
              set={selectedSet}
              canMutate={canEdit && isEditing}
              onUpdated={(updated) =>
                setSets((current) =>
                  current
                    .map((item) => (item.id === updated.id ? updated : item))
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
                )
              }
              onDeactivated={(id) => {
                setSets((current) => {
                  const next = current.filter((item) => item.id !== id);
                  setSelectedId((selected) => (selected === id ? next[0]?.id ?? null : selected));
                  return next;
                });
              }}
            />
          ) : (
            <div className="flex min-h-[580px] flex-col items-center justify-center rounded-[10px] border border-dashed border-app-border p-12 text-center text-app-muted">
              <Database className="mb-3 h-10 w-10 opacity-30" />
              <h3 className="text-[1.1rem]">Nenhum conjunto selecionado</h3>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <Modal
          title="Novo conjunto"
          onClose={() => !saving && setCreating(false)}
          width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" form="reference-data-set-form" disabled={saving}>
                {saving ? 'Criando…' : 'Criar'}
              </Button>
            </>
          }
        >
          {error && (
            <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
              {error}
            </p>
          )}
          <form id="reference-data-set-form" onSubmit={(event) => void handleCreate(event)} className="grid gap-4">
            <Field label="Nome">
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className="geo-input"
                autoFocus
              />
            </Field>
            <Field label="Descrição">
              <textarea
                value={draft.description ?? ''}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                className="geo-input"
                rows={2}
              />
            </Field>
            <Field label="Chave">
              <input
                value={draft.key}
                onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                className="geo-input font-mono"
                placeholder="uf, tipo-fibra..."
              />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
