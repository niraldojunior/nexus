import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, RefreshCw, Search, X } from 'lucide-react';
import { fetchTreeSearch, type GeoTreeNode } from '../../services/geoTreeApi';
import {
  fetchAddressPredictions,
  fetchPlaceDetails,
  geocodeAddress,
  type AddressPrediction,
  type DraftAddress,
} from '../../utils/googleMaps';
import { NodeIcon } from './HierarchyTreeView';

export type GeoSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSelectNode: (node: GeoTreeNode) => void;
  onSelectAddress: (address: DraftAddress) => void;
  // 'floating' flutua sobre o mapa (nenhum painel aberto); 'panel' vive encaixada
  // no topo da doca (hierarquia ou detalhe aberto) — mesmo padrão do Google Maps.
  variant: 'floating' | 'panel';
  isMobile?: boolean;
};

type SearchOption =
  | { type: 'node'; node: GeoTreeNode }
  | { type: 'address'; prediction: AddressPrediction };

const DEBOUNCE_MS = 250;

/**
 * Barra de pesquisa unificada da página Geo: autocomplete de locais/recursos do
 * inventário (via `fetchTreeSearch`) lado a lado com endereços (Google Places),
 * num único dropdown — estilo Google Maps. Quem decide o que fazer com a escolha
 * é o chamador (`onSelectNode` seleciona no mapa/árvore; `onSelectAddress` larga
 * o rascunho de endereço para cadastro).
 */
export function GeoSearchBar({ query, onQueryChange, onSelectNode, onSelectAddress, variant, isMobile }: GeoSearchBarProps) {
  const [open, setOpen] = useState(false);
  const [nodeResults, setNodeResults] = useState<GeoTreeNode[]>([]);
  const [addressResults, setAddressResults] = useState<AddressPrediction[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    if (!term) {
      setNodeResults([]);
      setAddressResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const token = ++requestTokenRef.current;
      void Promise.all([fetchTreeSearch(term), fetchAddressPredictions(term)]).then(([nodes, addresses]) => {
        if (requestTokenRef.current !== token) return;
        setNodeResults(nodes);
        setAddressResults(addresses);
        setHighlighted(0);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const options = useMemo<SearchOption[]>(
    () => [
      ...nodeResults.map((node): SearchOption => ({ type: 'node', node })),
      ...addressResults.map((prediction): SearchOption => ({ type: 'address', prediction })),
    ],
    [nodeResults, addressResults],
  );

  const showDropdown = open && query.trim().length > 0 && options.length > 0;

  const selectNode = (node: GeoTreeNode) => {
    onSelectNode(node);
    setOpen(false);
  };

  const selectAddress = async (prediction: AddressPrediction) => {
    setResolving(true);
    const address = await fetchPlaceDetails(prediction.placeId);
    setResolving(false);
    if (address) onSelectAddress(address);
    setOpen(false);
  };

  const selectOption = async (option: SearchOption) => {
    if (option.type === 'node') selectNode(option.node);
    else await selectAddress(option.prediction);
  };

  // Enter sem sugestão destacada cai no geocoder direto — mesmo comportamento de
  // antes de existir autocomplete, para o usuário poder só digitar e teclar Enter.
  const runFallbackAddressSearch = async () => {
    const term = query.trim();
    if (!term) return;
    setResolving(true);
    const address = await geocodeAddress(term);
    setResolving(false);
    if (address) onSelectAddress(address);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (showDropdown) setHighlighted((current) => Math.min(current + 1, options.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (showDropdown) setHighlighted((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (showDropdown && options[highlighted]) void selectOption(options[highlighted]);
      else void runFallbackAddressSearch();
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const shellClass =
    variant === 'panel'
      ? 'flex h-11 items-center rounded-xl border border-app-border bg-white transition focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/15'
      : 'flex h-12 items-center rounded-2xl border border-app-border bg-white shadow-soft transition focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/15';

  const wrapperClass =
    variant === 'panel'
      ? 'relative w-full border-b border-app-border p-3'
      : `absolute top-3 z-30 ${
          isMobile ? 'left-14 right-3' : 'left-3 w-[400px] max-w-[calc(100%-1.5rem)]'
        }`;

  return (
    <div className={wrapperClass}>
      <div className={shellClass}>
        <input
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 rounded-l-2xl bg-transparent pl-4 pr-2 text-[15px] text-app-text placeholder:text-app-muted focus:outline-none"
          placeholder="Pesquisar local, recurso ou endereço"
          id="geo-search-input"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              onQueryChange('');
              setNodeResults([]);
              setAddressResults([]);
              setOpen(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition hover:bg-black/5"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <span className="mx-1 h-6 w-px bg-app-border" />
        <button
          type="button"
          onClick={() => void runFallbackAddressSearch()}
          disabled={resolving}
          className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-[#1a73e8] transition hover:bg-[#1a73e8]/10 disabled:opacity-50"
          aria-label="Pesquisar"
        >
          {resolving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-5 w-5" />}
        </button>
      </div>

      {showDropdown ? (
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-2xl border border-app-border bg-white shadow-soft-lg"
        >
          {nodeResults.length ? (
            <div>
              <div className="px-3 pt-2 pb-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                Locais e recursos
              </div>
              {nodeResults.map((node, index) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => selectNode(node)}
                  className={optionClass(index === highlighted)}
                >
                  <NodeIcon node={node} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[0.86rem] text-app-text">{node.label}</span>
                    {node.sublabel || node.detail?.address ? (
                      <span className="block truncate text-[0.72rem] text-app-muted">
                        {[node.sublabel, node.detail?.address].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {addressResults.length ? (
            <div>
              <div className="px-3 pt-2 pb-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                Endereços
              </div>
              {addressResults.map((prediction, index) => {
                const flatIndex = nodeResults.length + index;
                return (
                  <button
                    key={prediction.placeId}
                    type="button"
                    onClick={() => void selectAddress(prediction)}
                    className={optionClass(flatIndex === highlighted)}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-app-muted" />
                    <span className="min-w-0 flex-1 truncate text-left text-[0.86rem] text-app-text">
                      {prediction.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const optionClass = (active: boolean): string =>
  `flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${active ? 'bg-app-accent-soft' : 'hover:bg-black/5'}`;
