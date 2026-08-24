import { Plus, Trash2 } from 'lucide-react';
import {
  emptyServiceSpecCharacteristicRow,
  type ServiceSpecCharacteristicRow,
} from '../utils/serviceSpecificationForm';

const VALUE_TYPE_OPTIONS: { value: NonNullable<ServiceSpecCharacteristicRow['valueType']>; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date', label: 'Data' },
  { value: 'json', label: 'JSON / lista' },
];

/**
 * CRUD de atributos (ServiceSpecCharacteristic) de uma ServiceSpecification — duas seções
 * (negócio/técnico), cada uma com uma tabela editável. Renderizado dentro do modal de
 * ServiceCatalogTab, abaixo dos campos de Camada/Categoria/Descrição.
 */
export default function ServiceSpecificationCharacteristicsEditor({
  characteristics,
  onChange,
}: {
  characteristics: ServiceSpecCharacteristicRow[];
  onChange: (next: ServiceSpecCharacteristicRow[]) => void;
}) {
  const updateRow = (key: string, patch: Partial<ServiceSpecCharacteristicRow>) => {
    onChange(characteristics.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    onChange(characteristics.filter((row) => row.key !== key));
  };

  const addRow = (group: 'business' | 'technical') => {
    onChange([...characteristics, emptyServiceSpecCharacteristicRow(group)]);
  };

  const businessRows = characteristics.filter((row) => row.group !== 'technical');
  const technicalRows = characteristics.filter((row) => row.group === 'technical');

  return (
    <div className="md:col-span-2 grid gap-5">
      <CharacteristicSection
        title="Atributos de negócio"
        rows={businessRows}
        onUpdateRow={updateRow}
        onRemoveRow={removeRow}
        onAddRow={() => addRow('business')}
      />
      <CharacteristicSection
        title="Atributos técnicos"
        rows={technicalRows}
        onUpdateRow={updateRow}
        onRemoveRow={removeRow}
        onAddRow={() => addRow('technical')}
      />
    </div>
  );
}

function CharacteristicSection({
  title,
  rows,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
}: {
  title: string;
  rows: ServiceSpecCharacteristicRow[];
  onUpdateRow: (key: string, patch: Partial<ServiceSpecCharacteristicRow>) => void;
  onRemoveRow: (key: string) => void;
  onAddRow: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
          {title}
        </div>
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex items-center gap-1.5 rounded-xl border border-app-border px-2.5 py-1.5 text-[0.78rem] font-semibold text-app-text transition hover:bg-app-accent-soft"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar atributo
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-app-border px-3 py-2 text-[0.82rem] text-app-muted">
          Nenhum atributo cadastrado.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-app-border">
          <table className="w-full min-w-[640px] text-left text-[0.82rem]">
            <thead>
              <tr className="border-b border-app-border bg-slate-50 text-app-muted">
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Obrigatório</th>
                <th className="px-3 py-2 font-semibold">Descrição</th>
                <th className="px-3 py-2 font-semibold">Domínio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-app-border last:border-0 align-top">
                  <td className="px-3 py-2">
                    <input
                      value={row.name}
                      onChange={(event) => onUpdateRow(row.key, { name: event.target.value })}
                      className="geo-input"
                      placeholder="nome_atributo"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.valueType ?? 'string'}
                      onChange={(event) =>
                        onUpdateRow(row.key, {
                          valueType: event.target.value as ServiceSpecCharacteristicRow['valueType'],
                        })
                      }
                      className="geo-input"
                    >
                      {VALUE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.required ?? false}
                      onChange={(event) => onUpdateRow(row.key, { required: event.target.checked })}
                      className="h-4 w-4"
                      aria-label={`${row.name || 'Atributo'} é obrigatório`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.description ?? ''}
                      onChange={(event) =>
                        onUpdateRow(row.key, { description: event.target.value })
                      }
                      className="geo-input"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.valueDomain ?? ''}
                      onChange={(event) => onUpdateRow(row.key, { valueDomain: event.target.value })}
                      className="geo-input"
                      placeholder="Ex.: {a, b, c} ou 1-4094"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.key)}
                      className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                      aria-label={`Remover ${row.name || 'atributo'}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
