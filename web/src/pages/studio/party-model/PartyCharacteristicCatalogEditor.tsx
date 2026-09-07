// Aba "Características Gerais" do Studio -> Partes (issue #220). Tabela editável com
// persistência linha-a-linha (não em lote), inspirada na tabela de status de projeto da
// ConfigurationPage — cada create/update/deactivate chama a API imediatamente.

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  listPartyRoleTypeCharacteristics,
  createPartyRoleTypeCharacteristic,
  updatePartyRoleTypeCharacteristic,
  deactivatePartyRoleTypeCharacteristic,
  type PartyRoleTypeCharacteristic,
  type PartyRoleTypeCharacteristicValueType,
} from '../../../services/partyRoleTypeCharacteristicApi';
import { Button } from '../../../components/ui';

export type PartyCharacteristicCatalogEditorProps = {
  roleName: string;
  canMutate: boolean;
};

const VALUE_TYPE_OPTIONS: Array<{ value: PartyRoleTypeCharacteristicValueType; label: string }> = [
  { value: 'string', label: 'Texto' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date', label: 'Data' },
  { value: 'list', label: 'Lista' },
  { value: 'json', label: 'JSON' },
];

type EditingRow = {
  name: string;
  group: string;
  description: string;
  valueType: PartyRoleTypeCharacteristicValueType;
  allowedValues: string;
};

const emptyRow = (): EditingRow => ({
  name: '',
  group: '',
  description: '',
  valueType: 'string',
  allowedValues: '',
});

export function PartyCharacteristicCatalogEditor({
  roleName,
  canMutate,
}: PartyCharacteristicCatalogEditorProps) {
  const [rows, setRows] = useState<PartyRoleTypeCharacteristic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edição inline: qual id está sendo editado (null = nenhum, 'new' = criando)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditingRow>(emptyRow());
  const [saving, setSaving] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    void listPartyRoleTypeCharacteristics(roleName)
      .then(setRows)
      .catch(() => setError('Não foi possível carregar as características.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, [roleName]);

  const startCreate = () => {
    setEditingId('new');
    setEditDraft(emptyRow());
    setError(null);
  };

  const startEdit = (item: PartyRoleTypeCharacteristic) => {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      group: item.group ?? '',
      description: item.description ?? '',
      valueType: item.valueType,
      allowedValues: item.allowedValues ? item.allowedValues.join(', ') : '',
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyRow());
  };

  const parseAllowedValues = (raw: string): string[] | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const saveRow = async () => {
    if (!editDraft.name.trim()) {
      setError('O nome da característica é obrigatório.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const allowedValues = parseAllowedValues(editDraft.allowedValues);
      if (editingId === 'new') {
        await createPartyRoleTypeCharacteristic(roleName, {
          name: editDraft.name.trim(),
          group: editDraft.group.trim() || null,
          description: editDraft.description.trim() || null,
          valueType: editDraft.valueType,
          allowedValues,
        });
      } else if (editingId) {
        await updatePartyRoleTypeCharacteristic(roleName, editingId, {
          name: editDraft.name.trim(),
          group: editDraft.group.trim() || null,
          description: editDraft.description.trim() || null,
          valueType: editDraft.valueType,
          allowedValues,
        });
      }
      setEditingId(null);
      setEditDraft(emptyRow());
      reload();
    } catch {
      setError('Não foi possível salvar a característica.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item: PartyRoleTypeCharacteristic) => {
    setError(null);
    try {
      await deactivatePartyRoleTypeCharacteristic(roleName, item.id);
      reload();
    } catch {
      setError('Não foi possível desativar a característica.');
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
            Adicionar
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

      <div className="vt-card vt-table-card" style={{ overflow: 'hidden', padding: 0 }}>
        <table className="vt-table" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Grupo</th>
              <th>Tipo</th>
              <th>Valores permitidos</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Carregando…</td>
              </tr>
            ) : (
              <>
                {editingId === 'new' && (
                  <tr>
                    <td>
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        className={inputClass}
                        placeholder="Nome *"
                        autoFocus
                      />
                    </td>
                    <td>
                      <input
                        value={editDraft.group}
                        onChange={(e) => setEditDraft({ ...editDraft, group: e.target.value })}
                        className={inputClass}
                        placeholder="Grupo"
                      />
                    </td>
                    <td>
                      <select
                        value={editDraft.valueType}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            valueType: e.target.value as PartyRoleTypeCharacteristicValueType,
                          })
                        }
                        className={inputClass}
                      >
                        {VALUE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {editDraft.valueType === 'list' ? (
                        <input
                          value={editDraft.allowedValues}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, allowedValues: e.target.value })
                          }
                          className={inputClass}
                          placeholder="val1, val2, val3"
                        />
                      ) : (
                        <span className="text-app-muted text-[0.8rem]">—</span>
                      )}
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
                          disabled={saving || !editDraft.name.trim()}
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
                    <td colSpan={6}>Nenhuma característica cadastrada para este tipo.</td>
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
                                value={editDraft.name}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, name: e.target.value })
                                }
                                className={inputClass}
                                autoFocus
                              />
                            </td>
                            <td>
                              <input
                                value={editDraft.group}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, group: e.target.value })
                                }
                                className={inputClass}
                              />
                            </td>
                            <td>
                              <select
                                value={editDraft.valueType}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    valueType:
                                      e.target.value as PartyRoleTypeCharacteristicValueType,
                                  })
                                }
                                className={inputClass}
                              >
                                {VALUE_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              {editDraft.valueType === 'list' ? (
                                <input
                                  value={editDraft.allowedValues}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, allowedValues: e.target.value })
                                  }
                                  className={inputClass}
                                  placeholder="val1, val2, val3"
                                />
                              ) : (
                                <span className="text-app-muted text-[0.8rem]">—</span>
                              )}
                            </td>
                            <td>
                              <span className="text-[0.82rem] text-app-text">
                                {item.active ? 'Sim' : 'Não'}
                              </span>
                            </td>
                            <td>
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => void saveRow()}
                                  className="rounded-xl border border-transparent p-1.5 text-status-green transition hover:border-status-green hover:bg-status-green-soft"
                                  aria-label="Salvar"
                                  disabled={saving || !editDraft.name.trim()}
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
                            <td
                              className="font-medium"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {item.name}
                              {item.description && (
                                <p className="text-[0.76rem] text-app-muted font-normal mt-0.5">
                                  {item.description}
                                </p>
                              )}
                            </td>
                            <td>{item.group || '—'}</td>
                            <td>
                              <span className="text-[0.78rem] font-mono px-1.5 py-0.5 rounded bg-black/[0.04] text-app-muted">
                                {VALUE_TYPE_OPTIONS.find((opt) => opt.value === item.valueType)
                                  ?.label ?? item.valueType}
                              </span>
                            </td>
                            <td>
                              {item.allowedValues && item.allowedValues.length > 0
                                ? item.allowedValues.join(', ')
                                : '—'}
                            </td>
                            <td>{item.active ? 'Sim' : 'Não'}</td>
                            <td>
                              <div className="flex justify-end gap-1">
                                {canMutate && (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(item)}
                                    className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                                    aria-label={`Editar ${item.name}`}
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
                                    aria-label={`Desativar ${item.name}`}
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
