import { useEffect, useState } from 'react';
import { AlertCircle, Boxes, Layers, Tag } from 'lucide-react';
import type { GeoCharacteristicRow } from '../../../utils/geoCharacteristicsForm';
import { emptyGeoCharacteristicRow } from '../../../utils/geoCharacteristicsForm';
import {
  listReferenceDataSets,
  type ReferenceDataSet,
} from '../../../services/studioReferenceDataApi';
import { listPartyRoleTypes, type PartyRoleType } from '../../../services/partyRoleTypeApi';
import { listOrganizationsByRoleTypeIds } from '../../../services/partyApi';
import { Modal, Button } from '../../../components/ui';

const VALUE_TYPE_OPTIONS: { value: GeoCharacteristicRow['valueType']; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date', label: 'Data' },
  { value: 'list', label: 'Lista de opções' },
  { value: 'organization', label: 'Organização' },
  { value: 'json', label: 'JSON livre' },
];

export type LocationCharacteristicFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  editingRow: GeoCharacteristicRow | null;
  readOnly?: boolean;
  existingNames: string[];
  requiresMigrationDefault?: boolean;
  onSave: (row: GeoCharacteristicRow) => void;
};

export function LocationCharacteristicFormModal({
  isOpen,
  onClose,
  editingRow,
  readOnly = false,
  existingNames,
  requiresMigrationDefault = false,
  onSave,
}: LocationCharacteristicFormModalProps) {
  const isEditing = Boolean(editingRow);
  const [row, setRow] = useState<GeoCharacteristicRow>(emptyGeoCharacteristicRow());
  const [referenceDataSets, setReferenceDataSets] = useState<ReferenceDataSet[]>([]);
  const [availableRoleTypes, setAvailableRoleTypes] = useState<PartyRoleType[]>([]);
  const [organizationOptions, setOrganizationOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRow(editingRow ?? emptyGeoCharacteristicRow());
    setError(null);
  }, [isOpen, editingRow]);

  useEffect(() => {
    void listReferenceDataSets()
      .then((sets) => setReferenceDataSets(sets.filter((set) => set.active)))
      .catch(() => setReferenceDataSets([]));
    void listPartyRoleTypes()
      .then((roleTypes) => setAvailableRoleTypes(roleTypes.filter((r) => r.active)))
      .catch(() => setAvailableRoleTypes([]));
  }, []);

  useEffect(() => {
    if (row.valueType !== 'organization' || !row.allowedValues || row.allowedValues.length === 0) {
      setOrganizationOptions([]);
      return;
    }
    void listOrganizationsByRoleTypeIds(row.allowedValues)
      .then((orgs) => setOrganizationOptions(orgs))
      .catch(() => setOrganizationOptions([]));
  }, [row.valueType, row.allowedValues]);

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
    if (row.valueType === 'organization') {
      if (!row.allowedValues || row.allowedValues.length === 0) {
        setError('Selecione ao menos um papel permitido para características do tipo Organização.');
        return;
      }
    }
    if (requiresMigrationDefault && row.mandatory && !row.hasDefaultValue) {
      setError(
        'Defina um valor padrão para preencher os locais existentes sem esta característica.',
      );
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
            <Button variant="primary" type="submit" form="location-characteristic-form">
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
      <form id="location-characteristic-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Nome {readOnly ? '' : '*'}
            <input
              value={row.name}
              disabled={readOnly}
              onChange={(event) => setRow((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: capacidade_portas"
              className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
            />
          </label>
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Grupo
            <input
              value={row.group ?? ''}
              disabled={readOnly}
              onChange={(event) => setRow((current) => ({ ...current, group: event.target.value }))}
              placeholder="Ex.: Técnico"
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
            placeholder="Descreva a finalidade desta característica..."
            className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
          />
        </label>
        <div>
          <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">Nível</label>
          <div className="inline-flex rounded-xl bg-[var(--surface-muted)] p-1 gap-1">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setRow((prev) => ({ ...prev, characteristicLevel: 'specification' }))}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[0.84rem] font-medium transition disabled:cursor-default ${
                row.characteristicLevel === 'specification'
                  ? 'bg-app-panel text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <Layers className="h-4 w-4 text-sky-600" />
              Especificação
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setRow((prev) => ({ ...prev, characteristicLevel: 'instance' }))}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[0.84rem] font-medium transition disabled:cursor-default ${
                row.characteristicLevel === 'instance'
                  ? 'bg-app-panel text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <Boxes className="h-4 w-4 text-purple-600" />
              Instância
            </button>
          </div>
          <p className="mt-1.5 text-[0.78rem] text-app-muted">
            {row.characteristicLevel === 'instance'
              ? 'Cada local preenche o seu valor. O valor padrão abaixo é só a sugestão inicial.'
              : 'O valor é definido na especificação e vale para todos os locais dela.'}
          </p>
          {isEditing &&
            editingRow?.characteristicLevel === 'specification' &&
            row.characteristicLevel === 'instance' && (
              <p className="mt-1 text-[0.76rem]" style={{ color: 'var(--status-red)' }}>
                Alterar o nível descarta os valores já preenchidos nas especificações deste local na
                próxima edição delas.
              </p>
            )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Tipo
            <select
              value={row.valueType}
              disabled={readOnly}
              onChange={(event) => {
                const valueType = event.target.value as GeoCharacteristicRow['valueType'];
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
        {row.valueType === 'organization' && (
          <div className="space-y-2">
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Papéis permitidos (obrigatório selecionar ao menos um)
            </label>
            {availableRoleTypes.length === 0 ? (
              <div className="rounded-[10px] border border-app-border bg-[var(--surface-muted)] p-3 text-[0.8rem] text-app-muted">
                Nenhum papel ativo encontrado no catálogo de Studio &gt; Papéis.
              </div>
            ) : (
              <div className="space-y-1.5 rounded-[12px] border border-app-border bg-app-panel p-3 max-h-48 overflow-y-auto">
                {availableRoleTypes.map((roleType) => {
                  const selected = (row.allowedValues ?? []).includes(roleType.id);
                  return (
                    <label
                      key={roleType.id}
                      className={`flex items-center gap-2.5 rounded-[8px] p-1.5 text-[0.82rem] transition-colors ${
                        readOnly
                          ? 'cursor-default'
                          : 'cursor-pointer hover:bg-[var(--surface-muted)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={readOnly}
                        onChange={(e) => {
                          const current = row.allowedValues ?? [];
                          const next = e.target.checked
                            ? [...current, roleType.id]
                            : current.filter((id) => id !== roleType.id);
                          setRow((prev) => ({ ...prev, allowedValues: next }));
                        }}
                        className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-app-text">{roleType.label}</span>
                        <span className="ml-2 font-mono text-[0.72rem] text-app-muted">
                          ({roleType.roleName})
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
                    ...(event.target.value
                      ? { allowedValuesText: '', allowedValues: undefined }
                      : {}),
                  }))
                }
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
              >
                <option value="">Opções digitadas manualmente</option>
                {referenceDataSets.map((set) => (
                  <option key={set.key} value={set.key}>
                    {set.name}
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
                placeholder="Opção 1, Opção 2, Opção 3..."
                className="w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 font-mono text-[0.82rem] text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
              />
            )}
          </div>
        )}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[0.8rem] font-semibold text-app-text">
            <input
              type="checkbox"
              checked={row.hasDefaultValue}
              disabled={readOnly}
              onChange={(event) =>
                setRow((current) => ({
                  ...current,
                  hasDefaultValue: event.target.checked,
                  valueText:
                    event.target.checked && current.valueType === 'boolean'
                      ? current.valueText || 'false'
                      : current.valueText,
                }))
              }
              className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
            />
            Definir valor padrão
          </label>
          {row.hasDefaultValue && (
            <label className="block text-[0.8rem] font-semibold text-app-text">
              Valor padrão
              {row.valueType === 'boolean' ? (
                <span className="mt-2 flex items-center gap-2 text-[0.82rem] font-normal">
                  <input
                    type="checkbox"
                    checked={row.valueText === 'true'}
                    disabled={readOnly}
                    onChange={(event) =>
                      setRow((current) => ({
                        ...current,
                        valueText: event.target.checked ? 'true' : 'false',
                      }))
                    }
                    className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                  />
                  {row.valueText === 'true' ? 'Sim' : 'Não'}
                </span>
              ) : row.valueType === 'list' && listOptions.length > 0 ? (
                <select
                  value={row.valueText}
                  disabled={readOnly}
                  onChange={(event) =>
                    setRow((current) => ({ ...current, valueText: event.target.value }))
                  }
                  className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                >
                  <option value="">Selecione um padrão...</option>
                  {listOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : row.valueType === 'organization' ? (
                <select
                  value={row.valueText}
                  disabled={readOnly}
                  onChange={(event) =>
                    setRow((current) => ({ ...current, valueText: event.target.value }))
                  }
                  className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                >
                  <option value="">Selecione uma organização padrão...</option>
                  {organizationOptions.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
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
                  onChange={(event) =>
                    setRow((current) => ({ ...current, valueText: event.target.value }))
                  }
                  placeholder={
                    row.valueType === 'json' ? '{"chave":"valor"}' : 'Valor da característica'
                  }
                  className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                />
              )}
            </label>
          )}
          {requiresMigrationDefault && row.mandatory && (
            <p className="rounded-[10px] bg-status-amber-soft p-3 text-[0.78rem] text-app-text">
              O valor padrão será aplicado somente aos locais existentes que ainda não tenham esta
              característica.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
