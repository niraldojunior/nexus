import type { ReactNode } from 'react';
import Button from './Button';

/**
 * V.tal Nexus — DataTable. Porta de `docs/4-design-system/ui_kits/nexus/Inventory.jsx`.
 * Casca `.vt-card` com padding 0 envolvendo `.vt-table` (cabeçalhos sentence-case,
 * sem zebra) e uma faixa de rodapé com contagem + paginação em botões ghost.
 */
export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** className aplicado à célula <td>, ex.: para alinhamento ou largura. */
  cellClassName?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: ReactNode;
  footer?: ReactNode;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Nenhum item encontrado.',
  footer,
}: DataTableProps<T>) {
  return (
    <div className="vt-card vt-table-card" style={{ overflow: 'hidden', padding: 0 }}>
      <table className="vt-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.headerClassName}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.cellClassName}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {footer && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

/** Rodapé padrão de paginação — contagem à esquerda, Anterior/Próximo ghost à direita. */
export function DataTablePagination({
  count,
  total,
  label,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  count: number;
  total: number;
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  return (
    <>
      <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-tertiary)' }}>
        {count} de {total} {label}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant="ghost" size="sm" disabled={!hasPrevious} onClick={onPrevious}>
          Anterior
        </Button>
        <Button variant="ghost" size="sm" disabled={!hasNext} onClick={onNext}>
          Próximo
        </Button>
      </div>
    </>
  );
}
