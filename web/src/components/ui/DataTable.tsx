import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
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
  /** Cabeçalho vira botão de ordenação (exige `sort` + `onSortChange` na tabela). */
  sortable?: boolean;
}

export type SortDirection = 'asc' | 'desc';
export interface DataTableSort {
  key: string;
  direction: SortDirection;
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
  /** Mostra linhas-esqueleto no lugar do corpo e marca a tabela como ocupada. */
  loading?: boolean;
  /** Cabeçalho fixo ao rolar; a casca passa a rolar na vertical até `maxHeight`. */
  stickyHeader?: boolean;
  maxHeight?: number | string;
  /** Ordenação controlada — a tabela só sinaliza e dispara; quem ordena é o chamador. */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
}

const SKELETON_ROWS = 5;

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Nenhum item encontrado.',
  footer,
  className,
  loading = false,
  stickyHeader = false,
  maxHeight = 480,
  sort,
  onSortChange,
}: DataTableProps<T>) {
  return (
    <div
      className={`vt-card vt-table-card ${className ?? ''}`}
      style={{
        overflow: stickyHeader ? 'auto' : 'hidden',
        padding: 0,
        maxHeight: stickyHeader ? maxHeight : undefined,
      }}
    >
      <table className="vt-table" aria-busy={loading || undefined}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.headerClassName}
                style={
                  stickyHeader
                    ? {
                        position: 'sticky',
                        top: 0,
                        zIndex: 'var(--z-sticky)',
                        background: 'var(--surface-card)',
                      }
                    : undefined
                }
                aria-sort={
                  col.sortable
                    ? sort?.key === col.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
              >
                {col.sortable && onSortChange ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-[inherit] text-[inherit] hover:text-app-text focus-visible:outline-2"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                    onClick={() =>
                      onSortChange({
                        key: col.key,
                        direction:
                          sort?.key === col.key && sort.direction === 'asc' ? 'desc' : 'asc',
                      })
                    }
                  >
                    {col.header}
                    {sort?.key !== col.key ? (
                      <ChevronsUpDown size={14} aria-hidden="true" />
                    ) : sort.direction === 'asc' ? (
                      <ArrowUp size={14} aria-hidden="true" />
                    ) : (
                      <ArrowDown size={14} aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <tr key={`skeleton-${index}`} aria-hidden="true">
                {columns.map((col) => (
                  <td key={col.key} className={col.cellClassName}>
                    <span
                      className="block animate-pulse rounded"
                      style={{ height: 12, width: '70%', background: 'var(--border)' }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
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
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={
                  onRowClick
                    ? 'group/row focus-visible:bg-app-accent-soft focus-visible:outline-none'
                    : undefined
                }
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
