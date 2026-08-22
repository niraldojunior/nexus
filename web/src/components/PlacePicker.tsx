import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePlaceLabel } from '../hooks/usePlaceLabel';
import { usePlaceSearch } from '../hooks/usePlaceSearch';

export type PlacePickerProps = {
  value: { id: string; '@referredType': string } | null;
  onChange: (place: { id: string; '@referredType': string } | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Combobox buscável de locais (sites + endereços).
 * Nunca permite entrada de texto livre — apenas seleção de opções encontradas na busca.
 * Mostra "Tipo · Endereço" como sublabel, não o UUID.
 */
export function PlacePicker({
  value,
  onChange,
  placeholder = 'Selecione um local…',
  disabled = false,
}: PlacePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // A opção selecionada não necessariamente aparece nos resultados da busca atual (ex.:
  // acabou de abrir o picker sem digitar nada) — resolve o rótulo dela separadamente, sob
  // demanda, em vez de depender do catálogo inteiro (issue #56).
  const { resolved: selectedLabel } = usePlaceLabel(value);
  const { options: filtered } = usePlaceSearch(search);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        className={`w-full geo-input flex items-center justify-between text-left ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {value && selectedLabel ? (
            <div>
              <div className="truncate text-[0.88rem] font-semibold text-app-text">
                {selectedLabel.name}
              </div>
              <div className="truncate text-[0.75rem] text-app-muted">
                {[selectedLabel.typeLabel, selectedLabel.address].filter(Boolean).join(' · ')}
              </div>
            </div>
          ) : (
            <span className="text-app-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-app-muted shrink-0 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 rounded-[16px] border border-app-border bg-white shadow-modal overflow-hidden">
          {/* Search input */}
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar local…"
            className="w-full geo-input border-b border-app-border rounded-none"
            autoFocus
          />

          {/* Options list */}
          <div className="max-h-[300px] overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((option) => (
                <button
                  key={`${option.referredType}::${option.id}`}
                  type="button"
                  onClick={() => {
                    onChange({
                      id: option.id,
                      '@referredType': option.referredType,
                    });
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full px-4 py-3 text-left transition flex items-start gap-3 hover:bg-app-accent-soft ${
                    value?.id === option.id ? 'bg-app-accent-soft' : ''
                  }`}
                >
                  {option.kind && (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] text-white text-[0.7rem] font-bold mt-0.5"
                      style={{
                        background:
                          option.kind === 'CTO'
                            ? '#1A9E7D'
                            : option.kind === 'PI'
                              ? '#8B7500'
                              : option.kind === 'POP'
                                ? '#004E89'
                                : option.kind === 'CO'
                                  ? '#9B59B6'
                                  : '#5A5A5A',
                      }}
                    >
                      {option.kind === 'PI'
                        ? '📍'
                        : option.kind === 'CTO'
                          ? '🔧'
                          : option.kind === 'POP'
                            ? '🌐'
                            : option.kind === 'CO'
                              ? '🏢'
                              : '📍'}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.88rem] font-semibold text-app-text">
                      {option.label}
                    </div>
                    <div className="truncate text-[0.75rem] text-app-muted">{option.sublabel}</div>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-4 text-[0.84rem] text-app-muted">
                {search.trim() ? 'Nenhum local encontrado.' : 'Digite para buscar um local…'}
              </div>
            )}
          </div>

          {/* Clear button (opcional) */}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full border-t border-app-border px-4 py-2 text-[0.84rem] text-app-muted hover:bg-app-accent-soft transition"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}
