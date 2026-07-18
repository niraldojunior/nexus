import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search } from 'lucide-react';

/**
 * Picklist de filtro ancorada no cabeçalho de uma coluna de tabela.
 *
 * Genérica por design: recebe o domínio de valores já resolvido pela página, de modo que o filtro
 * case exatamente com o texto renderizado na célula. Usada por ResourcePage e ServicePage.
 */
export default function ColumnFilterMenu({
  label,
  rect,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  onClose,
}: {
  label: string;
  rect: DOMRect;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handle = () => onClose();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [onClose]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.toLowerCase().includes(normalizedQuery))
    : options;

  const width = 268;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const top = Math.min(rect.bottom + 6, window.innerHeight - 60);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ top, left, width }}
        className="fixed z-50 flex max-h-[380px] flex-col overflow-hidden rounded-[16px] border border-app-border bg-white shadow-soft"
      >
        <div className="flex items-center justify-between gap-2 border-b border-app-border px-3 py-2">
          <span className="truncate text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {label}
          </span>
          <div className="flex shrink-0 items-center gap-2 text-[0.72rem] font-semibold">
            <button type="button" onClick={onSelectAll} className="text-app-muted transition hover:text-app-text">
              Tudo
            </button>
            <span className="text-app-border">·</span>
            <button
              type="button"
              onClick={onClear}
              disabled={selected.size === 0}
              className="text-app-muted transition hover:text-app-text disabled:opacity-40 disabled:hover:text-app-muted"
            >
              Limpar
            </button>
          </div>
        </div>

        {options.length > 8 ? (
          <div className="border-b border-app-border px-3 py-2">
            <div className="flex items-center gap-2 rounded-[10px] border border-app-border bg-white px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar valor..."
                aria-label={`Buscar valor em ${label}`}
                className="h-8 w-full bg-transparent text-[0.85rem] text-app-text outline-none placeholder:text-app-muted"
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto py-1">
          {visibleOptions.length ? (
            visibleOptions.map((option) => {
              const checked = selected.has(option);
              return (
                <button
                  key={option}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => onToggle(option)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.85rem] text-app-text transition hover:bg-app-accent-soft"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition ${
                      checked ? 'border-app-accent-border bg-app-accent' : 'border-app-border bg-white'
                    }`}
                  >
                    {checked ? <Check className="h-3 w-3 text-app-text" strokeWidth={3} aria-hidden /> : null}
                  </span>
                  <span className="truncate">{option}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-center text-[0.82rem] text-app-muted">Nenhum valor encontrado.</div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
