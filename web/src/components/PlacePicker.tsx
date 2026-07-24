import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { listPlaceOptions, type GeoDirectory } from '../utils/placeLabel';

export type PlacePickerProps = {
  value: { id: string; '@referredType': string } | null;
  onChange: (place: { id: string; '@referredType': string } | null) => void;
  directory: GeoDirectory | null;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Combobox buscável de locais (sites + endereços).
 * Nunca permite entrada de texto livre — apenas seleção de opções do diretório.
 * Mostra "Tipo · Endereço" como sublabel, não o UUID.
 */
export function PlacePicker({
  value,
  onChange,
  directory,
  placeholder = 'Selecione um local…',
  disabled = false,
}: PlacePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // O diretório (~dezenas de milhares de sites/endereços) só muda quando o cache do
  // useGeoDirectory recarrega — sem memo isso reconstruía e reordenava a lista inteira a cada
  // tecla digitada na busca.
  const options = useMemo(() => (directory ? listPlaceOptions(directory) : []), [directory]);
  const selectedOption = options.find((opt) => opt.id === value?.id);

  const searchLower = search.toLowerCase();
  const filtered = useMemo(
    () => options.filter((opt) => opt.search.includes(searchLower)),
    [options, searchLower],
  );

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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
          {selectedOption ? (
            <div>
              <div className="truncate text-[0.88rem] font-semibold text-app-text">
                {selectedOption.label}
              </div>
              <div className="truncate text-[0.75rem] text-app-muted">
                {selectedOption.sublabel}
              </div>
            </div>
          ) : (
            <span className="text-app-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-app-muted shrink-0 transition ${open ? 'rotate-180' : ''}`} />
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
                    selectedOption?.id === option.id ? 'bg-app-accent-soft' : ''
                  }`}
                >
                  {option.kind && (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] text-white text-[0.7rem] font-bold mt-0.5"
                      style={{
                        background:
                          option.kind === 'CTO' ? '#1A9E7D'
                          : option.kind === 'PI' ? '#8B7500'
                          : option.kind === 'POP' ? '#004E89'
                          : option.kind === 'CO' ? '#9B59B6'
                          : '#5A5A5A',
                      }}
                    >
                      {option.kind === 'PI' ? '📍'
                       : option.kind === 'CTO' ? '🔧'
                       : option.kind === 'POP' ? '🌐'
                       : option.kind === 'CO' ? '🏢'
                       : '📍'}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.88rem] font-semibold text-app-text">
                      {option.label}
                    </div>
                    <div className="truncate text-[0.75rem] text-app-muted">
                      {option.sublabel}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-4 text-[0.84rem] text-app-muted">
                Nenhum local encontrado.
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
