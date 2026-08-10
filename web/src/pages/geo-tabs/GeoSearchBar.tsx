import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, RefreshCw, Search, X } from 'lucide-react';
import { fetchTreeSearch, type GeoTreeNode } from '../../services/geoTreeApi';
import {
  fetchAddressPredictions,
  geocodeAddress,
  resolveAddressByPlaceId,
  type AddressPrediction,
  type DraftAddress,
} from '../../utils/googleMaps';
import { NodeIcon } from './HierarchyTreeView';

export type AddressSearchError = { term: string; status: string; message: string };

export type GeoSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSelectNode: (node: GeoTreeNode) => void;
  // Endereço resolvido (Enter em texto livre ou clique numa sugestão) — os dois
  // caminhos convergem para o mesmo GeocodeOutcome (ver googleMaps.ts).
  onAddressFound: (address: DraftAddress) => void;
  // Falha ao resolver o endereço (ex.: sem correspondência, API indisponível) — o
  // chamador decide como mostrar (ver modal de erro em GeoPage).
  onAddressError: (error: AddressSearchError) => void;
  // Clicar no X da caixa não só limpa o texto: é o gesto de desseleção — fecha o
  // painel aberto, tira o alfinete do mapa e devolve a hierarquia (ver onDeselect em
  // GeoPage). Sem ele, o botão só apaga o texto e os resultados. Opcional para a
  // barra funcionar isolada (testes, usos sem painel).
  onClear?: () => void;
  // 'floating' flutua sobre o mapa (nenhum painel aberto); 'panel' vive encaixada
  // no topo da doca (hierarquia ou detalhe aberto); 'overlay' fica ancorada no topo
  // de um painel, flutuando sobre o conteúdo que rola por baixo — mesmo padrão do
  // Google Maps.
  variant: 'floating' | 'panel' | 'overlay';
  isMobile?: boolean;
};

type SearchOption =
  { type: 'node'; node: GeoTreeNode } | { type: 'address'; prediction: AddressPrediction };

const DEBOUNCE_MS = 250;

/**
 * Barra de pesquisa unificada da página Geo: autocomplete de locais/recursos do
 * inventário (via `fetchTreeSearch`) lado a lado com endereços (Google Places),
 * num único dropdown — estilo Google Maps. Quem decide o que fazer com a escolha
 * é o chamador (`onSelectNode` seleciona no mapa/árvore; `onAddressFound` abre o
 * painel de consulta do endereço; `onAddressError` mostra o motivo da falha).
 */
export function GeoSearchBar({
  query,
  onQueryChange,
  onSelectNode,
  onAddressFound,
  onAddressError,
  onClear,
  variant,
  isMobile,
}: GeoSearchBarProps) {
  const [open, setOpen] = useState(false);
  const [nodeResults, setNodeResults] = useState<GeoTreeNode[]>([]);
  const [addressResults, setAddressResults] = useState<AddressPrediction[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
      void Promise.all([fetchTreeSearch(term), fetchAddressPredictions(term)]).then(
        ([nodes, addresses]) => {
          if (requestTokenRef.current !== token) return;
          setNodeResults(nodes);
          setAddressResults(addresses);
          setHighlighted(0);
        },
      );
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

  // Fecha e esvazia os resultados — não basta fechar (`setOpen(false)`): o balão de
  // preview do mapa (InfoWindow nativo do Google) devolve o foco ao input ao fechar,
  // o que reaciona `onFocus` abaixo. Sem limpar `nodeResults`/`addressResults`, esse
  // refoco indevido reabria a picklist com o resultado antigo da seleção já feita.
  const closeDropdown = () => {
    setOpen(false);
    setNodeResults([]);
    setAddressResults([]);
  };

  const dismissMobileKeyboard = () => {
    if (isMobile) inputRef.current?.blur();
  };

  const selectNode = (node: GeoTreeNode) => {
    dismissMobileKeyboard();
    onSelectNode(node);
    closeDropdown();
  };

  const selectAddress = async (prediction: AddressPrediction) => {
    dismissMobileKeyboard();
    setResolving(true);
    const outcome = await resolveAddressByPlaceId(prediction.placeId);
    setResolving(false);
    if (outcome.ok) onAddressFound(outcome.address);
    else
      onAddressError({
        term: prediction.description,
        status: outcome.status,
        message: outcome.message,
      });
    closeDropdown();
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
    dismissMobileKeyboard();
    setResolving(true);
    const outcome = await geocodeAddress(term);
    setResolving(false);
    if (outcome.ok) onAddressFound(outcome.address);
    else onAddressError({ term, status: outcome.status, message: outcome.message });
    closeDropdown();
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

  const shellBase =
    variant === 'panel'
      ? 'flex h-11 items-center border border-app-border bg-white transition focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/15'
      : 'flex h-12 items-center border border-app-border bg-white shadow-soft transition focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/15';
  // Cantos do bloco de sugestões combinam com o da caixa de busca (12px no painel,
  // 16px flutuando/sobre a foto) — com a borda de baixo da caixa e a de cima da
  // lista removidas quando aberta, os dois viram visualmente um componente só,
  // sem costura dupla nem raio de canto descasado (estilo Google Maps).
  const shellRadiusClass = variant === 'panel' ? 'rounded-xl' : 'rounded-2xl';
  const shellRadiusOpenClass = variant === 'panel' ? 'rounded-t-xl' : 'rounded-t-2xl';
  const dropdownRadiusClass = variant === 'panel' ? 'rounded-b-xl' : 'rounded-b-2xl';
  const shellClass = `${shellBase} ${showDropdown ? `${shellRadiusOpenClass} border-b-0` : shellRadiusClass}`;

  const wrapperClass =
    variant === 'panel'
      ? 'w-full border-b border-app-border p-3'
      : variant === 'overlay'
        ? 'w-full p-3'
        : `absolute top-3 z-30 ${
            isMobile ? 'left-14 right-3' : 'left-3 w-[400px] max-w-[calc(100%-1.5rem)]'
          }`;

  return (
    <div className={wrapperClass}>
      {/* Contexto de posicionamento próprio (em vez de no wrapper, que tem padding
          nas variantes 'panel'/'overlay') — garante que a lista se alinhe exatamente
          às bordas da caixa de busca, e não às do wrapper com padding. */}
      <div className="relative">
        <div className={shellClass}>
          <input
            ref={inputRef}
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
                // Além de limpar o texto, desseleciona: fecha o painel aberto e tira
                // o alfinete do mapa (ver onDeselect em GeoPage). onQueryChange('')
                // acima fica redundante quando onClear já zera a query, mas mantém a
                // barra utilizável quando o chamador não passa onClear.
                onClear?.();
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
            {resolving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </button>
        </div>

        {showDropdown ? (
          <div
            onMouseDown={(event) => event.preventDefault()}
            className={`absolute left-0 right-0 top-full z-40 max-h-80 overflow-y-auto border border-t-0 border-app-border bg-white shadow-soft-lg ${dropdownRadiusClass}`}
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
                      <span className="block truncate text-[0.86rem] text-app-text">
                        {node.label}
                      </span>
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
    </div>
  );
}

const optionClass = (active: boolean): string =>
  `flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${active ? 'bg-app-accent-soft' : 'hover:bg-black/5'}`;
