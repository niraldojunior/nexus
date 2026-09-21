import { useEffect, useState } from 'react';
import { AlertCircle, Boxes, Layers, Tag } from 'lucide-react';
import type { ResourceCharacteristicRow } from '../../../utils/resourceCharacteristicsForm';
import {
  emptyResourceCharacteristicRow,
  imageReferenceError,
} from '../../../utils/resourceCharacteristicsForm';
import { listReferenceDataSets, type ReferenceDataSet } from '../../../services/studioReferenceDataApi';
import { listPartyRoleTypes, type PartyRoleType } from '../../../services/partyRoleTypeApi';
import { listOrganizationsByRoleTypeIds } from '../../../services/partyApi';
import { Modal, Button } from '../../../components/ui';
import { ImageCharacteristicInput } from './ImageCharacteristicInput';

const VALUE_TYPE_OPTIONS: { value: ResourceCharacteristicRow['valueType']; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date', label: 'Data' },
  { value: 'image', label: 'Imagem' },
  { value: 'list', label: 'Lista de opções' },
  { value: 'organization', label: 'Organização' },
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
  const [availableRoleTypes, setAvailableRoleTypes] = useState<PartyRoleType[]>([]);
  const [organizationOptions, setOrganizationOptions] = useState<Array<{ id: string; name: string }>>([]);
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
    if (row.valueType === 'image') {
      const imageError = imageReferenceError(row.valueText);
      if (imageError) {
        setError(imageError);
        return;
      }
    }
    if (row.valueType === 'organization') {
      if (!row.allowedValues || row.allowedValues.length === 0) {
        setError('Selecione ao menos um papel permitido para características do tipo Organização.');
        return;
      }
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
                className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
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
                className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
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
              className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
            />
          </div>

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
                ? 'Cada recurso preenche o seu valor. O valor padrão abaixo é só a sugestão inicial.'
                : 'O valor é definido em cada especificação e vale para todos os recursos dela.'}
            </p>
            {isEditing &&
              editingRow?.characteristicLevel === 'specification' &&
              row.characteristicLevel === 'instance' && (
                <p className="mt-1 text-[0.76rem]" style={{ color: 'var(--status-red)' }}>
                  Alterar o nível descarta os valores já preenchidos nas especificações deste tipo
                  na próxima edição delas.
                </p>
              )}
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
              className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
            >
              {VALUE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
                className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
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
                  className="geo-input font-mono disabled:bg-[var(--surface-muted)] disabled:text-app-text"
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              {row.valueType === 'image'
                ? 'Valor padrão (imagem)'
                : row.characteristicLevel === 'instance'
                  ? 'Valor padrão sugerido'
                  : 'Valor padrão'}
            </label>
            {row.valueType === 'image' ? (
              <ImageCharacteristicInput
                value={row.valueText}
                disabled={readOnly}
                readOnly={readOnly}
                name={row.name}
                onChange={(nextValue) => setRow((prev) => ({ ...prev, valueText: nextValue }))}
              />
            ) : row.valueType === 'boolean' ? (
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
                className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
              >
                <option value="">Selecione um padrão...</option>
                {listOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : row.valueType === 'organization' ? (
              <select
                value={row.valueText}
                disabled={readOnly}
                onChange={(e) => setRow((prev) => ({ ...prev, valueText: e.target.value }))}
                className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
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
                onChange={(e) => setRow((prev) => ({ ...prev, valueText: e.target.value }))}
                placeholder={
                  row.valueType === 'json'
                    ? '{"chave":"valor"}'
                    : 'Valor da característica'
                }
                className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
              />
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}
