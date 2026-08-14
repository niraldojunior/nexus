import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, MapPin, RefreshCw, Search, X } from 'lucide-react';
import { fetchTreeSearch, type GeoTreeNode } from '../../services/geoTreeApi';
import {
  fetchAddressPredictions,
  geocodeAddress,
  resolveAddressByPlaceId,
  type AddressPrediction,
  type DraftAddress,
} from '../../utils/googleMaps';
import NexusMark from '../../components/NexusMark';
import { useGeoSearchHistory } from '../../hooks/useGeoSearchHistory';
import { DOCK_SEARCH_WIDTH_CLASS } from './dock';
import { HierarchyIcon } from './HierarchyIcon';
import { NodeIcon } from './HierarchyTreeView';

export type AddressSearchError = { term: string; status: string; message: string };

export type GeoSearchSelection =
  { type: 'node'; node: GeoTreeNode } | { type: 'address'; address: DraftAddress };

export type GeoSearchBarProps = {
  query: string;
  selection?: GeoSearchSelection | null;
  onEditSelection?: () => void;
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
  // Estado do painel de hierarquia — é a barra que o abre e fecha quando não há texto
  // nem seleção (ver o slot direito). `true` = hierarquia aberta (o slot mostra o X de
  // fechar); `false` = fechada (o slot mostra o ListTree de abrir).
  hierarchyOpen?: boolean;
  onToggleHierarchy?: () => void;
  // Só no mobile: a marca do Nexus no início da barra abre o menu principal do app,
  // no lugar do botão flutuante que foi removido nesta página (ver GeoPage/App).
  onOpenMainMenu?: () => void;
  isMobile?: boolean;
};

type SearchOption =
  | { type: 'node'; node: GeoTreeNode }
  | { type: 'address'; prediction: AddressPrediction }
  // Itens do histórico (campo vazio): re-selecionam pelo snapshot salvo, sem nova consulta ao
  // inventário/Google. `entryKey` permite remover a linha individualmente.
  | HistoryOption;

