// Lista editável de valores de um conjunto de Reference Data (Studio -> Dados de Referência,
// issue #196). Persistência linha-a-linha, mesmo padrão de PartyCharacteristicCatalogEditor.

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  createReferenceDataValue,
  deactivateReferenceDataValue,
  listReferenceDataValues,
  updateReferenceDataValue,
  type ReferenceDataValue,
} from '../../../services/studioReferenceDataApi';
import { Button } from '../../../components/ui';

export type ReferenceDataValueEditorProps = {
  setId: string;
  canMutate: boolean;
};

type EditingRow = { key: string; label: string; sortOrder: string };

const emptyRow = (): EditingRow => ({ key: '', label: '', sortOrder: '100' });

export function ReferenceDataValueEditor({ setId, canMutate }: ReferenceDataValueEditorProps) {
  const [rows, setRows] = useState<ReferenceDataValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditingRow>(emptyRow());
  const [saving, setSaving] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    void listReferenceDataValues(setId)
      .then(setRows)
      .catch(() => setError('Não foi possível carregar os valores.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, [setId]);

  const startCreate = () => {
    setEditingId('new');
    setEditDraft(emptyRow());
    setError(null);
  };

  const startEdit = (item: ReferenceDataValue) => {
    setEditingId(item.id);
    setEditDraft({ key: item.key, label: item.label, sortOrder: String(item.sortOrder) });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyRow());
  };

  const saveRow = async () => {
    if (!editDraft.key.trim() || !editDraft.label.trim()) {
      setError('A chave e o rótulo do valor são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        key: editDraft.key.trim(),
        label: editDraft.label.trim(),
        sortOrder: Number(editDraft.sortOrder) || 100,
      };
      if (editingId === 'new') {
        await createReferenceDataValue(setId, input);
      } else if (editingId) {
        await updateReferenceDataValue(setId, editingId, input);
      }
      setEditingId(null);
      setEditDraft(emptyRow());
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o valor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item: ReferenceDataValue) => {
    setError(null);
    try {
      await deactivateReferenceDataValue(setId, item.id);
      reload();
    } catch {
      setError('Não foi possível desativar o valor.');
    }
  };

  const inputClass =
    'w-full rounded-[10px] border border-app-border bg-white px-2.5 py-1.5 text-[0.84rem] text-app-text outline-none focus:border-app-accent';

  return (
    <div className="space-y-3">
      {canMutate && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-3.5 w-3.5" />}
            onClick={startCreate}
            disabled={editingId !== null}
          >
            Adicionar valor
          </Button>
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
          style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="vt-card vt-table-card overflow-x-auto" style={{ padding: 0 }}>
        <table className="vt-table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Chave</th>
              <th>Rótulo</th>
              <th>Ordem</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Carregando…</td>
              </tr>
            ) : (
              <>
                {editingId === 'new' && (
                  <tr>
                    <td>
                      <input
                        value={editDraft.key}
                        onChange={(e) => setEditDraft({ ...editDraft, key: e.target.value })}
                        className={`${inputClass} font-mono`}
                        placeholder="chave"
                        autoFocus
                      />
                    </td>
                    <td>
                      <input
                        value={editDraft.label}
                        onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                        className={inputClass}
                        placeholder="Rótulo *"
                      />
                    </td>
                    <td>
                      <input
                        value={editDraft.sortOrder}
                        onChange={(e) => setEditDraft({ ...editDraft, sortOrder: e.target.value })}
                        className={inputClass}
                        type="number"
                      />
                    </td>
                    <td>
                      <span className="text-[0.82rem] text-app-text">Sim</span>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void saveRow()}
                          className="rounded-xl border border-transparent p-1.5 text-status-green transition hover:border-status-green hover:bg-status-green-soft"
                          aria-label="Salvar"
                          disabled={saving || !editDraft.key.trim() || !editDraft.label.trim()}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                          aria-label="Cancelar"
                          disabled={saving}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {rows.length === 0 && editingId !== 'new' ? (
                  <tr>
                    <td colSpan={5}>Nenhum valor cadastrado para este conjunto.</td>
                  </tr>
                ) : (
                  rows.map((item) => {
                    const isEditing = editingId === item.id;
                    return (
                      <tr key={item.id} className={!item.active ? 'opacity-50' : undefined}>
                        {isEditing ? (
                          <>
                            <td>
                              <input
                                value={editDraft.key}
                                onChange={(e) => setEditDraft({ ...editDraft, key: e.target.value })}
                                className={`${inputClass} font-mono`}
                                autoFocus
                              />
                            </td>
                            <td>
                              <input
                                value={editDraft.label}
                                onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                                className={inputClass}
                              />
                            </td>
                            <td>
                              <input
                                value={editDraft.sortOrder}
                                onChange={(e) => setEditDraft({ ...editDraft, sortOrder: e.target.value })}
                                className={inputClass}
                                type="number"
                              />
                            </td>
                            <td>
                              <span className="text-[0.82rem] text-app-text">{item.active ? 'Sim' : 'Não'}</span>
                            </td>
                            <td>
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => void saveRow()}
                                  className="rounded-xl border border-transparent p-1.5 text-status-green transition hover:border-status-green hover:bg-status-green-soft"
                                  aria-label="Salvar"
                                  disabled={saving || !editDraft.key.trim() || !editDraft.label.trim()}
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                                  aria-label="Cancelar"
                                  disabled={saving}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="font-mono text-[0.82rem]">{item.key}</td>
                            <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {item.label}
                            </td>
                            <td>{item.sortOrder}</td>
                            <td>{item.active ? 'Sim' : 'Não'}</td>
                            <td>
                              <div className="flex justify-end gap-1">
                                {canMutate && (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(item)}
                                    className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                                    aria-label={`Editar ${item.label}`}
                                    disabled={editingId !== null}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                )}
                                {canMutate && item.active ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleDeactivate(item)}
                                    className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                                    aria-label={`Desativar ${item.label}`}
                                    disabled={editingId !== null}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
