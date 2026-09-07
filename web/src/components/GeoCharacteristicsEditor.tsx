import { Plus, Trash2 } from 'lucide-react';
import type { GeoCharacteristicRow } from '../utils/geoCharacteristicsForm';

const VALUE_TYPE_OPTIONS: { value: GeoCharacteristicRow['valueType']; label: string }[] = [
  { value: 'string', label: 'Texto' },
  { value: 'integer', label: 'Inteiro' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date', label: 'Data' },
  { value: 'list', label: 'Lista de opções' },
  { value: 'json', label: 'JSON livre' },
];

/**
 * CRUD de características (`GeographicSiteSpecification.specCharacteristic`) — espelha
 * `ResourceCharacteristicsEditor`, com uma coluna própria de "Obrigatório" (o vocabulário de
 * característica de local carrega essa flag como campo direto, não inferida).
 */
export default function GeoCharacteristicsEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: GeoCharacteristicRow[];
  onChange: (next: GeoCharacteristicRow[]) => void;
  disabled?: boolean;
}) {
  const updateRow = (key: string, patch: Partial<GeoCharacteristicRow>) => {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    onChange(rows.filter((row) => row.key !== key));
  };

  return (
    <div className="grid gap-2">
      {!disabled && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() =>
              onChange([
                ...rows,
                {
                  key: `new-${rows.length}-${Date.now()}`,
                  name: '',
                  valueType: 'string',
                  valueText: '',
                  mandatory: false,
                },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-app-border px-2.5 py-1.5 text-[0.78rem] font-semibold text-app-text transition hover:bg-app-accent-soft disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar característica
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-app-border px-3 py-2 text-[0.82rem] text-app-muted">
          Nenhuma característica cadastrada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[16px] border border-app-border">
          <table className="w-full min-w-[960px] text-left text-[0.82rem]">
            <thead>
              <tr className="border-b border-app-border bg-slate-50 text-app-muted">
                <th className="px-3 py-2 font-semibold min-w-[150px]">Nome</th>
                <th className="px-3 py-2 font-semibold min-w-[130px]">Tipo</th>
                <th className="px-3 py-2 font-semibold min-w-[180px]">Descrição</th>
                <th className="px-3 py-2 font-semibold min-w-[180px]">Valores da lista</th>
                <th className="px-3 py-2 font-semibold min-w-[110px]">Grupo</th>
                <th className="px-3 py-2 font-semibold min-w-[140px]">Valor padrão</th>
                <th className="px-3 py-2 font-semibold min-w-[100px]">Obrigatório</th>
                {!disabled && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
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
                  <tr key={row.key} className="border-b border-app-border last:border-0 align-top">
                    {/* Nome */}
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="font-medium text-app-text">{row.name}</span>
                      ) : (
                        <input
                          value={row.name}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                          className="geo-input"
                          placeholder="nome_caracteristica"
                        />
                      )}
                    </td>

                    {/* Tipo */}
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="text-app-muted">
                          {VALUE_TYPE_OPTIONS.find((option) => option.value === row.valueType)?.label ??
                            row.valueType}
                        </span>
                      ) : (
                        <select
                          value={row.valueType}
                          onChange={(event) => {
                            const nextType = event.target.value as GeoCharacteristicRow['valueType'];
                            updateRow(row.key, {
                              valueType: nextType,
                              valueText: nextType === 'boolean' ? 'false' : '',
                            });
                          }}
                          className="geo-input"
                        >
                          {VALUE_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="text-app-muted">{row.description || '—'}</span>
                      ) : (
                        <input
                          value={row.description ?? ''}
                          onChange={(event) => updateRow(row.key, { description: event.target.value })}
                          className="geo-input"
                          placeholder="Descrição / finalidade"
                        />
                      )}
                    </td>

                    {/* Valores da lista */}
                    <td className="px-3 py-2">
                      {row.valueType === 'list' ? (
                        disabled ? (
                          <span className="text-app-muted text-[0.78rem]">
                            {listOptions.length > 0 ? listOptions.join(', ') : '—'}
                          </span>
                        ) : (
                          <input
                            value={row.allowedValuesText ?? ''}
                            onChange={(event) =>
                              updateRow(row.key, {
                                allowedValuesText: event.target.value,
                              })
                            }
                            className="geo-input font-mono text-[0.78rem]"
                            placeholder="Opção 1, Opção 2, Opção 3..."
                          />
                        )
                      ) : (
                        <span className="text-app-muted/40 text-[0.78rem]">—</span>
                      )}
                    </td>

                    {/* Grupo */}
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="text-app-muted">{row.group || '—'}</span>
                      ) : (
                        <input
                          value={row.group ?? ''}
                          onChange={(event) => updateRow(row.key, { group: event.target.value })}
                          className="geo-input"
                          placeholder="Ex.: técnico"
                        />
                      )}
                    </td>

                    {/* Valor Padrão */}
                    <td className="px-3 py-2">
                      {disabled ? (
                        <span className="text-app-text text-[0.82rem]">
                          {row.valueType === 'boolean'
                            ? row.valueText === 'true'
                              ? 'Sim'
                              : 'Não'
                            : row.valueText || '—'}
                        </span>
                      ) : row.valueType === 'boolean' ? (
                        <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={row.valueText === 'true'}
                            onChange={(event) =>
                              updateRow(row.key, { valueText: event.target.checked ? 'true' : 'false' })
                            }
                            className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                          />
                          <span className="text-[0.8rem] text-app-text">
                            {row.valueText === 'true' ? 'Sim' : 'Não'}
                          </span>
                        </label>
                      ) : row.valueType === 'list' && listOptions.length > 0 ? (
                        <select
                          value={row.valueText}
                          onChange={(event) => updateRow(row.key, { valueText: event.target.value })}
                          className="geo-input"
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
                          type={row.valueType === 'date' ? 'date' : 'text'}
                          value={row.valueText}
                          onChange={(event) => updateRow(row.key, { valueText: event.target.value })}
                          className="geo-input"
                          placeholder={
                            row.valueType === 'json'
                              ? '{"chave":"valor"}'
                              : row.valueType === 'list'
                                ? 'Valor padrão'
                                : ''
                          }
                        />
                      )}
                    </td>

                    {/* Obrigatório */}
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.mandatory}
                        disabled={disabled}
                        onChange={(event) => updateRow(row.key, { mandatory: event.target.checked })}
                        className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent disabled:opacity-50"
                      />
                    </td>

                    {/* Ações */}
                    {!disabled && (
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft disabled:opacity-50"
                          aria-label={`Remover ${row.name || 'característica'}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
