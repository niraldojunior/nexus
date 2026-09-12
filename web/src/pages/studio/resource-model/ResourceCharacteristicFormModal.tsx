import { useEffect, useState } from 'react';
import { AlertCircle, Tag } from 'lucide-react';
import type { ResourceCharacteristicRow } from '../../../utils/resourceCharacteristicsForm';
import { emptyResourceCharacteristicRow } from '../../../utils/resourceCharacteristicsForm';
import { listReferenceDataSets, type ReferenceDataSet } from '../../../services/studioReferenceDataApi';
import { Modal, Button } from '../../../components/ui';

const VALUE_TYPE_OPTIONS: { value: ResourceCharacteristicRow['valueType']; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date', label: 'Data' },
  { value: 'list', label: 'Lista de opções' },
  { value: 'json', label: 'JSON livre' },
];

export type ResourceCharacteristicFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** `null` cria uma nova característica; caso contrário edita a linha informada. */
  editingRow: ResourceCharacteristicRow | null;
  readOnly?: boolean;
  /** Nomes já usados por outras características do tipo — evita duplicata (case-insensitive). */
  existingNames: string[];
  onSave: (row: ResourceCharacteristicRow) => Promise<void> | void;
};

/**
 * Cria/edita uma única `ResourceCharacteristicRow` (plano §8) — substitui a edição tabular de
 * `ResourceCharacteristicsEditor` na aba "Características" por lista + modal, no mesmo padrão do
 * modal de `ResourceSpecification`.
 */
export function ResourceCharacteristicFormModal({
  isOpen,
  onClose,
  editingRow,
  readOnly = false,
  existingNames,
  onSave,
}: ResourceCharacteristicFormModalProps) {
  const isEditing = Boolean(editingRow);
  const [row, setRow] = useState<ResourceCharacteristicRow>(emptyResourceCharacteristicRow());
  const [referenceDataSets, setReferenceDataSets] = useState<ReferenceDataSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRow(editingRow ?? emptyResourceCharacteristicRow());
    setError(null);
  }, [isOpen, editingRow]);

  useEffect(() => {
    void listReferenceDataSets()
      .then((sets) => setReferenceDataSets(sets.filter((set) => set.active)))
      .catch(() => setReferenceDataSets([]));
  }, []);

  if (!isOpen) return null;

  const listOptions =
    row.valueType === 'list'
      ? (row.allowedValuesText
          ? row.allowedValuesText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : row.allowedValues) ?? []
      : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = row.name.trim();
    if (!trimmedName) {
      setError('O nome da característica é obrigatório.');
      return;
    }
    const isDuplicate = existingNames.some(
      (name) => name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (isDuplicate) {
      setError('Já existe uma característica com este nome.');
      return;
    }

    try {
      setSubmitting(true);
      await onSave({ ...row, name: trimmedName });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar característica.');
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = readOnly
    ? 'Detalhes da característica'
    : isEditing
      ? 'Editar característica'
      : 'Nova característica';

  return (
    <Modal
      onClose={onClose}
      width={520}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-text">
            <Tag className="h-5 w-5" />
          </div>
          <h3>{modalTitle}</h3>
        </div>
      }
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="resource-characteristic-form"
              disabled={submitting}
            >
              {submitting ? 'Salvando…' : isEditing ? 'Atualizar característica' : 'Criar característica'}
            </Button>
          </>
        )
      }
    >
      <div>
        {error && (
          <div
            className="mb-4 flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
            style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form id="resource-characteristic-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Nome {readOnly ? '' : '*'}
              </label>
              <input
                type="text"
                value={row.name}
                onChange={(e) => setRow((prev) => ({ ...prev, name: e.target.value }))}
                disabled={readOnly}
                placeholder="Ex.: capacidade_portas"
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
              />
            </div>
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">Grupo</label>
              <input
                type="text"
                value={row.group ?? ''}
                onChange={(e) => setRow((prev) => ({ ...prev, group: e.target.value }))}
                disabled={readOnly}
                placeholder="Ex.: Técnico"
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
              />
            </div>
          </div>

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">Descrição</label>
            <textarea
              rows={2}
              value={row.description ?? ''}
              onChange={(e) => setRow((prev) => ({ ...prev, description: e.target.value }))}
              disabled={readOnly}
              placeholder="Descreva a finalidade desta característica..."
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
            />
          </div>

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">Tipo</label>
            <select
              value={row.valueType}
              onChange={(e) => {
                const nextType = e.target.value as ResourceCharacteristicRow['valueType'];
                setRow((prev) => ({
                  ...prev,
                  valueType: nextType,
                  valueText: nextType === 'boolean' ? 'false' : '',
                }));
              }}
              disabled={readOnly}
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
            >
              {VALUE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {row.valueType === 'list' && (
            <div className="space-y-2">
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Valores permitidos
              </label>
              <select
                value={row.referenceDataSetKey ?? ''}
                onChange={(e) =>
                  setRow((prev) => ({
                    ...prev,
                    referenceDataSetKey: e.target.value || null,
                    ...(e.target.value ? { allowedValuesText: '', allowedValues: undefined } : {}),
                  }))
                }
                disabled={readOnly}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
                aria-label="Conjunto de referência"
              >
                <option value="">Opções digitadas manualmente</option>
                {referenceDataSets.map((set) => (
                  <option key={set.key} value={set.key}>
                    {set.name}
                  </option>
                ))}
              </select>
              {!row.referenceDataSetKey && (
                <input
                  value={row.allowedValuesText ?? ''}
                  onChange={(e) => setRow((prev) => ({ ...prev, allowedValuesText: e.target.value }))}
                  disabled={readOnly}
                  placeholder="Opção 1, Opção 2, Opção 3..."
                  className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 font-mono text-[0.82rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Valor padrão
            </label>
            {row.valueType === 'boolean' ? (
              <label className={`flex items-center gap-2 select-none ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={row.valueText === 'true'}
                  disabled={readOnly}
                  onChange={(e) =>
                    setRow((prev) => ({ ...prev, valueText: e.target.checked ? 'true' : 'false' }))
                  }
                  className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent disabled:opacity-75"
                />
                <span className="text-[0.82rem] text-app-text">
                  {row.valueText === 'true' ? 'Sim' : 'Não'}
                </span>
              </label>
            ) : row.valueType === 'list' && listOptions.length > 0 ? (
              <select
                value={row.valueText}
                disabled={readOnly}
                onChange={(e) => setRow((prev) => ({ ...prev, valueText: e.target.value }))}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
              >
                <option value="">Selecione um padrão...</option>
                {listOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={
                  row.valueType === 'date'
                    ? 'date'
                    : row.valueType === 'integer' || row.valueType === 'decimal'
                      ? 'number'
                      : 'text'
                }
                step={row.valueType === 'decimal' ? 'any' : undefined}
                value={row.valueText}
                disabled={readOnly}
                onChange={(e) => setRow((prev) => ({ ...prev, valueText: e.target.value }))}
                placeholder={row.valueType === 'json' ? '{"chave":"valor"}' : 'Valor da característica'}
                className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
              />
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}
