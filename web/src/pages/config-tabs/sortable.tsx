import { useState } from 'react';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';

// Ordenação por coluna, compartilhada pelas tabelas de Configurações (Projetos, Locais,
// Fornecedores, Catálogo de Recursos, Catálogo de Serviços): clique alterna asc → desc → natural
// (ordem da API), sem precisar de estado por tabela reimplementado em cada aba.
export type SortDirection = 'asc' | 'desc';
export type SortState<K extends string> = { key: K; direction: SortDirection } | null;

export function useSort<K extends string>() {
  const [sort, setSort] = useState<SortState<K>>(null);
  const onSort = (key: K) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };
  return [sort, onSort] as const;
}

export function sortedBy<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  valueOf: (row: T, key: K) => string | number,
): T[] {
  if (!sort) return rows;
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const av = valueOf(a.row, sort.key);
    const bv = valueOf(b.row, sort.key);
    const cmp =
      typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, 'pt-BR') : av < bv ? -1 : av > bv ? 1 : 0;
    return (sort.direction === 'asc' ? cmp : -cmp) || a.index - b.index;
  });
  return indexed.map((entry) => entry.row);
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: 'left' | 'center';
}) {
  const active = sort?.key === sortKey;
  const Icon = sort && sort.key === sortKey ? (sort.direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th style={{ textAlign: align === 'center' ? 'center' : 'left' }}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition ${align === 'center' ? 'mx-auto justify-center' : ''}`}
        style={{ color: active ? 'var(--text-primary)' : 'inherit' }}
      >
        {label}
        <Icon className="h-3.5 w-3.5" style={{ opacity: active ? 1 : 0.4 }} />
      </button>
    </th>
  );
}
