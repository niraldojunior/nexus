import { useState, useEffect } from 'react';
import { FileCode, AlertCircle } from 'lucide-react';
import type { ResourceType, ResourceSpecification } from '../../../services/resourceApi';
import { createResourceSpecification, updateResourceSpecification } from '../../../services/resourceApi';
import {
  buildCharacteristicPayload,
  characteristicRowsValid,
  resourceCharacteristicRowsFrom,
  specCharacteristicRowsFromType,
  type ResourceCharacteristicRow,
} from '../../../utils/resourceCharacteristicsForm';
import { Modal, Button } from '../../../components/ui';

export type ResourceSpecificationFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  editingSpec?: ResourceSpecification | null;
  readOnly?: boolean;
  onSaved?: (spec: ResourceSpecification) => void;
};

/**
 * Cria/edita/visualiza uma `ResourceSpecification` (issue #216).
 * O conjunto de características é ditado pelo `ResourceType` (via `resourceTypeCharacteristic`);
 * o editor entra travado (`lockStructure`) e só o valor é editável por especificação.
 * Em modo `readOnly`, exibe os detalhes para leitura sem permitir edição.
 */
export function ResourceSpecificationFormModal({
  isOpen,
  onClose,
  resourceType,
  editingSpec,
  readOnly = false,
  onSaved,
}: ResourceSpecificationFormModalProps) {
  const isEditing = Boolean(editingSpec) && !readOnly;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<ResourceCharacteristicRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingSpec) {
      setName(editingSpec.name);
      setDescription(editingSpec.description || '');
      setRows(
        specCharacteristicRowsFromType(
          resourceType.resourceTypeCharacteristic,
          editingSpec.resourceSpecificationCharacteristic,
        ),
      );
    } else {
      setName('');
      setDescription('');
      setRows(resourceCharacteristicRowsFrom(resourceType.resourceTypeCharacteristic));
    }
    setError(null);
  }, [isOpen, editingSpec, resourceType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('O nome da especificação é obrigatório.');
      return;
    }
    if (!characteristicRowsValid(rows)) {
      setError('Toda característica precisa de um nome.');
      return;
    }

    try {
      setSubmitting(true);
      const characteristics = buildCharacteristicPayload(rows);
      const saved =
        isEditing && editingSpec
          ? await updateResourceSpecification(editingSpec.id, {
              name: name.trim(),
              description: description.trim() || undefined,
              resourceSpecificationCharacteristic: characteristics,
            })
          : await createResourceSpecification({
              name: name.trim(),
              resourceTypeId: resourceType.id,
              description: description.trim() || undefined,
              resourceSpecificationCharacteristic: characteristics,
            });
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar especificação.');
    } finally {
      setSubmitting(false);
    }
  };

  // Agrupa as linhas por `group` (fallback "Geral"), preservando a ordem de primeira ocorrência —
  // uma seção por grupo em vez de uma tabela única (plano §9).
  const groupedRows: Array<{ group: string; rows: ResourceCharacteristicRow[] }> = [];
  for (const row of rows) {
    const groupName = row.group?.trim() || 'Geral';
    const bucket = groupedRows.find((g) => g.group === groupName);
    if (bucket) bucket.rows.push(row);
    else groupedRows.push({ group: groupName, rows: [row] });
  }

  const modalTitle = readOnly
    ? 'Detalhes da especificação'
    : isEditing
      ? 'Editar especificação'
      : 'Nova especificação';

  return (
    <Modal
      onClose={onClose}
      width={680}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-text">
            <FileCode className="h-5 w-5" />
          </div>
          <div>
            <h3>{modalTitle}</h3>
            <p className="text-[0.78rem] text-app-muted">{resourceType.name}</p>
          </div>
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
            <Button variant="primary" type="submit" form="resource-specification-form" disabled={submitting}>
              {submitting ? 'Salvando…' : isEditing ? 'Atualizar especificação' : 'Criar especificação'}
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

        <form id="resource-specification-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Nome {readOnly ? '' : '*'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              placeholder="Ex.: OLT Huawei MA5800-X7"
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
            />
          </div>

          {(!readOnly || Boolean(description.trim())) && (
            <div>
              <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                Descrição {readOnly ? '' : '(Opcional)'}
              </label>
              {readOnly ? (
                <div className="rounded-[14px] border border-app-border bg-slate-50 px-3 py-2 text-[0.84rem] text-app-text">
                  {description}
                </div>
              ) : (
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva a finalidade desta especificação..."
                  className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
                />
              )}
            </div>
          )}

          <div>
            {rows.length === 0 ? (
              <p className="rounded-[14px] border border-dashed border-app-border px-3 py-3 text-[0.82rem] text-app-muted text-center">
                Este tipo de recurso ainda não tem características definidas na aba
                "Características".
              </p>
            ) : (
              <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
                {groupedRows.map((section) => (
                  <div key={section.group}>
                    <h4 className="mb-1.5 text-[0.76rem] font-semibold uppercase tracking-wide text-app-muted">
                      {section.group}
                    </h4>
                    <div className="divide-y divide-app-border rounded-[16px] border border-app-border bg-white overflow-hidden">
                      {section.rows.map((row) => {
                        const listOptions =
                          row.valueType === 'list'
                            ? (row.allowedValuesText
                                ? row.allowedValuesText
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                : row.allowedValues) ?? []
                            : [];

                        return (
                          <div
                            key={row.key}
                            className="p-3 hover:bg-black/[0.01] transition grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-2 items-center"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-[0.84rem] text-app-text truncate">
                                {row.name}
                              </span>
                              {row.description && (
                                <p className="text-[0.78rem] text-app-muted mt-0.5 leading-snug">
                                  {row.description}
                                </p>
                              )}
                            </div>

                            <div>
                              {row.valueType === 'boolean' ? (
                                <label className={`flex items-center gap-2 select-none ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                                  <input
                                    type="checkbox"
                                    checked={row.valueText === 'true'}
                                    disabled={readOnly}
                                    onChange={(e) =>
                                      setRows((prev) =>
                                        prev.map((r) =>
                                          r.key === row.key
                                            ? { ...r, valueText: e.target.checked ? 'true' : 'false' }
                                            : r,
                                        ),
                                      )
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
                                  onChange={(e) =>
                                    setRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, valueText: e.target.value } : r,
                                      ),
                                    )
                                  }
                                  className="w-full rounded-[10px] border border-app-border bg-white px-2.5 py-1.5 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
                                >
                                  <option value="">{readOnly ? 'Não especificado' : 'Selecione uma opção...'}</option>
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
                                  onChange={(e) =>
                                    setRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, valueText: e.target.value } : r,
                                      ),
                                    )
                                  }
                                  placeholder={
                                    readOnly
                                      ? '—'
                                      : row.valueType === 'json'
                                        ? '{"chave":"valor"}'
                                        : 'Valor da característica'
                                  }
                                  className="w-full rounded-[10px] border border-app-border bg-white px-2.5 py-1.5 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-slate-50 disabled:text-app-text"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}
