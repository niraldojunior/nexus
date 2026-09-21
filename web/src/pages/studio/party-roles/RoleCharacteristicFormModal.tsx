import { useEffect, useState } from 'react';
import { AlertCircle, Tag } from 'lucide-react';
import type { PartyRoleCharacteristicRow } from '../../../utils/partyCharacteristicsForm';
import { emptyPartyRoleCharacteristicRow } from '../../../utils/partyCharacteristicsForm';
import {
  listReferenceDataSets,
  type ReferenceDataSet,
} from '../../../services/studioReferenceDataApi';
import { Modal, Button } from '../../../components/ui';

const VALUE_TYPE_OPTIONS: { value: PartyRoleCharacteristicRow['valueType']; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date', label: 'Data' },
  { value: 'list', label: 'Lista de opções' },
  { value: 'json', label: 'JSON livre' },
];

export type RoleCharacteristicFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  editingRow: PartyRoleCharacteristicRow | null;
  readOnly?: boolean;
  existingNames: string[];
  onSave: (row: PartyRoleCharacteristicRow) => void;
};

export function RoleCharacteristicFormModal({
  isOpen,
  onClose,
  editingRow,
  readOnly = false,
  existingNames,
  onSave,
}: RoleCharacteristicFormModalProps) {
  const isEditing = Boolean(editingRow);
  const [row, setRow] = useState<PartyRoleCharacteristicRow>(emptyPartyRoleCharacteristicRow());
  const [referenceDataSets, setReferenceDataSets] = useState<ReferenceDataSet[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRow(editingRow ?? emptyPartyRoleCharacteristicRow());
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
      ? ((row.allowedValuesText
          ? row.allowedValuesText
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          : row.allowedValues) ?? [])
      : [];

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = row.name.trim();
    if (!name) {
      setError('O nome da característica é obrigatório.');
      return;
    }
    if (existingNames.some((item) => item.trim().toLowerCase() === name.toLowerCase())) {
      setError('Já existe uma característica com este nome.');
      return;
    }
    try {
      onSave({ ...row, name });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Valor padrão inválido.');
    }
  };

  const title = readOnly
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
          <h3>{title}</h3>
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
            <Button variant="primary" type="submit" form="role-characteristic-form">
              {isEditing ? 'Atualizar característica' : 'Criar característica'}
            </Button>
          </>
        )
      }
    >
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <form id="role-characteristic-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Nome {readOnly ? '' : '*'}
            <input
              value={row.name}
              disabled={readOnly}
              onChange={(event) => setRow((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: cnpj"
              className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
            />
          </label>
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Grupo
            <input
              value={row.group ?? ''}
              disabled={readOnly}
              onChange={(event) => setRow((current) => ({ ...current, group: event.target.value }))}
              placeholder="Ex.: Geral"
              className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
            />
          </label>
        </div>

        <label className="block text-[0.8rem] font-semibold text-app-text">
          Descrição
          <textarea
            rows={2}
            value={row.description ?? ''}
            disabled={readOnly}
            onChange={(event) =>
              setRow((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Descreva a finalidade desta característica no papel..."
            className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Tipo
            <select
              value={row.valueType}
              disabled={readOnly}
              onChange={(event) => {
                const valueType = event.target.value as PartyRoleCharacteristicRow['valueType'];
                setRow((current) => ({
                  ...current,
                  valueType,
                  valueText: valueType === 'boolean' ? 'false' : '',
                  hasDefaultValue: false,
                }));
              }}
              className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
            >
              {VALUE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-[0.82rem] font-medium text-app-text">
            <input
              type="checkbox"
              checked={row.mandatory}
              disabled={readOnly}
              onChange={(event) =>
                setRow((current) => ({ ...current, mandatory: event.target.checked }))
              }
              className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
            />
            Obrigatória
          </label>
        </div>

        {row.valueType === 'list' && (
          <div className="space-y-2">
            <label className="block text-[0.8rem] font-semibold text-app-text">
              Valores permitidos
              <select
                value={row.referenceDataSetKey ?? ''}
                disabled={readOnly}
                aria-label="Conjunto de referência"
                onChange={(event) =>
                  setRow((current) => ({
                    ...current,
                    referenceDataSetKey: event.target.value || null,
                  }))
                }
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
              >
                <option value="">Digitar lista inline...</option>
                {referenceDataSets.map((set) => (
                  <option key={set.key} value={set.key}>
                    Dados de referência: {set.name} ({set.key})
                  </option>
                ))}
              </select>
            </label>
            {!row.referenceDataSetKey && (
              <input
                value={row.allowedValuesText ?? ''}
                disabled={readOnly}
                onChange={(event) =>
                  setRow((current) => ({ ...current, allowedValuesText: event.target.value }))
                }
                placeholder="Valores separados por vírgula (ex.: Opção 1, Opção 2)"
                className="w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
              />
            )}
          </div>
        )}

        <div className="space-y-2 rounded-[14px] border border-app-border bg-[var(--surface-subtle)] p-3">
          <label className="flex items-center gap-2 text-[0.82rem] font-medium text-app-text">
            <input
              type="checkbox"
              checked={row.hasDefaultValue}
              disabled={readOnly}
              onChange={(event) =>
                setRow((current) => ({
                  ...current,
                  hasDefaultValue: event.target.checked,
                  valueText:
                    event.target.checked && current.valueType === 'boolean' ? 'false' : current.valueText,
                }))
              }
              className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
            />
            Definir valor padrão
          </label>
          {row.hasDefaultValue && (
            <div>
              {row.valueType === 'boolean' ? (
                <select
                  value={row.valueText}
                  disabled={readOnly}
                  onChange={(event) =>
                    setRow((current) => ({ ...current, valueText: event.target.value }))
                  }
                  className="w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                >
                  <option value="true">Sim (true)</option>
                  <option value="false">Não (false)</option>
                </select>
              ) : row.valueType === 'list' && listOptions.length > 0 ? (
                <select
                  value={row.valueText}
                  disabled={readOnly}
                  onChange={(event) =>
                    setRow((current) => ({ ...current, valueText: event.target.value }))
                  }
                  className="w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                >
                  <option value="">Selecione a opção padrão...</option>
                  {listOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={row.valueText}
                  disabled={readOnly}
                  onChange={(event) =>
                    setRow((current) => ({ ...current, valueText: event.target.value }))
                  }
                  placeholder="Valor padrão..."
                  className="w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                />
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
