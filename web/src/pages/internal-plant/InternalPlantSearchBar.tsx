import { Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import NexusMark from '../../components/NexusMark';

export const INTERNAL_PLANT_MIN_QUERY = 3;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClear: () => void;
  /** Largura em px da barra no desktop (acompanha a doca redimensionável). */
  width?: number | undefined;
  isMobile?: boolean | undefined;
  onOpenMainMenu?: (() => void) | undefined;
};

/** Barra de pesquisa de inventário: mesma moldura da barra do mapa, sem Places/geocoding. */
export function InternalPlantSearchBar({
  value,
  onChange,
  onSubmit,
  onClear,
  width,
  isMobile,
  onOpenMainMenu,
}: Props) {
  const [touched, setTouched] = useState(false);
  const term = value.trim();
  const tooShort = touched && term.length > 0 && term.length < INTERNAL_PLANT_MIN_QUERY;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (term.length >= INTERNAL_PLANT_MIN_QUERY) onSubmit(term);
  };

  return (
    <div
      className={`absolute top-3 z-30 max-w-[calc(100%-1.5rem)] ${
        isMobile ? 'left-3 right-3' : 'left-3'
      }`}
      style={!isMobile && width ? { width } : undefined}
    >
      <form
        role="search"
        onSubmit={submit}
        className="flex h-12 items-center rounded-full border border-[var(--border-input-strong)] bg-app-panel transition focus-within:border-app-accent-border"
      >
        {isMobile && onOpenMainMenu ? (
          <button
            type="button"
            onClick={onOpenMainMenu}
            className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition vt-hover-muted"
            aria-label="Abrir menu principal"
          >
            <NexusMark className="h-8 w-8" />
          </button>
        ) : null}
        <input
          id="internal-plant-search-input"
          type="search"
          value={value}
          onChange={(event) => {
            setTouched(false);
            onChange(event.target.value);
          }}
          placeholder="Pesquise um recurso"
          aria-label="Pesquisar recursos"
          autoComplete="off"
          className="h-full min-w-0 flex-1 rounded-l-full bg-transparent pl-5 pr-2 text-[16px] text-app-text placeholder:text-app-muted focus:outline-none focus-visible:shadow-none"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setTouched(false);
              onClear();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition vt-hover-muted"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <span className="mx-1 h-6 w-px bg-app-border" />
        <button
          type="submit"
          className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-app-muted transition vt-hover-muted"
          aria-label="Pesquisar"
        >
          <Search className="h-5 w-5" />
        </button>
      </form>
      {tooShort ? (
        <p
          role="alert"
          className="mt-1.5 rounded-xl border border-[var(--border-input-strong)] bg-app-panel px-3 py-1.5 text-[0.82rem] text-app-muted"
        >
          Digite ao menos {INTERNAL_PLANT_MIN_QUERY} caracteres.
        </p>
      ) : null}
    </div>
  );
}