type HistoryOption =
  | { type: 'history-node'; node: GeoTreeNode; entryKey: string }
  | { type: 'history-address'; address: DraftAddress; entryKey: string };

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
  selection = null,
  onEditSelection,
  onQueryChange,
  onSelectNode,
  onAddressFound,
  onAddressError,
  onClear,
  hierarchyOpen = false,
  onToggleHierarchy,
  onOpenMainMenu,
  isMobile,
}: GeoSearchBarProps) {
  const [open, setOpen] = useState(false);
  const [nodeResults, setNodeResults] = useState<GeoTreeNode[]>([]);
  const [addressResults, setAddressResults] = useState<AddressPrediction[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [resolving, setResolving] = useState(false);
  // Histórico por usuário — alimenta a picklist quando o campo está vazio (estilo Google Maps).
  const { history, recordNode, recordAddress, remove, clear } = useGeoSearchHistory();
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);
  const resolutionTokenRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAfterSelectionRef = useRef(false);

  // `query` e `selection` são controladas pela página. Qualquer mudança nelas pode
  // vir da árvore, do mapa, de deep-link ou de uma limpeza externa; nesse caso,
  // uma resolução iniciada pela barra já não representa a intenção mais recente.
  useEffect(() => {
    resolutionTokenRef.current += 1;
    setResolving(false);
  }, [query, selection]);

  useEffect(() => {
    if (selection || !focusAfterSelectionRef.current) return;
    focusAfterSelectionRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [selection]);

  useEffect(() => {
    if (selection) {
      if (debounceRef.current !== undefined) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      requestTokenRef.current += 1;
      setNodeResults([]);
      setAddressResults([]);
      setOpen(false);
      return;
    }

    const term = query.trim();
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    if (!term) {
      setNodeResults([]);
      setAddressResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const token = ++requestTokenRef.current;
      // As duas fontes são independentes: `allSettled` (não `all`) garante que a falha
      // de uma — inventário indisponível ou Places sem cota/rede — não zere a outra.
      // Com `all`, qualquer rejeição derrubava o dropdown inteiro (some com locais E
      // endereços), e a picklist "parava de funcionar".
      void Promise.allSettled([fetchTreeSearch(term), fetchAddressPredictions(term)]).then(
        ([nodesResult, addressesResult]) => {
          if (requestTokenRef.current !== token) return;
          setNodeResults(nodesResult.status === 'fulfilled' ? nodesResult.value : []);
          setAddressResults(addressesResult.status === 'fulfilled' ? addressesResult.value : []);
          setHighlighted(0);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== undefined) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      requestTokenRef.current += 1;
    };
  }, [query, selection]);

  useEffect(
    () => () => {
      resolutionTokenRef.current += 1;
    },
    [],
  );

  const hasText = query.trim().length > 0;

  // Resultados de busca (com texto) e histórico (campo vazio) alimentam a MESMA lista navegável
  // por teclado — `options` é a que estiver ativa, então ↑/↓/Enter/realce funcionam nos dois
  // modos sem lógica duplicada.
  const resultOptions = useMemo<SearchOption[]>(
    () => [
      ...nodeResults.map((node): SearchOption => ({ type: 'node', node })),
      ...addressResults.map((prediction): SearchOption => ({ type: 'address', prediction })),
    ],
    [nodeResults, addressResults],
  );

  const historyOptions = useMemo<HistoryOption[]>(
    () =>
      history.flatMap((entry): HistoryOption[] => {
        if (entry.kind === 'node' && entry.node) {
          return [{ type: 'history-node', node: entry.node, entryKey: entry.entryKey }];
        }
        if (entry.kind === 'address' && entry.address) {
          return [{ type: 'history-address', address: entry.address, entryKey: entry.entryKey }];
        }
        return [];
      }),
    [history],
  );

  const options = hasText ? resultOptions : historyOptions;

  const showDropdown =
    open && !selection && (hasText ? resultOptions.length > 0 : historyOptions.length > 0);

  // Fecha e esvazia os resultados — não basta fechar (`setOpen(false)`): o balão de
  // preview do mapa (InfoWindow nativo do Google) devolve o foco ao input ao fechar,
  // o que reaciona `onFocus` abaixo. Sem limpar `nodeResults`/`addressResults`, esse
  // refoco indevido reabria a picklist com o resultado antigo da seleção já feita.
  const closeDropdown = () => {
    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
    requestTokenRef.current += 1;
    setOpen(false);
    setNodeResults([]);
    setAddressResults([]);
  };

  const cancelAddressResolution = () => {
    resolutionTokenRef.current += 1;
    setResolving(false);
  };

  const dismissKeyboard = () => {
    inputRef.current?.blur();
  };

  const editSelection = () => {
    focusAfterSelectionRef.current = true;
    closeDropdown();
    onEditSelection?.();
  };

  const selectNode = (node: GeoTreeNode) => {
    cancelAddressResolution();
    dismissKeyboard();
    onSelectNode(node);
    // Só o que passa pela barra entra no histórico; re-selecionar sobe o ranking.
    recordNode(node);
    closeDropdown();
  };

  const selectAddress = async (prediction: AddressPrediction) => {
    const token = ++resolutionTokenRef.current;
    dismissKeyboard();
    setResolving(true);
    const outcome = await resolveAddressByPlaceId(prediction.placeId);
    if (resolutionTokenRef.current !== token) return;
    setResolving(false);
    if (outcome.ok) {
      onAddressFound(outcome.address);
      recordAddress(outcome.address);
    } else
      onAddressError({
        term: prediction.description,
        status: outcome.status,
        message: outcome.message,
      });
    closeDropdown();
  };

  // Endereço vindo do histórico: já resolvido, então vai direto para o mapa/painel sem tocar o
  // Google (não gasta cota) e sobe no ranking.
  const selectHistoryAddress = (address: DraftAddress) => {
    cancelAddressResolution();
    dismissKeyboard();
    onAddressFound(address);
    recordAddress(address);
    closeDropdown();
  };

  const selectOption = async (option: SearchOption) => {
    if (option.type === 'node' || option.type === 'history-node') selectNode(option.node);
    else if (option.type === 'history-address') selectHistoryAddress(option.address);
    else await selectAddress(option.prediction);
  };

  // Enter sem sugestão destacada cai no geocoder direto — mesmo comportamento de
  // antes de existir autocomplete, para o usuário poder só digitar e teclar Enter.
  const runFallbackAddressSearch = async () => {
    const term = query.trim();
    if (!term) return;
    const token = ++resolutionTokenRef.current;
    dismissKeyboard();
    setResolving(true);
    const outcome = await geocodeAddress(term);
    if (resolutionTokenRef.current !== token) return;
    setResolving(false);
    if (outcome.ok) {
      onAddressFound(outcome.address);
      recordAddress(outcome.address);
    } else onAddressError({ term, status: outcome.status, message: outcome.message });
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

  // Instância única, sobreposta à doca e ao mapa (ver GeoPage): um estilo só, com o
  // mesmo retângulo em todos os estados. Com a lista aberta, arredonda só o topo e some
  // a borda de baixo, para caixa e sugestões virarem um componente só (estilo Google
  // Maps).
  const shellBase =
    'flex h-12 items-center border border-app-border bg-white shadow-map-control transition focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/15';
  const dropdownRadiusClass = 'rounded-b-2xl';
  const shellClass = `${shellBase} ${showDropdown ? 'rounded-t-2xl border-b-0' : 'rounded-2xl'}`;

  // Quando há texto ou seleção, o X limpa a busca (comportamento antigo). Sem nada
  // digitado nem selecionado, o slot direito vira o controle da hierarquia: um X
  // quando ela está aberta (fecha), um ListTree quando fechada (abre).
  const hasSearchToClear = Boolean(query) || Boolean(selection);
  const showClose = hasSearchToClear || hierarchyOpen;
  // A marca do Nexus (abre o menu principal) só aparece no mobile — no desktop o menu
  // fica na barra lateral persistente.
  const showMenuMark = Boolean(isMobile && onOpenMainMenu);

  const wrapperClass = `absolute top-3 max-w-[calc(100%-1.5rem)] ${
    isMobile ? 'left-3 right-3' : `left-3 ${DOCK_SEARCH_WIDTH_CLASS}`
  } ${isMobile && hierarchyOpen ? 'z-50' : 'z-30'}`;

  return (
    <div className={wrapperClass}>
      {/* Contexto de posicionamento próprio para a lista de sugestões se alinhar
          exatamente às bordas da caixa de busca. */}
      <div className="relative">
        <div className={shellClass}>
          {showMenuMark ? (
            <button
              type="button"
              onClick={onOpenMainMenu}
              className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
              aria-label="Abrir menu principal"
            >
              <NexusMark className="h-8 w-8" />
            </button>
          ) : null}
          {selection ? (
            <button
              type="button"
              onClick={editSelection}
              className={`${showMenuMark ? 'ml-1' : 'ml-2'} flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-app-accent-border bg-app-accent-soft px-2.5 py-1.5 text-left text-[0.92rem] text-app-text transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-app-focus/30`}
              aria-label={`Editar seleção ${selection.type === 'node' ? selection.node.label : selection.address.label}`}
              title={selection.type === 'node' ? selection.node.label : selection.address.label}
            >
              <span
                role="img"
                aria-label={
                  selection.type === 'address'
                    ? 'Endereço'
                    : (selection.node.sublabel ??
                      (selection.node.kind === 'site' ? 'Estação' : 'Recurso'))
                }
                className="shrink-0"
              >
                {selection.type === 'node' ? (
                  <NodeIcon node={selection.node} />
                ) : (
                  <MapPin className="h-4 w-4 text-app-muted" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {selection.type === 'node' ? selection.node.label : selection.address.label}
              </span>
            </button>
          ) : (
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                cancelAddressResolution();
                closeDropdown();
                onQueryChange(event.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                // Foco sempre abre: com texto, mostra resultados; vazio, mostra o histórico
                // (estilo Google Maps). A picklist só aparece se houver o que mostrar
                // (showDropdown).
                setOpen(true);
              }}
              onKeyDown={handleKeyDown}
              className={`h-full min-w-0 flex-1 rounded-l-2xl bg-transparent ${showMenuMark ? 'pl-2' : 'pl-4'} pr-2 text-[16px] text-app-text placeholder:text-app-muted focus:outline-none`}
              placeholder="Pesquise no Nexus"
              id="geo-search-input"
              autoComplete="off"
            />
          )}
          {showClose ? (
            <button
              type="button"
              onClick={() => {
                if (hasSearchToClear) {
                  cancelAddressResolution();
                  closeDropdown();
                  onQueryChange('');
                  // Além de limpar o texto, desseleciona: fecha o painel aberto e tira
                  // o alfinete do mapa (ver onDeselect em GeoPage). onQueryChange('')
                  // acima fica redundante quando onClear já zera a query, mas mantém a
                  // barra utilizável quando o chamador não passa onClear.
                  onClear?.();
                } else {
                  // Sem texto nem seleção, o X só fecha o painel de hierarquia (ver
                  // GeoPage) — o slot volta a mostrar o ListTree de abrir.
                  onToggleHierarchy?.();
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition hover:bg-black/5"
              aria-label={hasSearchToClear ? 'Limpar busca' : 'Fechar hierarquia'}
            >
              <X className="h-4 w-4" />
            </button>
          ) : onToggleHierarchy ? (
            // Fundo transparente (o slot fica leve, sem moldura); quem carrega a leitura é
            // o ícone próprio, colorido, de "lista em árvore" (ver HierarchyIcon).
            <button
              type="button"
              onClick={onToggleHierarchy}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-black/5"
              aria-label="Abrir hierarquia"
              title="Hierarquia"
            >
              <HierarchyIcon className="h-6 w-6" />
            </button>
          ) : null}
          <span className="mx-1 h-6 w-px bg-app-border" />
          <button
            type="button"
            onClick={() => (selection ? editSelection() : void runFallbackAddressSearch())}
            disabled={resolving}
            className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-[#1a73e8] transition hover:bg-[#1a73e8]/10 disabled:opacity-50"
            aria-label={selection ? 'Editar busca' : 'Pesquisar'}
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
            className={`absolute left-0 right-0 top-full z-40 max-h-80 overflow-y-auto border border-t-0 border-app-border bg-white shadow-map-control-lg ${dropdownRadiusClass}`}
          >
            {!hasText ? (
              <div>
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                    Recentes
                  </span>
                  <button
                    type="button"
                    onClick={clear}
                    className="text-[0.7rem] font-medium text-app-muted transition hover:text-app-text"
                  >
                    Limpar histórico
                  </button>
                </div>
                {historyOptions.map((option, index) => {
                  const label =
                    option.type === 'history-node'
                      ? option.node.label
                      : option.address.sourceQuery?.trim() || option.address.label;
                  return (
                    <div
                      key={option.entryKey}
                      className={`group flex items-center ${
                        index === highlighted ? 'bg-app-accent-soft' : 'hover:bg-black/5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void selectOption(option)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
                      >
                        {option.type === 'history-node' ? (
                          <NodeIcon node={option.node} />
                        ) : (
                          <Clock className="h-4 w-4 shrink-0 text-app-muted" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[0.86rem] text-app-text">
                          {label}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(option.entryKey)}
                        className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-app-muted transition hover:bg-black/10"
                        aria-label={`Remover ${label} do histórico`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {hasText && nodeResults.length ? (
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
