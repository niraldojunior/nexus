import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  /** Classe extra na casca da tabela, para ajustes locais de tipografia. */
  className?: string;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Nenhum item encontrado.',
  footer,
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={`vt-card vt-table-card ${className ?? ''}`}
      style={{ overflow: 'hidden', padding: 0 }}
    >
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

/** Janela de páginas: primeira, última e vizinhas da atual, com reticências nos saltos. */
export function pageWindow(current: number, last: number): (number | 'gap')[] {
  const keep = new Set(
    [1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last),
  );
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push('gap');
    out.push(n);
    prev = n;
  }
  return out;
}

/** Barra de paginação (fora da tabela) — contagem à esquerda, páginas numeradas à direita. */
export function DataTablePagination({
  count,
  total,
  label,
  offset,
  pageSize,
  onOffsetChange,
}: {
  count: number;
  total: number;
  label: string;
  offset: number;
  pageSize: number;
  onOffsetChange: (offset: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.floor(offset / pageSize) + 1, last);
  const go = (page: number) => onOffsetChange((page - 1) * pageSize);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '3px 4px',
      }}
    >
      <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-tertiary)' }}>
        {count.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} {label}
      </span>
      <nav aria-label="Paginação" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Página anterior"
          title="Página anterior"
          disabled={current <= 1}
          onClick={() => go(current - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        {pageWindow(current, last).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === current ? 'secondary' : 'ghost'}
              size="sm"
              aria-current={item === current ? 'page' : undefined}
              aria-label={`Página ${item}`}
              onClick={() => go(item)}
            >
              {item.toLocaleString('pt-BR')}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={current >= last}
          onClick={() => go(current + 1)}
          aria-label="Próxima página"
          title="Próxima página"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}
