import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Ban,
  Barcode,
  Boxes,
  Building,
  Building2,
  ChevronLeft,
  Cpu,
  Crosshair,
  Database,
  Factory,
  Hash,
  History,
  Info as InfoIcon,
  Loader2,
  MapPin,
  Network,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  GeoStatus,
  GeoLocation,
  GeoAddress,
  GeoSpec,
  GeoSite,
  GeoEvent,
} from '../services/geoApi';
import { getJson, postJson, patchJson } from '../services/geoApi';
import { siteKindFromSpec, siteKindLabel, formatAddress } from '../utils/placeLabel';
import {
  fetchTreeChildren,
  fetchViewportResources,
  treeNodePoint,
  treeNodeRoute,
  type GeoTreeNode,
  type MapBounds,
} from '../services/geoTreeApi';
import {
  GOOGLE_MAPS_KEY,
  loadGoogleMaps,
  reverseGeocode,
  type DraftAddress,
  type GoogleInfoWindowInstance,
  type GoogleMapInstance,
  type GoogleMapMouseEvent,
  type GoogleMarkerInstance,
  type GooglePolylineInstance,
} from '../utils/googleMaps';
import {
  mapScaleMeters,
  readGoogleScaleMeters,
  DEVICE_LOCATION_SCALE_METERS,
  RESOURCE_FOCUS_SCALE_METERS,
  SITE_FOCUS_SCALE_METERS,
  ADDRESS_FOCUS_SCALE_METERS,
  PASSIVE_INFRA_MAX_SCALE_METERS,
  MARKER_CLUSTER_MIN_SCALE_METERS,
} from '../utils/mapScale';
import { bottomInsetForOverlay, flyTo, cancelFlight, type FlyTarget } from '../utils/mapCamera';
import { useGeoTree } from '../hooks/useGeoTree';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  plantLabel,
  resourceIconFor,
  resourceIconDataUrl,
  resourcePlant,
  type ResourcePlant,
} from '../utils/resourceIcon';
import { ResourceIcon } from '../components/ResourceIcon';
import {
  selectionPinDataUrl,
  siteIconDataUrl,
  siteIconFor,
  SELECTION_PIN_ASPECT,
} from '../utils/siteIcon';
import { useNavigation } from '../hooks/useNavigation';
import {
  AddressDetailPanel,
  BASE_MAP_LAYERS,
  CoordinateStreetView,
  GeoSearchBar,
  GuidedSignupModal,
  HierarchySidebar,
  IconInfoRow,
  MapBaseLayerSelector,
  MapLocateButton,
  PanelBarButton,
  StatusBadge,
  DOCK_WIDTH_CLASS,
  type AddressSearchError,
  type DeviceLocation,
  type DropSimulation,
  type GeoSearchSelection,
} from './geo-tabs';
import {
  DROP_ACCENT,
  DROP_INK,
  DROP_LABEL_HEIGHT,
  dropLabelDataUrl,
  dropLabelWidth,
  formatDropDistance,
  pathMidpoint,
} from '../utils/dropSimulation';
import { BottomSheet, type BottomSheetSnapState } from '../components/BottomSheet';
import { OverlayScrollArea } from '../components/OverlayScrollArea';
import { StreetViewHero } from '../components/StreetViewHero';
import { streetViewTargetsForGeometry } from '../utils/streetViewTargets';
import { resourceStreetViewMarker, siteStreetViewMarker } from '../utils/streetViewMarker';
import type { StreetViewMarker } from '../utils/streetViewPanorama';
import { MarkerClusterer } from '@googlemaps/markerclusterer';

type DetailTab = 'overview' | 'subsites' | 'topology' | 'lifecycle' | 'resources';

// Conteúdo do balão flutuante de preview, ancorado no item sob o mouse (árvore
// ou mapa). É montado no GeoPage e apenas desenhado pelo painel do mapa — assim
// o painel não precisa saber o que é Local e o que é Recurso. É um cartão de
// visita somente-leitura: o clique (não o hover) é que abre o detalhe completo.
type MapBalloon = {
  // Id do nó da árvore (`site:<id>` | `resource:<id>`): identifica o alvo e
  // detecta a troca de item.
  key: string;
  point: [number, number];
  // Deslocamento em px do bico do balão em relação à coordenada, para o balão
  // pousar acima do ícone em vez de cobri-lo.
  offset: [number, number];
  iconUrl: string;
  eyebrow: string;
  title: string;
  rows: Array<[string, string]>;
};

// Alvo do painel de detalhe aberto por clique — Site ou Recurso, cada um com o
// corpo que sabe montar a partir dele (ver SiteDetailBody/ResourceDetailBody).
type DetailTarget = { kind: 'site'; site: GeoSite } | { kind: 'resource'; node: GeoTreeNode };

// Lado do ícone de equipamento no mapa, em px. Um pouco menor que o pin de site
// para o equipamento não competir com o local que o contém.
const MARKER_ICON_SIZE = 26;

// Equipamento desenha acima do pin de local: por padrão o Google Maps ordena os
// markers por latitude, e o pin do site cobriria o equipamento que mora nele.
const EQUIPMENT_MARKER_Z = 1000;

// Lado do ícone de local, um pouco maior que o de equipamento: o local é o
// contexto, o equipamento é o detalhe dentro dele.
const SITE_ICON_SIZE = 30;
const SITE_MARKER_Z = 500;

// A rota do cabo fica abaixo de todos os pins — é o fundo por onde a rede passa.
const CABLE_ROUTE_Z = 10;

// O ponto "minha localização" fica acima de tudo, inclusive do alfinete de seleção: é
// referência do usuário no mundo, não do inventário.
const USER_LOCATION_Z = 2500;

// O alfinete de seleção fica acima de tudo: precisa vencer local e recurso, que já
// crescem quando selecionados.
const SELECTION_PIN_Z = 2000;
const SELECTION_PIN_HEIGHT = 44;

// A simulação de drop (aba Viabilidade do painel de Endereço) desenha acima dos cabos
// reais — é sobreposição de estudo, tem de se destacar da planta —, mas abaixo do
// alfinete, que continua sendo o que diz "é aqui".
const DROP_SIMULATION_Z = 1500;
// Passo do pontilhado em movimento. 60 ms dá fluidez sem custar frame de mapa.
const DROP_DASH_INTERVAL_MS = 60;

// Espessura por hierarquia da planta: o feeder é o tronco, o drop é o capilar.
const CABLE_STROKE_WEIGHT: Record<string, number> = {
  BackboneCable: 5,
  DistributionCable: 3.5,
  DropCable: 2,
  Fiber: 3,
  Jumper: 2,
  PatchCord: 2,
};
const DEFAULT_CENTER = { lat: -22.9068, lng: -43.1075 };
// Aguarda a janela nativa de duplo clique antes de tratar clique simples no mapa.
const MAP_SINGLE_CLICK_DELAY_MS = 500;

// O basemap é contexto, não conteúdo: POI comercial some por inteiro e os demais
// POIs perdem o ícone (o texto fica, como referência de orientação) para não
// competirem com os pins de local, equipamento e rota de cabo do inventário.
const MAP_STYLES = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

const statusLabel: Record<GeoStatus, string> = {
  planned: 'Planejado',
  active: 'Ativo',
  suspended: 'Suspenso',
  terminated: 'Terminado',
};

const relationshipTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    fedBy: 'Alimentado por',
    feeds: 'Alimenta',
    nearby: 'Próximo de',
    contains: 'Contém',
  };
  return labels[type] || type;
};

export default function GeoPage({ onOpenMainMenu }: { onOpenMainMenu?: () => void } = {}) {
  // Hoisted para o topo: o valor inicial de `hierarchyCollapsed` depende dele — no
  // mobile a página abre com o mapa em foco (hierarquia fechada), no desktop a doca
  // já vem aberta.
  const isMobile = useIsMobile();
  const [sites, setSites] = useState<GeoSite[]>([]);
  const [specs, setSpecs] = useState<GeoSpec[]>([]);
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [draftAddress, setDraftAddress] = useState<DraftAddress | null>(null);
  // Endereço resolvido pela busca (Google) ou por clique no mapa (reverse geocode) —
  // ocupa a mesma doca dos painéis de detalhe, nunca junto com eles (ver
  // selectNode/onDeselect/openDetail, que sempre zeram um ao abrir o outro). `source`
  // decide qual marcador o mapa desenha: busca ganha o alfinete de seleção
  // (`addressPoint`), clique no mapa já tem o círculo "+" do `draftAddress` — os dois
  // juntos duplicariam o marcador na mesma coordenada (ver GoogleMapPanel).
  const [addressLookup, setAddressLookup] = useState<{
    address: DraftAddress;
    source: 'search' | 'map';
  } | null>(null);
  const [addressError, setAddressError] = useState<AddressSearchError | null>(null);
  // Drop simulado entre o endereço aberto na doca e a CDO escolhida na aba de
  // Viabilidade. Mora aqui, e não no painel, porque quem desenha é o mapa; o painel só
  // o produz e o apaga ao se desmontar (ver ViabilityTab).
  const [dropSimulation, setDropSimulation] = useState<DropSimulation | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  // Colapso da hierarquia, hoisted de HierarchySidebar: precisa viver aqui para a
  // barra de pesquisa decidir se flutua sobre o mapa ou fica dentro da doca (ver
  // dockPanelOpen), e para não mudar quando o detalhe abre/fecha por cima dela —
  // é isso que faz a hierarquia "lembrar" o estado de antes ao fechar o detalhe.
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(isMobile);
  const [query, setQuery] = useState('');
  // Resultado confirmado exibido como chip na barra. É separado de `query` para
  // distinguir texto em edição de uma seleção válida já vinculada ao mapa/painel.
  const [searchSelection, setSearchSelection] = useState<GeoSearchSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pedido de foco do mapa: para onde a câmera deve voar e com que zoom de chegada
  // (`scaleMeters: null` = voa sem mexer no zoom). É `state`, não ref, para a identidade
  // só mudar quando há pedido novo — cada troca dispara um voo (ver flyTo em GoogleMapPanel).
  const [focusRequest, setFocusRequest] = useState<FlyTarget | null>(null);
  const [mobileSheetState, setMobileSheetState] = useState<{
    panelKey: string;
    state: BottomSheetSnapState;
  } | null>(null);
  // Sinal (contador) que pede à folha mobile para encolher a peek. É incrementado quando o
  // usuário navega o mapa manualmente com um painel aberto (ver handleManualMapNavigation),
  // para liberar a visualização sem perder a seleção (issue #19).
  const [sheetMinimizeSignal, setSheetMinimizeSignal] = useState(0);
  // Nó selecionado (clique, na árvore ou no mapa) e nó sob o mouse (hover, alvo
  // do balão de preview). São dois estados independentes: o hover é passageiro
  // e não mexe na seleção nem no painel de detalhe já aberto.
  const [selectedNode, setSelectedNode] = useState<GeoTreeNode | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Infra passiva (recursos + cabos) da região visível do mapa — some acima de
  // PASSIVE_INFRA_MAX_SCALE_METERS (200 m) e é buscada por bbox, não pela árvore.
  const [viewportInfra, setViewportInfra] = useState<GeoTreeNode[]>([]);
  const [scaleMeters, setScaleMeters] = useState<number | null>(null);
  const viewportFetchTokenRef = useRef(0);
  const viewportDebounceRef = useRef<number | undefined>(undefined);
  const lastViewportKeyRef = useRef<string | null>(null);

  // Chamado pelo mapa a cada `idle` (fim de pan/zoom) com os limites e a escala atuais.
  // Debounced e deduplicado por bbox arredondado, para não disparar uma busca a cada
  // frame de arraste — só quando o usuário para de mexer no mapa.
  const handleViewportChange = useCallback((bounds: MapBounds, meters: number) => {
    setScaleMeters(meters);
    if (viewportDebounceRef.current !== undefined) {
      window.clearTimeout(viewportDebounceRef.current);
      viewportDebounceRef.current = undefined;
    }
    if (meters > PASSIVE_INFRA_MAX_SCALE_METERS) {
      lastViewportKeyRef.current = null;
      setViewportInfra([]);
      return;
    }
    const key = [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
      .map((value) => value.toFixed(4))
      .join(',');
    if (key === lastViewportKeyRef.current) return;
    viewportDebounceRef.current = window.setTimeout(() => {
      lastViewportKeyRef.current = key;
      const token = ++viewportFetchTokenRef.current;
      void fetchViewportResources(bounds)
        .then((resources) => {
          if (viewportFetchTokenRef.current === token) setViewportInfra(resources);
        })
        .catch(() => {
          if (viewportFetchTokenRef.current === token) setViewportInfra([]);
        });
    }, 250);
  }, []);

  const tree = useGeoTree();
  const { navParams, clearNav, goToResource } = useNavigation();

  // Infra passiva só entra quando a escala está em ≤ 200 m; Estações (tree.mapNodes)
  // continuam sempre visíveis, ramo aberto ou não.
  const passiveInfraVisible = scaleMeters !== null && scaleMeters <= PASSIVE_INFRA_MAX_SCALE_METERS;
  const mapNodes = useMemo(() => {
    const base = passiveInfraVisible ? [...tree.mapNodes, ...viewportInfra] : tree.mapNodes;
    // O item selecionado é imune à escala e ao viewport: recurso e cabo só existem em
    // `viewportInfra`, e sem isto afastar o mapa (ou arrastá-lo até a borda) apagaria o
    // ícone e o alfinete de quem está aberto no painel. Estação já vem sempre em
    // `tree.mapNodes`, então isto só adiciona quando o nó realmente sumiu da lista.
    if (selectedNode?.geometry && !base.some((node) => node.id === selectedNode.id)) {
      return [...base, selectedNode];
    }
    return base;
  }, [tree.mapNodes, viewportInfra, passiveInfraVisible, selectedNode]);
  // Só agrupa acima de 100 m; em ≤ 100 m cada ponto é um ícone individual. Escala ainda
  // desconhecida (antes do primeiro idle) agrupa por segurança — geralmente é vista aberta.
  const clusterMarkers = (scaleMeters ?? Infinity) > MARKER_CLUSTER_MIN_SCALE_METERS;

  const specById = useMemo(() => new Map(specs.map((item) => [item.id, item])), [specs]);
  const siteById = useMemo(() => new Map(sites.map((item) => [item.id, item])), [sites]);
  const selectedSiteId =
    selectedNode?.referredType === 'GeographicSite' ? (selectedNode.refId ?? null) : null;
  const selectedSite = selectedSiteId ? (siteById.get(selectedSiteId) ?? null) : null;
  const selectedResourceNode = selectedNode?.kind === 'resource' ? selectedNode : null;
  // Alvo do painel de detalhe — deriva da mesma seleção usada pelo mapa e pela
  // árvore, então abrir por clique ou por deep-link (navParams) é o mesmo caminho.
  const detailTarget = useMemo<DetailTarget | null>(() => {
    if (selectedSite) return { kind: 'site', site: selectedSite };
    if (selectedResourceNode) return { kind: 'resource', node: selectedResourceNode };
    return null;
  }, [selectedSite, selectedResourceNode]);
  const mobilePanelKey = !isMobile
    ? null
    : addressLookup
      ? `address:${addressLookup.address.coordinates.join(',')}`
      : detailOpen && detailTarget
        ? detailTarget.kind === 'site'
          ? `site:${detailTarget.site.id}`
          : `resource:${detailTarget.node.id}`
        : null;
  const onMobileSheetSnapChange = useCallback(
    (state: BottomSheetSnapState) => {
      if (mobilePanelKey) setMobileSheetState({ panelKey: mobilePanelKey, state });
    },
    [mobilePanelKey],
  );
  // Navegação manual do mapa (arrastar, pinça, roda, duplo clique) com um painel aberto:
  // issue #19 mantém a seleção; no mobile, encolhe a folha para peek para desobstruir o
  // mapa. No desktop não há folha, então é um no-op.
  const handleManualMapNavigation = useCallback(() => {
    if (!isMobile) return;
    setSheetMinimizeSignal((signal) => signal + 1);
  }, [isMobile]);
  const bottomSheetState =
    mobilePanelKey === null
      ? undefined
      : mobileSheetState?.panelKey === mobilePanelKey
        ? mobileSheetState.state
        : null;
  // Catálogo de locais: sites e tipos são dezenas de linhas e alimentam os modais
  // de cadastro e detalhe. O acervo pesado (endereços, geometrias e a planta
  // inteira) não vem mais por aqui — cada nó da árvore traz a sua geometria, e o
  // resto se busca por id quando o modal abre.
  const loadGeo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [siteData, specData] = await Promise.all([
        getJson<GeoSite[]>('/v1/geo/sites'),
        getJson<GeoSpec[]>('/v1/geo/site-specifications'),
      ]);
      setSites(siteData);
      setSpecs(specData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados Geo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGeo();
  }, [loadGeo]);

  useEffect(() => {
    if (!selectedSite || !detailOpen) return;
    void getJson<GeoEvent[]>(`/v1/geo/sites/${selectedSite.id}/events`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [detailOpen, selectedSite]);

  // Responder a parâmetros de navegação (ex: vindo de Recursos/Serviços)
  useEffect(() => {
    if (!navParams || navParams.page !== 'geo') return;
    if (navParams.siteId) {
      const site = sites.find((s) => s.id === navParams.siteId);
      if (site) {
        const node = siteNodeOf(site);
        setSelectedNode(node);
        setSearchSelection({ type: 'node', node });
        setAddressLookup(null);
        setDetailOpen(true);
        setQuery(site.name);
        clearNav();
      }
    }
  }, [navParams, sites, clearNav]);

  // Seleção — o mesmo caminho para o clique na árvore e no mapa. Centraliza o
  // mapa e revela o nó na hierarquia: nada nasce aberto por padrão, então é a
  // seleção que carrega e abre a cadeia de ancestrais até ele (ver revealNode).
  // Vale para folha também — um recurso sem filhos precisa aparecer selecionado na
  // árvore, mesmo sem nada para expandir abaixo. Site e Recurso também abrem o
  // painel de detalhe — dock à esquerda no desktop, bottom sheet no mobile (ver
  // GeoDetailPanel). Nós de UF/Município/grupo só navegam a árvore, não têm
  // detalhe próprio.
  const selectNode = useCallback(
    (node: GeoTreeNode, from: 'search' | 'tree' | 'map' = 'tree') => {
      setSelectedNode(node);
      setDraftAddress(null);
      setAddressLookup(null);
      const point = treeNodePoint(node);
      if (point) {
        // Clique num item já visível no mapa não pede zoom (não rouba o enquadramento
        // do usuário); busca e árvore pedem o zoom de chegada do tipo do item —
        // estação enquadra o prédio, recurso/cabo enquadra a caixa.
        const scaleMeters =
          from === 'map'
            ? null
            : node.kind === 'site'
              ? SITE_FOCUS_SCALE_METERS
              : RESOURCE_FOCUS_SCALE_METERS;
        setFocusRequest({ point, scaleMeters });
      }
      tree.revealNode(node.id, { expandSelf: node.hasChildren });
      if (node.kind === 'site' || node.kind === 'resource') {
        setDetailTab('overview');
        setDetailOpen(true);
        // Nome e identidade do item vão para a barra como seleção confirmada.
        setQuery(node.label);
        setSearchSelection({ type: 'node', node });
      } else {
        setDetailOpen(false);
        setSearchSelection(null);
      }
    },
    [tree],
  );

  // Mesma seleção, três origens — a origem só decide o zoom de chegada (ver selectNode):
  // busca e árvore aproximam até o item; clique no mapa mantém o enquadramento atual.
  const selectNodeFromSearch = useCallback(
    (node: GeoTreeNode) => selectNode(node, 'search'),
    [selectNode],
  );
  const selectNodeFromTree = useCallback(
    (node: GeoTreeNode) => selectNode(node, 'tree'),
    [selectNode],
  );
  const selectNodeFromMap = useCallback(
    (node: GeoTreeNode) => selectNode(node, 'map'),
    [selectNode],
  );

  // Desfaz a seleção por completo: tira o alfinete, fecha o detalhe e limpa a busca. É o
  // X da barra de pesquisa (onClear), o fechar do painel de Endereço e, no mobile, o
  // arrastar a folha para baixo. O clique no vazio do mapa não passa mais por aqui — ele
  // consulta o ponto (ver onMapAddressFound). A hierarquia reaparece sozinha: seu colapso
  // não é tocado por seleção/deseleção (ver selectNode).
  const onDeselect = useCallback(() => {
    setSelectedNode(null);
    setDetailOpen(false);
    setDraftAddress(null);
    setAddressLookup(null);
    setDropSimulation(null);
    // Invalida o alvo da câmera junto com a seleção. Sem isto, uma mudança posterior
    // na geometria do Bottom Sheet pode reutilizar o alvo antigo e puxar o mapa de volta.
    setFocusRequest(null);
    setMobileSheetState(null);
    setQuery('');
    setSearchSelection(null);
  }, []);

  // CDO escolhida na aba de Viabilidade: guarda o traçado para o mapa desenhar e
  // centraliza no meio dele, para a simulação nascer inteira na tela.
  const onDropSimulation = useCallback((simulation: DropSimulation | null) => {
    setDropSimulation(simulation);
    if (!simulation) return;
    const midpoint = pathMidpoint(simulation.path);
    // Centraliza no meio do traçado para a simulação nascer inteira na tela, sem mexer
    // no zoom — o usuário já está na escala da rua onde a CDO foi escolhida.
    if (midpoint) setFocusRequest({ point: midpoint, scaleMeters: null });
  }, []);

  // Endereço resolvido pela busca (Enter em texto livre ou clique numa sugestão do
  // dropdown) — os dois caminhos convergem aqui. Some qualquer seleção de nó em
  // curso (mesma doca, um painel por vez) e centraliza o mapa no ponto encontrado.
  const onAddressFound = useCallback((address: DraftAddress) => {
    setSelectedNode(null);
    setDetailOpen(false);
    setDraftAddress(null);
    setAddressError(null);
    setDropSimulation(null);
    setAddressLookup({ address, source: 'search' });
    setFocusRequest({ point: address.coordinates, scaleMeters: ADDRESS_FOCUS_SCALE_METERS });
    setQuery(address.label);
    setSearchSelection({ type: 'address', address });
  }, []);

  const onAddressError = useCallback((err: AddressSearchError) => {
    setAddressError(err);
  }, []);

  // Clique no vazio do mapa — reverse geocode do ponto, que larga o "+" de rascunho
  // (`draftAddress`, usado pelo GuidedSignupModal para cadastrar um site ali) e abre o
  // painel de endereço na doca. Consulta é seleção: some qualquer nó em curso (mesma doca,
  // um painel por vez) — é a terceira porta de troca de seleção, junto do X da busca e de
  // uma nova pesquisa. O mapa só desenha o "+" para essa origem (`source: 'map'`) — o
  // alfinete fica reservado à busca, para não duplicar marcador na mesma coordenada (ver
  // GoogleMapPanel e a prop `addressPoint`).
  const onMapAddressFound = useCallback((address: DraftAddress) => {
    setSelectedNode(null);
    setDetailOpen(false);
    setAddressError(null);
    setDraftAddress(address);
    setDropSimulation(null);
    setAddressLookup({ address, source: 'map' });
    // O ponto veio de um clique no mapa — já está à vista, então só recentraliza, sem
    // mexer no zoom. A centralização passa pelo mesmo voo dos demais focos (flyTo).
    setFocusRequest({ point: address.coordinates, scaleMeters: null });
    setQuery(address.label);
    setSearchSelection({ type: 'address', address });
  }, []);

  // Some quando o mouse sai do item; sem atraso perceptível, mas absorve o
  // instante entre uma linha da árvore e a próxima para o balão não piscar.
  const hoverTimeoutRef = useRef<number | undefined>(undefined);
  const handleHover = useCallback((node: GeoTreeNode | null) => {
    if (hoverTimeoutRef.current !== undefined) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = undefined;
    }
    if (node) {
      setHoverKey(node.geometry ? node.id : null);
    } else {
      hoverTimeoutRef.current = window.setTimeout(() => setHoverKey(null), 60);
    }
  }, []);

  const openDetail = (site: GeoSite, tab: DetailTab = 'overview') => {
    const node = siteNodeOf(site);
    setSelectedNode(node);
    setSearchSelection({ type: 'node', node });
    setAddressLookup(null);
    setDetailTab(tab);
    setDetailOpen(true);
    setQuery(site.name);
  };

  // Monta o conteúdo do balão de preview a partir do nó sob o mouse. Fica aqui,
  // e não no painel do mapa, porque é aqui que se sabe o que fazer com cada
  // tipo de item. Puro cartão de visita — tipo, endereço, status e modelo — sem
  // ação: quem abre o detalhe é o clique, não o hover.
  const balloon = useMemo<MapBalloon | null>(() => {
    const node = mapNodes.find((item) => item.id === hoverKey) ?? null;
    if (!node || !hoverKey) return null;
    // O painel de detalhe já mostra tipo/endereço/status do mesmo item — o
    // balão por cima seria redundante enquanto ele está aberto.
    if (detailOpen && selectedNode?.id === node.id) return null;
    const point = treeNodePoint(node);
    if (!point) return null;
    const status = statusLabel[(node.status as GeoStatus) ?? 'active'];

    if (node.kind === 'site') {
      const kindOfSite = siteKindFromSpec({ category: node.siteCategory, name: node.sublabel });
      const icon = siteIconFor(kindOfSite, (node.status as GeoStatus) ?? 'active');
      // O pin do local é centrado na coordenada e cresce quando selecionado.
      const pinSize = SITE_ICON_SIZE + 8;
      const rows: Array<[string, string]> = [
        ['Endereço', node.detail?.address ?? 'Sem endereço'],
        ['Status', status],
      ];
      if (node.detail?.model) rows.push(['Modelo', node.detail.model]);
      return {
        key: hoverKey,
        point,
        offset: [0, -(pinSize / 2 + 6)],
        iconUrl: siteIconDataUrl(icon, { size: 40 }),
        eyebrow: node.sublabel ?? siteKindLabel[kindOfSite],
        title: node.label,
        rows,
      };
    }

    const icon = resourceIconFor({ resourceType: node.resourceType ?? '', status: node.status });
    // Cabo não tem pin: o balão nasce sobre o traçado, sem folga de ícone.
    const isCable = Boolean(treeNodeRoute(node));
    const rows: Array<[string, string]> = [
      ['Endereço', node.detail?.address ?? 'Sem endereço'],
      ['Status', status],
    ];
    if (node.detail?.model) rows.push(['Modelo', node.detail.model]);
    return {
      key: hoverKey,
      point,
      // O ícone de equipamento é ancorado no canto inferior-esquerdo, então ele
      // fica acima e à direita da coordenada — o balão segue o ícone.
      offset: isCable ? [0, -8] : [MARKER_ICON_SIZE / 2, -(MARKER_ICON_SIZE + 4)],
      iconUrl: resourceIconDataUrl(icon, { size: 40 }),
      eyebrow: node.sublabel ?? icon.label,
      title: node.label,
      rows,
    };
  }, [detailOpen, hoverKey, selectedNode?.id, mapNodes]);

  // Esc fecha o painel de detalhe — mas só quando nenhum outro modal está
  // aberto, senão a tecla fecharia os dois de uma vez.
  useEffect(() => {
    if (!detailOpen || createOpen || typeOpen || addressError) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [addressError, createOpen, detailOpen, typeOpen]);

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-transparent flex flex-col">
      <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-[#eef2f6]">
        {error ? (
          <div className="absolute left-5 top-5 z-40 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-[0.88rem] text-red-700 shadow-soft">
            {error}
          </div>
        ) : null}

        <div className="relative flex h-full min-h-0">
          {addressLookup ? (
            <AddressDetailPanel
              isMobile={isMobile}
              address={addressLookup.address}
              onSnapChange={onMobileSheetSnapChange}
              minimizeSignal={sheetMinimizeSignal}
              onClose={onDeselect}
              onDropSimulation={onDropSimulation}
            />
          ) : detailOpen && detailTarget ? (
            <GeoDetailPanel
              isMobile={isMobile}
              target={detailTarget}
              onSnapChange={onMobileSheetSnapChange}
              minimizeSignal={sheetMinimizeSignal}
              tab={detailTab}
              sites={sites}
              specById={specById}
              siteById={siteById}
              events={events}
              onTab={setDetailTab}
              onOpenSite={(next) => openDetail(next, 'overview')}
              onOpenResource={goToResource}
              // Voltar (‹) só fecha o painel — a seleção fica de pé, então a
              // hierarquia reaparece já expandida e rolada até o nó (ver
              // HierarchyTreeView), com o alfinete ainda no mapa. Desfazer a seleção
              // por completo é o X da barra de pesquisa (onClear) e, no mobile,
              // arrastar a folha para baixo (onClose).
              onBack={() => setDetailOpen(false)}
              onClose={onDeselect}
              onChanged={async () => {
                if (!selectedSite) return;
                await loadGeo();
                const updatedEvents = await getJson<GeoEvent[]>(
                  `/v1/geo/sites/${selectedSite.id}/events`,
                ).catch(() => []);
                setEvents(updatedEvents);
              }}
              onCreateSubSite={() => {
                setDetailOpen(false);
                setCreateOpen(true);
              }}
            />
          ) : (
            <HierarchySidebar
              tree={tree}
              selectedNodeId={selectedNode?.id ?? null}
              onSelect={selectNodeFromTree}
              onHover={handleHover}
              onOpenTypes={() => setTypeOpen(true)}
              collapsed={hierarchyCollapsed}
              onCollapsedChange={setHierarchyCollapsed}
            />
          )}

          <div className="relative min-h-0 flex-1">
            <GoogleMapPanel
              nodes={mapNodes}
              selectedNode={selectedNode}
              draftAddress={draftAddress}
              addressPoint={
                addressLookup?.source === 'search' ? addressLookup.address.coordinates : null
              }
              dropSimulation={dropSimulation}
              focusRequest={focusRequest}
              bottomSheetState={bottomSheetState}
              balloon={balloon}
              onSelectNode={selectNodeFromMap}
              onHoverNode={handleHover}
              onCloseBalloon={() => handleHover(null)}
              onDraftAddress={onMapAddressFound}
              // Navegação manual do mapa (arrastar, pinça, roda, duplo clique) NÃO
              // desseleciona (issue #19); no mobile, encolhe a folha para peek (ver
              // handleManualMapNavigation). `selectionActive` diz ao mapa se há algo aberto,
              // para só encolher a folha quando faz sentido.
              onManualNavigation={handleManualMapNavigation}
              selectionActive={
                selectedNode !== null || addressLookup !== null || draftAddress !== null
              }
              onViewportChange={handleViewportChange}
              clusterMarkers={clusterMarkers}
              autoLocateOnOpen={isMobile}
            />

            {loading ? (
              <div className="absolute right-5 bottom-5 z-30 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.84rem] font-medium text-app-muted shadow-soft backdrop-blur">
                Carregando dados Geo...
              </div>
            ) : null}
          </div>

          {/* Instância única da barra de pesquisa: sobreposta à doca e ao mapa, com o
              mesmo retângulo em todos os estados (estilo Google Maps). É o único
              controle de abrir/fechar a hierarquia (ver o slot ListTree/X) — por isso
              vive aqui, irmã da doca e do mapa, e não dentro de nenhum painel. */}
          <GeoSearchBar
            isMobile={isMobile}
            query={query}
            selection={searchSelection}
            onEditSelection={() => setSearchSelection(null)}
            onQueryChange={setQuery}
            onSelectNode={selectNodeFromSearch}
            onAddressFound={onAddressFound}
            onAddressError={onAddressError}
            onClear={onDeselect}
            hierarchyOpen={!addressLookup && !(detailOpen && detailTarget) && !hierarchyCollapsed}
            onToggleHierarchy={() => setHierarchyCollapsed((collapsed) => !collapsed)}
            onOpenMainMenu={onOpenMainMenu}
          />
        </div>
      </main>

      {createOpen ? (
        <GuidedSignupModal
          draftAddress={draftAddress}
          selectedSite={selectedSite}
          specs={specs}
          sites={sites}
          specById={specById}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            setDraftAddress(null);
            await loadGeo();
          }}
        />
      ) : null}

      {typeOpen ? (
        <TypeManagementModal
          specs={specs}
          onClose={() => setTypeOpen(false)}
          onChanged={async () => {
            await loadGeo();
          }}
        />
      ) : null}

      {addressError ? (
        <Modal
          onClose={() => setAddressError(null)}
          title="Endereço não encontrado"
          eyebrow="Pesquisa"
        >
          <div className="grid gap-3">
            <p className="text-[0.9rem] leading-snug text-app-text">
              Não foi possível localizar <strong>&ldquo;{addressError.term}&rdquo;</strong>.{' '}
              {addressError.message}
            </p>
            <p className="font-mono text-[0.76rem] text-app-muted">{addressError.status}</p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

// O mapa sempre mostra todas as estações (mesmo com o ramo fechado na árvore). Infra
// passiva (recursos + cabos) vem de fora, já filtrada por escala/viewport pelo
// GeoPage — este painel só desenha o que chega em `nodes` e avisa (`onViewportChange`)
// quando a região visível ou a escala mudam, para o chamador decidir o que buscar.
export function GoogleMapPanel({
  nodes,
  selectedNode,
  draftAddress,
  addressPoint,
  dropSimulation,
  focusRequest,
  bottomSheetState,
  balloon,
  onSelectNode,
  onHoverNode,
  onCloseBalloon,
  onDraftAddress,
  onManualNavigation,
  selectionActive,
  onViewportChange,
  clusterMarkers,
  autoLocateOnOpen = false,
}: {
  nodes: GeoTreeNode[];
  // Nó selecionado inteiro (não só o id): o alfinete precisa da geometria mesmo quando o
  // nó já saiu da lista visível do mapa — recurso/cabo afastado, ou deep-link de Site que
  // ainda não virou marcador. O id é derivado abaixo, para os efeitos que só precisam dele.
  selectedNode: GeoTreeNode | null;
  draftAddress: DraftAddress | null;
  // Endereço resolvido pela busca (ver AddressDetailPanel) — cravado com o mesmo
  // alfinete de seleção, na ausência de um nó selecionado (os dois nunca coexistem,
  // ver onAddressFound/selectNode em GeoPage).
  addressPoint?: [number, number] | null;
  // Drop simulado entre o endereço e a CDO escolhida na aba de Viabilidade — estudo,
  // não planta: desenho próprio, animado, que some junto com o painel que o criou.
  dropSimulation?: DropSimulation | null;
  // Pedido de foco: para onde a câmera voa e com que zoom de chegada (ver flyTo).
  focusRequest?: FlyTarget | null;
  // `undefined` = sem painel; `null` = painel mobile montando/sem medida; objeto =
  // snap e altura estabilizados, necessários para aplicar a política de reenquadramento.
  bottomSheetState?: BottomSheetSnapState | null;
  balloon: MapBalloon | null;
  onSelectNode: (node: GeoTreeNode) => void;
  onHoverNode: (node: GeoTreeNode | null) => void;
  onCloseBalloon: () => void;
  onDraftAddress: (address: DraftAddress) => void;
  // Navegação manual do mapa com algo selecionado: mantém a seleção (issue #19) e serve
  // para o mobile encolher a folha para peek. Só é chamado quando `selectionActive`.
  onManualNavigation?: () => void;
  // Se há algo aberto (nó, endereço ou rascunho) — decide se a navegação manual encolhe
  // a folha e alimenta a invalidação do clique adiado.
  selectionActive?: boolean;
  onViewportChange: (bounds: MapBounds, scaleMeters: number) => void;
  clusterMarkers: boolean;
  // Só o mobile salta sozinho para a posição do dispositivo ao abrir (ver efeito de
  // auto-localização); no desktop o pulo fica reservado ao clique no botão.
  autoLocateOnOpen?: boolean;
}) {
  const selectedNodeId = selectedNode?.id ?? null;
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const framedFocusRequestRef = useRef<FlyTarget | null>(null);
  const framedBottomSheetStateRef = useRef<BottomSheetSnapState | undefined>(undefined);
  // Marcadores/polylines indexados por id do nó — permite reusar o mesmo objeto entre renders
  // (só atualizando ícone/posição quando algo muda) em vez de destruir e recriar tudo a cada
  // seleção, que é o que travava o mapa com muitos pontos expandidos.
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const cableRoutesRef = useRef<Map<string, GooglePolylineInstance>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const draftMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const selectionMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  // Ponto azul "minha localização", cravado quando o usuário pede a geolocalização do
  // dispositivo (ver MapLocateButton). Vive fora do fluxo de nós/seleção — não é
  // inventário, é a posição real de quem está olhando o mapa.
  const userLocationMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  // Três peças da simulação de drop: o traço sólido de base, o pontilhado que anda por
  // cima dele e a pílula com a metragem no meio do caminho.
  const dropBaseRef = useRef<GooglePolylineInstance | null>(null);
  const dropDashRef = useRef<GooglePolylineInstance | null>(null);
  const dropLabelRef = useRef<GoogleMarkerInstance | null>(null);
  const dropAnimationRef = useRef<number | undefined>(undefined);
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null);
  // Verdadeiro enquanto um voo de câmera encadeado (afasta → viaja → aproxima) está em
  // curso: o listener de `idle` ignora os `idle` intermediários do voo para não disparar
  // uma busca de infra por viewport a cada estágio (ver flyTo e o listener de idle).
  const flightActiveRef = useRef(false);
  // Reporta a região visível + escala atuais ao chamador. Guardado em ref porque é
  // chamado tanto pelo listener de `idle` (atado uma vez só) quanto pelo fim de um voo,
  // que precisa forçar uma leitura já que os `idle` do voo foram ignorados.
  const reportViewportRef = useRef<() => void>(() => {});
  // Nó fora da árvore do React: o InfoWindow do Google recebe este elemento como
  // conteúdo e o React desenha dentro dele via portal, mantendo o balão como
  // componente normal (com handlers) em vez de HTML em string.
  const balloonNode = useMemo(() => document.createElement('div'), []);
  // O balão abre/fecha por callbacks que mudam a cada render; o listener do mapa
  // é registrado uma vez só, então lê sempre a versão atual daqui.
  const closeBalloonRef = useRef(onCloseBalloon);
  // Idem para o clique nos marcadores: como eles agora são reusados entre renders (não recriados
  // a cada mudança), o listener de clique — atado uma única vez na criação — precisa ler sempre a
  // versão atual de `onSelectNode` e do nó (que pode ter sido substituído por um refetch da árvore).
  const onSelectNodeRef = useRef(onSelectNode);
  const onHoverNodeRef = useRef(onHoverNode);
  const onViewportChangeRef = useRef(onViewportChange);
  // O clique no vazio do mapa sempre consulta aquele ponto (ver listener de click);
  // o auto-locate ainda lê a seleção corrente daqui para não roubar o enquadramento.
  const selectedNodeIdRef = useRef(selectedNodeId);
  // Chamado no início de uma navegação manual com algo selecionado — o mapa lê sempre a
  // versão atual daqui (o listener é atado uma vez só).
  const onManualNavigationRef = useRef(onManualNavigation);
  const selectionActiveRef = useRef(selectionActive ?? selectedNodeId !== null);
  // Encolhe a folha uma vez por sessão de navegação; volta a false quando a seleção muda
  // ou a folha reabre acima de peek (ver efeitos abaixo).
  const manualNavigationHandledRef = useRef(false);
  const activeMapPointersRef = useRef<Set<number>>(new Set());
  const pinchNavigationHandledRef = useRef(false);
  const pendingMapClickTimerRef = useRef<number | null>(null);
  const mapClickGenerationRef = useRef(0);
  const nodeByIdRef = useRef<Map<string, GeoTreeNode>>(new Map());
  const [mapsReady, setMapsReady] = useState(false);
  const [baseLayerId, setBaseLayerId] = useState(BASE_MAP_LAYERS[0]?.id ?? 'roadmap');
  const selectedBaseLayer =
    BASE_MAP_LAYERS.find((layer) => layer.id === baseLayerId) ?? BASE_MAP_LAYERS[0];

  useEffect(() => {
    closeBalloonRef.current = onCloseBalloon;
  }, [onCloseBalloon]);

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  useEffect(() => {
    onHoverNodeRef.current = onHoverNode;
  }, [onHoverNode]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    onManualNavigationRef.current = onManualNavigation;
  }, [onManualNavigation]);

  useEffect(() => {
    selectionActiveRef.current = selectionActive ?? selectedNodeId !== null;
    if (selectionActiveRef.current) manualNavigationHandledRef.current = false;
  }, [selectedNodeId, selectionActive]);

  // Folha reaberta acima de peek (mobile): a próxima navegação manual pode encolhê-la
  // de novo. Enquanto estiver em peek, o flag permanece para não repetir o encolhimento.
  useEffect(() => {
    if (bottomSheetState && bottomSheetState.snap !== 'peek') {
      manualNavigationHandledRef.current = false;
    }
  }, [bottomSheetState]);

  const clearPendingMapClick = useCallback(() => {
    mapClickGenerationRef.current += 1;
    if (pendingMapClickTimerRef.current !== null) {
      window.clearTimeout(pendingMapClickTimerRef.current);
      pendingMapClickTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (selectionActiveRef.current) clearPendingMapClick();
  }, [selectedNodeId, selectionActive, clearPendingMapClick]);

  // Navegação manual do mapa (arrastar, pinça, roda ou duplo clique). Issue #19: a
  // seleção NÃO é desfeita — pan/zoom preservam o item aberto no painel. O que a
  // navegação faz é: cancelar um clique adiado (para o duplo clique não consultar o
  // ponto), fechar o balão de hover e interromper um voo de câmera em curso. Com algo
  // selecionado, avisa o chamador uma vez (no mobile, encolhe a folha para peek).
  const handleManualNavigation = useCallback(() => {
    clearPendingMapClick();
    closeBalloonRef.current();
    if (mapRef.current) cancelFlight(mapRef.current);
    flightActiveRef.current = false;
    if (selectionActiveRef.current && !manualNavigationHandledRef.current) {
      manualNavigationHandledRef.current = true;
      onManualNavigationRef.current?.();
    }
  }, [clearPendingMapClick]);

  useEffect(() => clearPendingMapClick, [clearPendingMapClick]);

  useEffect(() => {
    const releasePointer = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      activeMapPointersRef.current.delete(event.pointerId);
      if (activeMapPointersRef.current.size < 2) pinchNavigationHandledRef.current = false;
    };
    window.addEventListener('pointerup', releasePointer, true);
    window.addEventListener('pointercancel', releasePointer, true);
    return () => {
      window.removeEventListener('pointerup', releasePointer, true);
      window.removeEventListener('pointercancel', releasePointer, true);
      activeMapPointersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !mapEl.current) return;
    void loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        const maps = window.google?.maps;
        if (!mapEl.current || mapRef.current || !maps) return;
        mapRef.current = new maps.Map(mapEl.current, {
          center: DEFAULT_CENTER,
          zoom: 15,
          mapTypeId: selectedBaseLayer.googleMapTypeId,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          // `greedy` reserva os gestos sobre o canvas ao mapa: um dedo faz pan e dois
          // fazem pinch-to-zoom. Mantemos o renderer raster para preservar os estilos
          // inline de POI. Os controles visuais de zoom/rotação continuam ocultos para
          // preservar o botão Minha localização.
          gestureHandling: 'greedy',
          zoomControl: false,
          rotateControl: false,
          scaleControl: true,
          styles: MAP_STYLES,
        });
        mapRef.current.addListener('click', (event: GoogleMapMouseEvent) => {
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          // Clique adiado pela janela nativa de duplo clique: um `dblclick` (zoom) cancela
          // esta consulta via handleManualNavigation → clearPendingMapClick, então dar zoom
          // no vazio não troca o ponto consultado. O `generation` invalida a consulta caso a
          // seleção mude enquanto o reverse geocode estava em voo.
          clearPendingMapClick();
          const clickGeneration = mapClickGenerationRef.current;
          pendingMapClickTimerRef.current = window.setTimeout(() => {
            pendingMapClickTimerRef.current = null;
            // Clique fora de qualquer item: o balão sai. Cliques em marker ou
            // polyline não chegam aqui, então o balão só fecha no vazio do mapa.
            closeBalloonRef.current();
            // Issue #19: o clique no vazio consulta o ponto e abre o painel de Endereço,
            // substituindo qualquer seleção anterior (ver onMapAddressFound em GeoPage). É a
            // terceira porta de troca de seleção; pan e zoom não passam por aqui.
            void reverseGeocode(lat, lng)
              .catch(() => null)
              .then((address) => {
                if (mapClickGenerationRef.current !== clickGeneration) return;
                onDraftAddress(
                  address ?? {
                    street: 'Ponto selecionado no mapa',
                    city: 'Niteroi',
                    stateOrProvince: 'RJ',
                    country: 'BR',
                    coordinates: [lng, lat],
                    label: `Ponto selecionado [${lng.toFixed(5)}, ${lat.toFixed(5)}]`,
                  },
                );
              });
          }, MAP_SINGLE_CLICK_DELAY_MS);
        });
        // Pan e duplo clique só são emitidos para gesto manual. Pinça é reconhecida
        // diretamente pelos pointer events abaixo, sem observar `zoom_changed` — assim
        // voos e reenquadramentos programáticos nunca são classificados como gesto.
        mapRef.current.addListener('dragstart', handleManualNavigation);
        mapRef.current.addListener('dblclick', handleManualNavigation);
        // Reporta a região visível e a escala atual para o chamador decidir se busca
        // infra passiva por viewport (ver PASSIVE_INFRA_MAX_SCALE_METERS).
        const reportViewport = () => {
          if (!mapRef.current) return;
          const zoom = mapRef.current.getZoom();
          const bounds = mapRef.current.getBounds();
          if (zoom === undefined || zoom === null || !bounds) return;
          const center = bounds.getCenter();
          const northEast = bounds.getNorthEast();
          const southWest = bounds.getSouthWest();
          // Preferimos o valor exato da barra de escala do Google (o que o usuário vê);
          // o cálculo por zoom/lat é só fallback se o controle não for encontrado no DOM.
          const scaleMeters =
            readGoogleScaleMeters(mapEl.current) ?? mapScaleMeters(zoom, center.lat());
          onViewportChangeRef.current(
            {
              minLng: southWest.lng(),
              minLat: southWest.lat(),
              maxLng: northEast.lng(),
              maxLat: northEast.lat(),
            },
            scaleMeters,
          );
        };
        reportViewportRef.current = reportViewport;
        // `idle` dispara ao fim de todo pan/zoom (não a cada frame). Durante um voo
        // encadeado, os `idle` intermediários são ignorados — o fim do voo força uma
        // leitura única (ver o handler onFlightChange do flyTo).
        mapRef.current.addListener('idle', () => {
          if (flightActiveRef.current) return;
          reportViewport();
        });
        setMapsReady(true);
      })
      .catch(() => setMapsReady(false));
  }, [handleManualNavigation, onDraftAddress, selectedBaseLayer.googleMapTypeId]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current || !selectedBaseLayer) return;
    mapRef.current.setMapTypeId(selectedBaseLayer.googleMapTypeId);
  }, [mapsReady, selectedBaseLayer]);

  // Pins dos nós visíveis. Local é quadrado arredondado e recurso é círculo —
  // é o que deixa dizer "isto é um lugar" e "isto é um equipamento" sem legenda.
  //
  // Marcadores são reusados por id (nunca destruídos/recriados à toa) e agrupados por
  // MarkerClusterer — com dezenas de milhares de recursos, mostrar um marker por ponto sem
  // agrupamento é o que travava o mapa; selecionar um nó não recriava só ele, recriava todos.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;

    const visibleIds = new Set<string>();
    const activeMarkers: GoogleMarkerInstance[] = [];

    for (const node of nodes) {
      if (node.geometry?.type !== 'Point') continue;
      visibleIds.add(node.id);
      nodeByIdRef.current.set(node.id, node);
      const [lng, lat] = node.geometry.coordinates;
      const selected = node.id === selectedNodeId;
      const existing = markersRef.current.get(node.id);

      if (node.kind === 'site') {
        const kind = siteKindFromSpec({ category: node.siteCategory, name: node.sublabel });
        const icon = siteIconFor(kind, (node.status as GeoStatus) ?? 'active');
        // O selecionado cresce; o resto fica no tamanho base.
        const size = selected ? SITE_ICON_SIZE + 8 : SITE_ICON_SIZE;
        const iconOptions = {
          url: siteIconDataUrl(icon, { size }),
          scaledSize: new maps.Size(size, size),
          anchor: new maps.Point(size / 2, size / 2),
        };
        const zIndex = selected ? SITE_MARKER_Z + 1 : SITE_MARKER_Z;
        if (existing) {
          existing.setPosition({ lng, lat });
          existing.setIcon(iconOptions);
          existing.setZIndex(zIndex);
        } else {
          const marker = new maps.Marker({
            position: { lng, lat },
            title: `${node.label} · ${icon.label}`,
            icon: iconOptions,
            zIndex,
          });
          marker.addListener('click', () =>
            onSelectNodeRef.current(nodeByIdRef.current.get(node.id) ?? node),
          );
          marker.addListener('mouseover', () =>
            onHoverNodeRef.current(nodeByIdRef.current.get(node.id) ?? node),
          );
          marker.addListener('mouseout', () => onHoverNodeRef.current(null));
          markersRef.current.set(node.id, marker);
        }
        const markerForNode = markersRef.current.get(node.id);
        if (markerForNode) activeMarkers.push(markerForNode);
        continue;
      }

      const icon = resourceIconFor({ resourceType: node.resourceType ?? '', status: node.status });
      const size = selected ? MARKER_ICON_SIZE + 6 : MARKER_ICON_SIZE;
      const iconOptions = {
        url: resourceIconDataUrl(icon, { size }),
        scaledSize: new maps.Size(size, size),
        // Âncora no canto inferior-esquerdo: o equipamento fica acima e à
        // direita da coordenada. Um equipamento dentro de um CO compartilha a
        // coordenada exata do local, e centrado ficaria escondido atrás do pin.
        anchor: new maps.Point(0, size),
      };
      const zIndex = selected ? EQUIPMENT_MARKER_Z + 1 : EQUIPMENT_MARKER_Z;
      if (existing) {
        existing.setPosition({ lng, lat });
        existing.setIcon(iconOptions);
        existing.setZIndex(zIndex);
      } else {
        const marker = new maps.Marker({
          position: { lng, lat },
          title: `${node.label} · ${icon.label}`,
          icon: iconOptions,
          zIndex,
        });
        marker.addListener('click', () =>
          onSelectNodeRef.current(nodeByIdRef.current.get(node.id) ?? node),
        );
        marker.addListener('mouseover', () =>
          onHoverNodeRef.current(nodeByIdRef.current.get(node.id) ?? node),
        );
        marker.addListener('mouseout', () => onHoverNodeRef.current(null));
        markersRef.current.set(node.id, marker);
      }
      const markerForNode = markersRef.current.get(node.id);
      if (markerForNode) activeMarkers.push(markerForNode);
    }

    // Remove só os marcadores que saíram de vista — o resto continua vivo e é só reposicionado acima.
    for (const [id, marker] of markersRef.current) {
      if (!visibleIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
        nodeByIdRef.current.delete(id);
      }
    }

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map: mapRef.current });
    }
    if (clusterMarkers) {
      // Acima do limiar de escala: agrupa (clusters azuis). Tira qualquer marker que
      // estava direto no mapa e deixa o clusterer gerenciar a exibição.
      for (const marker of activeMarkers) marker.setMap(null);
      clustererRef.current.clearMarkers();
      clustererRef.current.addMarkers(activeMarkers);
    } else {
      // ≤ 100 m: sem agrupamento — cada ponto é um ícone individual no mapa.
      clustererRef.current.clearMarkers();
      for (const marker of activeMarkers) marker.setMap(mapRef.current);
    }
  }, [mapsReady, nodes, selectedNodeId, clusterMarkers]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !draftAddress || !maps) return;
    const [lng, lat] = draftAddress.coordinates;
    if (draftMarkerRef.current) draftMarkerRef.current.setMap(null);
    draftMarkerRef.current = new maps.Marker({
      map: mapRef.current,
      position: { lng, lat },
      title: draftAddress.label,
      label: '+',
      icon: {
        path: maps.SymbolPath.CIRCLE,
        fillColor: '#FFD200',
        fillOpacity: 1,
        strokeColor: '#243041',
        strokeWeight: 3,
        scale: 11,
      },
    });
    // Centralizar fica por conta do voo de câmera (focusRequest → flyTo abaixo): quem
    // largou este rascunho também emitiu um focusRequest para o mesmo ponto.
  }, [draftAddress, mapsReady]);

  // Voo de câmera até o item/endereço em foco (hierarquia, busca, clique no mapa ou
  // simulação de drop). `flyTo` afasta/reaproxima em saltos longos e pousa em zoom
  // inteiro; nos `idle` intermediários do voo o `flightActiveRef` bloqueia a busca por
  // viewport, e o fim do voo força uma leitura única (ver reportViewportRef).
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    if (!focusRequest) {
      framedFocusRequestRef.current = null;
      framedBottomSheetStateRef.current = bottomSheetState ?? undefined;
      return;
    }
    if (bottomSheetState === null) return;

    const previousFocus = framedFocusRequestRef.current;
    const previousSheet = framedBottomSheetStateRef.current;
    const focusChanged = previousFocus !== focusRequest;
    const currentSheet = bottomSheetState;
    let shouldFrame = focusChanged && currentSheet?.snap !== 'full';

    if (!focusChanged && currentSheet) {
      if (!previousSheet) {
        // O painel abriu para um foco já existente.
        shouldFrame = currentSheet.snap !== 'full';
      } else {
        const snapChanged = previousSheet.snap !== currentSheet.snap;
        const transitionInvolvesFull =
          previousSheet.snap === 'full' || currentSheet.snap === 'full';
        const resizedAtFramableSnap =
          !snapChanged &&
          currentSheet.snap !== 'full' &&
          previousSheet.heightPx !== currentSheet.heightPx;
        shouldFrame = (snapChanged && !transitionInvolvesFull) || resizedAtFramableSnap;
      }
    }

    // Atualiza a memória mesmo quando a política decide não voar (ex.: full → mid),
    // para a próxima transição ser classificada a partir do estado realmente visível.
    framedFocusRequestRef.current = focusRequest;
    framedBottomSheetStateRef.current = currentSheet;
    if (!shouldFrame) return;

    const bottomSheetHeightPx = currentSheet?.heightPx;
    const bottomInsetPx =
      bottomSheetHeightPx === undefined
        ? 0
        : bottomInsetForOverlay(
            mapRef.current.getDiv().getBoundingClientRect(),
            bottomSheetHeightPx,
            window.innerHeight,
          );
    flyTo(mapRef.current, focusRequest, {
      bottomInsetPx,
      onFlightChange: (active) => {
        flightActiveRef.current = active;
        if (!active) reportViewportRef.current();
      },
    });
  }, [bottomSheetState, focusRequest, mapsReady]);

  // Cancela qualquer voo em curso no desmonte, para os timers do encadeamento não
  // dispararem sobre um mapa já descartado.
  useEffect(
    () => () => {
      if (mapRef.current) cancelFlight(mapRef.current);
    },
    [],
  );

  // Alfinete do item selecionado — marca sem ambiguidade o que foi clicado por
  // último (árvore, mapa ou busca), distinto do "+" de rascunho e do pin do
  // Google. `clickable: false` deixa o clique passar para o marker do próprio
  // objeto por baixo (reseleção idempotente) em vez de o alfinete capturá-lo. Na
  // ausência de nó selecionado, cai para `addressPoint` — o endereço encontrado pela
  // busca ganha o mesmo alfinete, sem ícone próprio de local/recurso por baixo.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;
    // Prefere o nó do registro do mapa (versão mais fresca, vinda do último refetch da
    // árvore) e cai para a própria seleção quando ele já não está no mapa — recurso/cabo
    // afastado além do viewport, ou deep-link de Site que ainda não virou marcador. Sem
    // esse fallback, mexer no mapa apagava o alfinete de quem continua aberto no painel.
    const node =
      (selectedNodeId ? nodeByIdRef.current.get(selectedNodeId) : undefined) ?? selectedNode;
    const point = node ? treeNodePoint(node) : (addressPoint ?? null);
    if (!point) {
      selectionMarkerRef.current?.setMap(null);
      selectionMarkerRef.current = null;
      return;
    }
    const [lng, lat] = point;
    const width = Math.round(SELECTION_PIN_HEIGHT * SELECTION_PIN_ASPECT);
    // O ícone de equipamento é ancorado no canto inferior-esquerdo, não no centro (ver o
    // efeito de marcadores acima) — sem essa mesma correção, a ponta do alfinete cairia
    // no canto do ícone em vez do seu centro visual. Local não precisa: seu ícone já é
    // centrado na coordenada, então a ponta cai certa sem ajuste.
    const isPointResource = node?.kind === 'resource' && node.geometry?.type === 'Point';
    const resourceSize = MARKER_ICON_SIZE + 6; // tamanho do ícone quando selecionado
    const anchor = isPointResource
      ? new maps.Point(width / 2 - resourceSize / 2, SELECTION_PIN_HEIGHT + resourceSize / 2)
      : new maps.Point(width / 2, SELECTION_PIN_HEIGHT);
    const iconOptions = {
      url: selectionPinDataUrl(SELECTION_PIN_HEIGHT),
      scaledSize: new maps.Size(width, SELECTION_PIN_HEIGHT),
      anchor,
    };
    if (selectionMarkerRef.current) {
      selectionMarkerRef.current.setPosition({ lng, lat });
      selectionMarkerRef.current.setIcon(iconOptions);
    } else {
      selectionMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        position: { lng, lat },
        icon: iconOptions,
        zIndex: SELECTION_PIN_Z,
        clickable: false,
      });
    }
  }, [mapsReady, selectedNodeId, selectedNode, nodes, addressPoint]);

  // Rota dos cabos. Um cabo não é um ponto: sua geometria é uma LineString com o traçado real na
  // rua, então vira polyline em vez de pin. Reusada por id pelo mesmo motivo dos marcadores.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;

    const visibleIds = new Set<string>();

    for (const node of nodes) {
      const route = treeNodeRoute(node);
      if (!route) continue;
      visibleIds.add(node.id);
      nodeByIdRef.current.set(node.id, node);
      const icon = resourceIconFor({ resourceType: node.resourceType ?? '', status: node.status });
      const path = route.map(([lng, lat]) => ({ lng, lat }));
      const existing = cableRoutesRef.current.get(node.id);

      if (existing) {
        existing.setPath(path);
        existing.setOptions({
          strokeColor: icon.color,
          strokeWeight: CABLE_STROKE_WEIGHT[icon.code] ?? 2.5,
        });
        continue;
      }

      const line = new maps.Polyline({
        map: mapRef.current,
        path,
        strokeColor: icon.color,
        strokeOpacity: 0.9,
        strokeWeight: CABLE_STROKE_WEIGHT[icon.code] ?? 2.5,
        zIndex: CABLE_ROUTE_Z,
      });
      line.addListener('click', () =>
        onSelectNodeRef.current(nodeByIdRef.current.get(node.id) ?? node),
      );
      line.addListener('mouseover', () =>
        onHoverNodeRef.current(nodeByIdRef.current.get(node.id) ?? node),
      );
      line.addListener('mouseout', () => onHoverNodeRef.current(null));
      cableRoutesRef.current.set(node.id, line);
    }

    for (const [id, line] of cableRoutesRef.current) {
      if (!visibleIds.has(id)) {
        line.setMap(null);
        cableRoutesRef.current.delete(id);
      }
    }
  }, [mapsReady, nodes]);

  // Simulação do drop: o traçado entre o endereço e a CDO escolhida na aba de
  // Viabilidade. Não é planta — é um estudo do que *seria* o cabo —, então tem desenho
  // próprio (casing escuro + pontilhado amarelo em movimento, o par de acento do design
  // system) em vez da cor/espessura de cabo do inventário, e some junto com o painel.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;

    const stopAnimation = () => {
      if (dropAnimationRef.current !== undefined) {
        window.clearInterval(dropAnimationRef.current);
        dropAnimationRef.current = undefined;
      }
    };

    if (!dropSimulation || dropSimulation.path.length < 2) {
      stopAnimation();
      dropBaseRef.current?.setMap(null);
      dropDashRef.current?.setMap(null);
      dropLabelRef.current?.setMap(null);
      dropBaseRef.current = null;
      dropDashRef.current = null;
      dropLabelRef.current = null;
      return;
    }

    const path = dropSimulation.path.map(([lng, lat]) => ({ lng, lat }));

    // Um traço com `strokeOpacity` a zero e ícones repetidos é como o Google Maps faz
    // linha tracejada: o "tracinho" é o próprio símbolo, repetido a cada 14 px.
    const dashIcons = (offsetPercent: number) => [
      {
        icon: {
          path: 'M 0,-1 0,1',
          strokeColor: DROP_ACCENT,
          strokeOpacity: 1,
          strokeWeight: 4,
          scale: 3.5,
        },
        offset: `${offsetPercent}%`,
        repeat: '14px',
      },
    ];

    if (dropBaseRef.current) {
      dropBaseRef.current.setPath(path);
      dropBaseRef.current.setMap(mapRef.current);
    } else {
      dropBaseRef.current = new maps.Polyline({
        map: mapRef.current,
        path,
        strokeColor: DROP_INK,
        strokeOpacity: 0.85,
        strokeWeight: 5,
        zIndex: DROP_SIMULATION_Z,
        clickable: false,
      });
    }

    if (dropDashRef.current) {
      dropDashRef.current.setPath(path);
      dropDashRef.current.setOptions({ icons: dashIcons(0) });
      dropDashRef.current.setMap(mapRef.current);
    } else {
      dropDashRef.current = new maps.Polyline({
        map: mapRef.current,
        path,
        strokeOpacity: 0,
        zIndex: DROP_SIMULATION_Z + 1,
        clickable: false,
        icons: dashIcons(0),
      });
    }

    // Metragem em cima da própria geometria. `≈` quando o traçado é o segmento direto
    // (a Routes API não devolveu rota a pé) — a distância ali não é de caminho real.
    const midpoint = pathMidpoint(dropSimulation.path);
    if (midpoint) {
      const text = `${dropSimulation.approximate ? '≈ ' : ''}${formatDropDistance(dropSimulation.distanceMeters)}`;
      const width = dropLabelWidth(text);
      const labelIcon = {
        url: dropLabelDataUrl(text),
        scaledSize: new maps.Size(width, DROP_LABEL_HEIGHT),
        anchor: new maps.Point(width / 2, DROP_LABEL_HEIGHT / 2),
      };
      const position = { lng: midpoint[0], lat: midpoint[1] };
      if (dropLabelRef.current) {
        dropLabelRef.current.setPosition(position);
        dropLabelRef.current.setIcon(labelIcon);
        dropLabelRef.current.setMap(mapRef.current);
      } else {
        dropLabelRef.current = new maps.Marker({
          map: mapRef.current,
          position,
          icon: labelIcon,
          zIndex: DROP_SIMULATION_Z + 2,
          clickable: false,
        });
      }
    }

    // O pontilhado anda do endereço para a CDO. Quem pediu menos movimento no sistema
    // operacional fica com o tracejado parado — a informação é a mesma.
    stopAnimation();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!reduceMotion) {
      let offset = 0;
      dropAnimationRef.current = window.setInterval(() => {
        offset = (offset + 2) % 100;
        dropDashRef.current?.setOptions({ icons: dashIcons(offset) });
      }, DROP_DASH_INTERVAL_MS);
    }

    return stopAnimation;
  }, [dropSimulation, mapsReady]);

  // Balão de preview ancorado no item sob o mouse. Usa o InfoWindow nativo — é o
  // que dá o bico apontando pro pin e o auto-pan quando ele nasce fora da tela.
  // Sem cabeçalho/X: é um balão temporário que fecha sozinho no mouse-out, então
  // o botão de fechar do Google seria redundante (o CSS em index.css cobre
  // versões da API que ainda desenham o botão apesar de headerDisabled).
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;
    if (!infoWindowRef.current) {
      infoWindowRef.current = new maps.InfoWindow({
        headerDisabled: true,
        disableAutoPan: true,
      });
    }
    const infoWindow = infoWindowRef.current;

    if (!balloon) {
      infoWindow.close();
      return;
    }

    const [lng, lat] = balloon.point;
    infoWindow.setContent(balloonNode);
    infoWindow.setOptions({
      pixelOffset: new maps.Size(balloon.offset[0], balloon.offset[1]),
    });
    infoWindow.setPosition({ lng, lat });
    infoWindow.open({ map: mapRef.current });
  }, [balloon, balloonNode, mapsReady]);

  useEffect(() => () => infoWindowRef.current?.close(), []);
  useEffect(
    () => () => {
      userLocationMarkerRef.current?.setMap(null);
      userLocationMarkerRef.current = null;
    },
    [],
  );

  // Geolocalização do dispositivo (ver MapLocateButton): salta o mapa para a posição real
  // do usuário com zoom de rua (~DEVICE_LOCATION_SCALE_METERS na barra de escala) e crava
  // o ponto azul de "minha localização", distinto dos pins de inventário e do alfinete.
  const handleDeviceLocate = useCallback(
    ({ lat, lng }: DeviceLocation) => {
      const maps = window.google?.maps;
      if (!mapsReady || !mapRef.current || !maps) return;
      // Voa até a posição (afasta/reaproxima se longe) e pousa em zoom de rua INTEIRO —
      // era o `setZoom` fracionário direto que inflava os marcadores e borrava os tiles.
      flyTo(
        mapRef.current,
        { point: [lng, lat], scaleMeters: DEVICE_LOCATION_SCALE_METERS },
        {
          onFlightChange: (active) => {
            flightActiveRef.current = active;
            if (!active) reportViewportRef.current();
          },
        },
      );
      const dotIcon = {
        path: maps.SymbolPath.CIRCLE,
        fillColor: '#1a73e8',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
        scale: 7,
      };
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setPosition({ lat, lng });
        userLocationMarkerRef.current.setIcon(dotIcon);
        userLocationMarkerRef.current.setMap(mapRef.current);
      } else {
        userLocationMarkerRef.current = new maps.Marker({
          map: mapRef.current,
          position: { lat, lng },
          title: 'Minha localização',
          icon: dotIcon,
          zIndex: USER_LOCATION_Z,
          clickable: false,
        });
      }
    },
    [mapsReady],
  );

  // Ao abrir a página no mobile: se o dispositivo JÁ concedeu a permissão de localização,
  // salta sozinho para a posição atual com zoom de rua — como se o usuário tivesse clicado
  // no botão Minha localização. Só dispara quando a permissão está 'granted': nunca abrimos
  // o prompt de permissão no load (intrusivo); 'prompt'/'denied', ou navegador sem a
  // Permissions API, ficam para o clique explícito. Roda uma única vez e desiste se o
  // usuário já selecionou algo (ex.: deep-link para um Site) enquanto resolvíamos a
  // permissão, para não roubar o enquadramento dele.
  const autoLocatedRef = useRef(false);
  useEffect(() => {
    if (!mapsReady || autoLocatedRef.current || !autoLocateOnOpen) return;
    autoLocatedRef.current = true;
    if (!('geolocation' in navigator) || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== 'granted' || selectedNodeIdRef.current) return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled || selectedNodeIdRef.current) return;
            handleDeviceLocate({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mapsReady, handleDeviceLocate, autoLocateOnOpen]);

  if (!GOOGLE_MAPS_KEY) {
    return <FallbackMap nodes={nodes} draftAddress={draftAddress} onSelectNode={onSelectNode} />;
  }

  return (
    <>
      <div
        ref={mapEl}
        data-testid="google-map-canvas"
        className="absolute inset-0 h-full w-full"
        onPointerDownCapture={(event) => {
          if (event.pointerType !== 'touch') return;
          activeMapPointersRef.current.add(event.pointerId);
        }}
        onPointerMoveCapture={(event) => {
          // Dois dedos apenas apoiados não caracterizam zoom; o movimento real evita
          // confundir um zoom programático simultâneo com uma pinça do usuário.
          if (
            event.pointerType === 'touch' &&
            activeMapPointersRef.current.has(event.pointerId) &&
            activeMapPointersRef.current.size >= 2 &&
            !pinchNavigationHandledRef.current
          ) {
            pinchNavigationHandledRef.current = true;
            handleManualNavigation();
          }
        }}
        onWheelCapture={handleManualNavigation}
      />
      <MapBaseLayerSelector value={baseLayerId} onChange={setBaseLayerId} />
      <MapLocateButton onLocate={handleDeviceLocate} />
      {balloon ? createPortal(<MapBalloonCard balloon={balloon} />, balloonNode) : null}
    </>
  );
}

// Conteúdo do balão de preview: identidade do item (tipo + nome + ícone) e os
// campos que o identificam em campo. Puro cartão de visita, sem ação — o
// detalhe completo mora no painel aberto por clique (ver GeoDetailPanel).
function MapBalloonCard({ balloon }: { balloon: MapBalloon }) {
  return (
    <div className="w-[240px] p-1">
      <div className="flex items-start gap-2.5">
        <img src={balloon.iconUrl} alt="" className="mt-0.5 h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {balloon.eyebrow}
          </div>
          <h3 className="font-display text-[1rem] font-semibold leading-tight text-app-text">
            {balloon.title}
          </h3>
        </div>
      </div>

      {balloon.rows.length ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-app-border pt-2.5">
          {balloon.rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-[0.72rem] text-app-muted">{label}</dt>
              <dd className="truncate text-[0.78rem] text-app-text" title={value}>
                {value}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

// Sem chave do Google Maps não há mapa: resta desenhar os mesmos nós em grade,
// para a navegação continuar utilizável em ambiente sem a chave configurada.
function FallbackMap({
  nodes,
  draftAddress,
  onSelectNode,
}: {
  nodes: GeoTreeNode[];
  draftAddress: DraftAddress | null;
  onSelectNode: (node: GeoTreeNode) => void;
}) {
  return (
    <div className="absolute inset-0 h-full w-full bg-[linear-gradient(rgba(215,222,232,0.72)_1px,transparent_1px),linear-gradient(90deg,rgba(215,222,232,0.72)_1px,transparent_1px),linear-gradient(135deg,#dce4ec,#f8fafc_46%,#e7eaf0)] bg-[length:36px_36px,36px_36px,auto]">
      <div className="absolute right-4 top-20 z-20 rounded-[18px] border border-app-border bg-white px-4 py-3 text-[0.84rem] text-app-muted shadow-soft">
        Configure <strong className="text-app-text">VITE_GOOGLE_MAPS_API_KEY</strong> para ativar
        Google Maps.
      </div>
      {nodes.slice(0, 60).map((node, index) => {
        const isSite = node.kind === 'site';
        const icon = isSite
          ? siteIconFor(
              siteKindFromSpec({ category: node.siteCategory, name: node.sublabel }),
              (node.status as GeoStatus) ?? 'active',
            )
          : resourceIconFor({ resourceType: node.resourceType ?? '', status: node.status });
        const url = isSite
          ? siteIconDataUrl(icon as ReturnType<typeof siteIconFor>, { size: 40 })
          : resourceIconDataUrl(icon as ReturnType<typeof resourceIconFor>, { size: 40 });
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node)}
            title={`${node.label} · ${icon.label}`}
            className="absolute z-20 h-10 w-10 shadow-soft"
            style={{
              left: `${20 + (index % 6) * 10}%`,
              top: `${30 + (index % 4) * 12}%`,
            }}
          >
            <img src={url} alt={node.label} className="h-10 w-10" />
          </button>
        );
      })}
      {draftAddress ? (
        <div className="absolute left-[54%] top-[52%] z-20 flex h-10 w-10 items-center justify-center rounded-[14px] border-2 border-app-text bg-app-accent font-bold shadow-soft">
          +
        </div>
      ) : null}
    </div>
  );
}

// Painel de detalhe do item selecionado (Site ou Recurso) — dock à esquerda no
// desktop (mesma coluna da hierarquia, um painel por vez) e bottom sheet
// arrastável no mobile. Nasce do clique na árvore, no mapa ou na busca (ver
// selectNode em GeoPage), nunca de um modal: o Google Maps também abre o
// detalhe do lugar como painel, não popup.
function GeoDetailPanel({
  isMobile,
  target,
  tab,
  sites,
  specById,
  siteById,
  events,
  onTab,
  onOpenSite,
  onOpenResource,
  onBack,
  onClose,
  onChanged,
  onCreateSubSite,
  onSnapChange,
  minimizeSignal,
}: {
  isMobile: boolean;
  target: DetailTarget;
  tab: DetailTab;
  sites: GeoSite[];
  specById: Map<string, GeoSpec>;
  siteById: Map<string, GeoSite>;
  events: GeoEvent[];
  onTab: (tab: DetailTab) => void;
  onOpenSite: (site: GeoSite) => void;
  onOpenResource: (resourceId: string) => void;
  onBack: () => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCreateSubSite: () => void;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  // Contador que, ao incrementar, encolhe a folha para peek (ver BottomSheet).
  minimizeSignal?: number;
}) {
  const eyebrow =
    target.kind === 'site'
      ? `Site · ${specById.get(target.site.siteSpecificationId)?.name ?? 'Tipo não informado'}`
      : (target.node.sublabel ?? resourceIconFor(target.node.resourceType ?? '').label);
  const title = target.kind === 'site' ? target.site.name : target.node.label;

  // Hoisted de SiteDetailBody: o hero (foto do topo) precisa do ponto do Site aqui
  // no painel, então a busca por endereço/geometria sob demanda mora neste nível
  // para os dois (hero e corpo) lerem o mesmo resultado, sem buscar duas vezes — o
  // backend de dev atende requisições em série (ver AGENTS.md).
  const { address: siteAddress, point: sitePoint } = useSitePlace(
    target.kind === 'site' ? target.site : null,
  );
  const resourcePoint =
    target.kind === 'resource'
      ? streetViewTargetsForGeometry(target.node.geometry)[0]?.point
      : undefined;
  const heroMarker: StreetViewMarker | null =
    target.kind === 'site'
      ? sitePoint
        ? siteStreetViewMarker(
            target.site,
            specById.get(target.site.siteSpecificationId),
            sitePoint,
          )
        : null
      : resourcePoint
        ? resourceStreetViewMarker(target.node, resourcePoint)
        : null;

  const body =
    target.kind === 'site' ? (
      <SiteDetailBody
        site={target.site}
        address={siteAddress}
        point={sitePoint}
        tab={tab}
        sites={sites}
        specById={specById}
        siteById={siteById}
        events={events}
        onTab={onTab}
        onOpenSite={onOpenSite}
        onOpenResource={onOpenResource}
        onChanged={onChanged}
        onCreateSubSite={onCreateSubSite}
      />
    ) : (
      <ResourceDetailBody node={target.node} onOpenResource={onOpenResource} />
    );

  const header = (
    <div className="flex items-start gap-2 border-y border-app-border px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Voltar para a hierarquia"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted [overflow-wrap:anywhere]">
          {eyebrow}
        </div>
        <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text [overflow-wrap:anywhere]">
          {title}
        </h3>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} onSnapChange={onSnapChange} minimizeSignal={minimizeSignal}>
        {/* Foto, título e corpo rolam juntos dentro da folha (ver BottomSheet). */}
        <StreetViewHero marker={heroMarker} />
        {header}
        {/* `overflow-hidden` nos dois eixos evita que `overflow-x-hidden` transforme
            implicitamente Y em `auto` e roube o gesto touch do BottomSheet. */}
        <div className="min-w-0 overflow-hidden px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    // `overflow-hidden` (não `overflow-x-hidden`) de propósito: com só um eixo em
    // `hidden`, o outro (`overflow-y: visible`) computa para `auto` e a casca vira um
    // segundo contêiner de rolagem, ao lado do scroll do conteúdo abaixo — era o
    // scroll duplo do painel. Quem rola aqui é só o filho `overflow-y-auto`.
    <div
      className={`relative flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock`}
    >
      {/* A barra de pesquisa é uma instância única, sobreposta a esta doca pelo GeoPage
          (estilo Google Maps): a foto de Street View, o título e o corpo rolam por baixo
          dela. Aqui o painel só cede o topo — não monta a barra. */}
      {/* Barra de rolagem sobreposta: a foto e as abas usam toda a largura do painel; o
          polegar projeta por cima delas no hover (ver OverlayScrollArea). */}
      <OverlayScrollArea className="overflow-x-hidden">
        <StreetViewHero marker={heroMarker} />
        {header}
        <div className="px-3 py-3">{body}</div>
      </OverlayScrollArea>
    </div>
  );
}

// Corpo do detalhe de um Site: abas de visão geral, sub-locais, recursos
// hospedados, topologia e ciclo de vida. Extraído do antigo modal — o cabeçalho
// (título/eyebrow/fechar) agora é responsabilidade do GeoDetailPanel.
function SiteDetailBody({
  site,
  address,
  point,
  tab,
  sites,
  specById,
  siteById,
  events,
  onTab,
  onOpenSite,
  onOpenResource,
  onChanged,
  onCreateSubSite,
}: {
  site: GeoSite;
  address: GeoAddress | null;
  point: [number, number] | null;
  tab: DetailTab;
  sites: GeoSite[];
  specById: Map<string, GeoSpec>;
  siteById: Map<string, GeoSite>;
  events: GeoEvent[];
  onTab: (tab: DetailTab) => void;
  onOpenSite: (site: GeoSite) => void;
  onOpenResource: (resourceId: string) => void;
  onChanged: () => Promise<void>;
  onCreateSubSite: () => void;
}) {
  const spec = specById.get(site.siteSpecificationId);
  // O conteúdo do local vem do mesmo endpoint que alimenta a árvore, e só quando
  // o painel abre: sub-locais e recursos hospedados são os filhos diretos dele.
  const { subSites, resources, loading: childrenLoading } = useSiteChildren(site.id);
  const [relationshipTarget, setRelationshipTarget] = useState('');
  const [relationshipType, setRelationshipType] = useState('fedBy');
  const [nextStatus, setNextStatus] = useState<GeoStatus>(site.status);

  const addRelationship = async () => {
    if (!relationshipTarget || !relationshipType.trim()) return;
    await postJson(`/v1/geo/sites/${site.id}/relationships`, {
      relatedSiteId: relationshipTarget,
      relationshipType,
    });
    await onChanged();
  };

  const changeStatus = async () => {
    await patchJson(`/v1/geo/sites/${site.id}`, { status: nextStatus });
    await onChanged();
  };

  const siteMarker = point ? siteStreetViewMarker(site, spec, point) : null;
  // `_origin.extra` é somente-leitura, gravado por cargas de migração (ver
  // scripts/estacoes_carregar.mjs) — nunca editável pela UI (C5, service.ts).
  const siteOriginExtra = site.characteristic.find((c) => c.name === '_origin.extra')?.value as
    { sistemaOrigem?: string } | undefined;

  return (
    <>
      {/* Barra de ações abaixo do título, estilo Google Maps: ícone em cima,
          rótulo embaixo. Sub-locais e Recursos levam contador — eles são a
          única porta de entrada para o que saiu da árvore, então o número
          precisa ser visível de fora. Street View fica ao lado da coordenada
          (ver aba Visão geral), não solto na barra. */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-app-border pb-3">
        {(
          [
            ['overview', 'Visão geral', InfoIcon, null],
            ['subsites', 'Sub-locais', Building2, subSites.length],
            ['resources', 'Recursos', Boxes, resources.length],
            ['topology', 'Topologia', Network, null],
            ['lifecycle', 'Ciclo de vida', History, null],
          ] as Array<[DetailTab, string, LucideIcon, number | null]>
        ).map(([id, label, icon, count]) => (
          <PanelBarButton
            key={id}
            icon={icon}
            label={label}
            badge={count}
            active={tab === id}
            onClick={() => onTab(id)}
          />
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-1">
          <IconInfoRow icon={Activity} hint="Status" value={<StatusBadge status={site.status} />} />
          <IconInfoRow
            icon={MapPin}
            hint="Endereço"
            value={address ? formatAddress(address) : 'Sem endereço'}
          />
          <IconInfoRow
            icon={Crosshair}
            hint="Localização"
            value={siteMarker ? <CoordinateStreetView marker={siteMarker} /> : 'Não localizado'}
          />
          <IconInfoRow
            icon={Building}
            hint="ParentSite"
            value={
              site.parentSite
                ? (siteById.get(site.parentSite.id)?.name ?? site.parentSite.id)
                : 'Nenhum'
            }
          />
          <IconInfoRow icon={Hash} hint="ID" value={site.id} mono />
          {siteOriginExtra?.sistemaOrigem ? (
            <IconInfoRow
              icon={InfoIcon}
              hint="Sistema de origem"
              value={siteOriginExtra.sistemaOrigem}
            />
          ) : null}
        </div>
      ) : null}

      {tab === 'subsites' ? (
        <div>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 break-words text-[0.82rem] leading-snug text-app-muted [overflow-wrap:anywhere]">
              Espaços internos do site (sala, andar, gaveta, etc)
            </div>
            <button
              type="button"
              className="geo-btn primary shrink-0"
              onClick={onCreateSubSite}
              aria-label="Adicionar sub-local"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {childrenLoading ? (
            <LoadingRow label="Carregando sub-locais…" />
          ) : subSites.length ? (
            <div className="grid gap-2">
              {subSites.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => {
                    const target = child.refId ? siteById.get(child.refId) : undefined;
                    if (target) onOpenSite(target);
                  }}
                  className="flex w-full min-w-0 items-start gap-2.5 rounded-[14px] border border-app-border px-3 py-2.5 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <img
                    src={siteIconDataUrl(
                      siteIconFor(
                        siteKindFromSpec({ category: child.siteCategory, name: child.sublabel }),
                        (child.status as GeoStatus) ?? 'active',
                      ),
                      { size: 28 },
                    )}
                    alt=""
                    className="h-7 w-7 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">
                      {child.label}
                    </span>
                    <span className="mt-0.5 block break-words text-[0.75rem] leading-snug text-app-muted [overflow-wrap:anywhere]">
                      {child.sublabel ?? 'Sub-local'} ·{' '}
                      {statusLabel[(child.status as GeoStatus) ?? 'active']}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">
                    Abrir
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              Este local ainda não possui sub-locais.
            </div>
          )}
        </div>
      ) : null}

      {tab === 'topology' ? (
        <div className="grid gap-4">
          <SimpleRows
            rows={site.relatedSite.map((rel) => [
              relationshipTypeLabel(rel.relationshipType),
              siteById.get(rel.id)?.name ?? rel.id,
              rel.id,
            ])}
            empty="Sem relações topológicas."
          />
          <div className="grid min-w-0 gap-2 rounded-[14px] border border-app-border p-3">
            <select
              value={relationshipType}
              onChange={(event) => setRelationshipType(event.target.value)}
              className="geo-input"
            >
              {['fedBy', 'feeds', 'nearby', 'contains'].map((value) => (
                <option key={value} value={value}>
                  {relationshipTypeLabel(value)}
                </option>
              ))}
            </select>
            <select
              value={relationshipTarget}
              onChange={(event) => setRelationshipTarget(event.target.value)}
              className="geo-input"
            >
              <option value="">Site relacionado</option>
              {sites
                .filter((item) => item.id !== site.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="geo-btn primary justify-center"
              onClick={() => void addRelationship()}
            >
              Adicionar
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'lifecycle' ? (
        <div className="grid gap-4">
          <div className="grid min-w-0 gap-2 rounded-[14px] border border-app-border p-3">
            <select
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as GeoStatus)}
              className="geo-input"
            >
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="geo-btn primary justify-center"
              onClick={() => void changeStatus()}
            >
              Mudar status
            </button>
          </div>
          <SimpleRows
            rows={events.map((event) => [
              new Date(event.eventTime).toLocaleString('pt-BR'),
              event.eventType,
              event.source,
            ])}
            empty="Sem eventos registrados."
          />
        </div>
      ) : null}

      {tab === 'resources' ? (
        <SiteResourcesTab
          resources={resources}
          loading={childrenLoading}
          onOpenResource={onOpenResource}
        />
      ) : null}
    </>
  );
}

// Detalhe leve de um recurso (OLT, CTO, porta, cabo…): os campos que o
// identificam em campo, os recursos que moram dentro dele (ex.: portas de uma
// placa) e o atalho para o módulo Recursos, dono do cadastro completo. A
// fronteira Geo × Resource (C3) fica preservada — aqui é referência, não edição.
function ResourceDetailBody({
  node,
  onOpenResource,
}: {
  node: GeoTreeNode;
  onOpenResource: (resourceId: string) => void;
}) {
  const resourceStatus = (node.status as GeoStatus) ?? 'active';
  const streetViewTargets = streetViewTargetsForGeometry(node.geometry);
  const { children, loading } = useResourceChildren(node);
  const [tab, setTab] = useState<'overview' | 'subresources'>('overview');

  return (
    <div className="grid gap-4">
      {/* Barra de ações abaixo do título, mesmo padrão do Site: Recursos
          internos leva contador — mesma lógica de Sub-locais/Recursos no
          Site, é a porta de entrada para o que mora dentro deste recurso
          (ex.: portas de uma placa). Street View fica ao lado de cada
          coordenada, não solto na barra. */}
      <div className="flex flex-wrap gap-1 border-b border-app-border pb-3">
        <PanelBarButton
          icon={InfoIcon}
          label="Visão geral"
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
        />
        <PanelBarButton
          icon={Boxes}
          label="Recursos internos"
          badge={children.length}
          active={tab === 'subresources'}
          onClick={() => setTab('subresources')}
        />
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-1">
          <IconInfoRow
            icon={Activity}
            hint="Status"
            value={<StatusBadge status={resourceStatus} />}
          />
          {node.detail?.substatus ? (
            <IconInfoRow icon={Ban} hint="Substatus" value={node.detail.substatus} />
          ) : null}
          <IconInfoRow
            icon={MapPin}
            hint="Endereço"
            value={node.detail?.address ?? 'Sem endereço'}
          />
          {streetViewTargets.map((target) => (
            <IconInfoRow
              key={`${target.label ?? 'ponto'}:${target.point.join(',')}`}
              icon={Crosshair}
              hint={target.label ? `Localização · ${target.label}` : 'Localização'}
              value={<CoordinateStreetView marker={resourceStreetViewMarker(node, target.point)} />}
            />
          ))}
          {node.detail?.model ? (
            <IconInfoRow icon={Cpu} hint="Modelo" value={node.detail.model} />
          ) : null}
          {node.detail?.manufacturer ? (
            <IconInfoRow icon={Factory} hint="Fabricante" value={node.detail.manufacturer} />
          ) : null}
          {node.detail?.serialNumber ? (
            <IconInfoRow icon={Barcode} hint="Nº de série" value={node.detail.serialNumber} mono />
          ) : null}
          {node.detail?.sourceSystem ? (
            <IconInfoRow
              icon={Database}
              hint="Sistema de origem"
              value={node.detail.sourceSystem}
            />
          ) : null}
        </div>
      ) : null}

      {tab === 'subresources' ? (
        <div>
          {loading ? (
            <LoadingRow label="Carregando recursos internos…" />
          ) : children.length ? (
            <div className="grid gap-2">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => (child.refId ? onOpenResource(child.refId) : undefined)}
                  className="flex w-full min-w-0 items-start gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon
                    resource={{ resourceType: child.resourceType ?? '', status: child.status }}
                    variant="badge"
                    size={26}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">
                      {child.label}
                    </span>
                    <span className="mt-0.5 block break-words text-[0.75rem] leading-snug text-app-muted [overflow-wrap:anywhere]">
                      {[
                        resourceIconFor({
                          resourceType: child.resourceType ?? '',
                          status: child.status,
                        }).label,
                        child.detail?.model,
                        child.detail?.serialNumber,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">
                    Abrir
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              Este recurso ainda não possui recursos internos.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Filhos diretos de um recurso (ex.: portas de uma placa, fibras de um cabo, ou o
// splitter de uma CDOE). Sempre busca com `scope: 'all'` — `node.hasChildren` reflete
// o escopo de árvore (com pass-through sobre item interno), então uma CDOE cujo único
// filho é um splitter chega aqui com `hasChildren: false` mesmo tendo o quê mostrar.
function useResourceChildren(node: GeoTreeNode): { children: GeoTreeNode[]; loading: boolean } {
  const [nodes, setNodes] = useState<GeoTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setNodes([]);
    setLoading(true);
    void fetchTreeChildren(node.id, { scope: 'all' })
      .then((page) => {
        if (cancelled) return;
        setNodes(page.nodes);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  return { children: nodes, loading };
}

// Recursos hospedados no local, agrupados por planta. É aqui que vive tudo que
// saiu do mapa e da hierarquia: OLT, placa, porta, DIO e o equipamento de
// cliente. A fronteira Geo × Resource (C3) fica preservada — a lista é
// referencial e o detalhe abre no módulo Resource.
function SiteResourcesTab({
  resources,
  loading,
  onOpenResource,
}: {
  resources: GeoTreeNode[];
  loading: boolean;
  onOpenResource: (resourceId: string) => void;
}) {
  const groups = useMemo(() => {
    const byPlant = new Map<ResourcePlant, GeoTreeNode[]>();
    for (const resource of resources) {
      const plant = resourcePlant(resource.resourceType ?? '');
      const list = byPlant.get(plant) ?? [];
      list.push(resource);
      byPlant.set(plant, list);
    }
    // Ordem de leitura: o que está na rua, o que está no rack, o que está no
    // cliente, e por último o que não é físico.
    const order: ResourcePlant[] = ['outdoor', 'indoor', 'customer', 'logical'];
    return order
      .map((plant) => ({ plant, items: byPlant.get(plant) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [resources]);

  if (loading) {
    return <LoadingRow label="Carregando recursos…" />;
  }

  if (!groups.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Nenhum recurso registrado neste local.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map(({ plant, items }) => (
        <section key={plant}>
          <h4 className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {plantLabel[plant]} · {items.length}
          </h4>
          <div className="grid gap-2">
            {items.map((resource) => {
              const icon = resourceIconFor({
                resourceType: resource.resourceType ?? '',
                status: resource.status,
              });
              return (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => (resource.refId ? onOpenResource(resource.refId) : undefined)}
                  className="flex w-full min-w-0 items-start gap-2.5 rounded-[14px] border border-app-border px-3 py-2 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon
                    resource={{
                      resourceType: resource.resourceType ?? '',
                      status: resource.status,
                    }}
                    variant="badge"
                    size={26}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">
                      {resource.label}
                    </span>
                    <span className="mt-0.5 block break-words text-[0.75rem] leading-snug text-app-muted [overflow-wrap:anywhere]">
                      {[icon.label, resource.detail?.model, resource.detail?.serialNumber]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">
                    Abrir
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TypeManagementModal({
  specs,
  onClose,
  onChanged,
}: {
  specs: GeoSpec[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GeoSpec['category']>('Site');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await postJson('/v1/geo/site-specifications', { name, category });
      setName('');
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Tipos de Site" eyebrow="Catalogo">
      <div className="mb-4 max-h-[260px] overflow-auto rounded-[18px] border border-app-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Categoria</Th>
              <Th>Filhos permitidos</Th>
            </tr>
          </thead>
          <tbody>
            {specs.map((spec) => (
              <tr key={spec.id} className="border-t border-app-border">
                <td className="px-4 py-3 text-[0.88rem] font-semibold text-app-text">
                  {spec.name}
                </td>
                <td className="px-4 py-3 text-[0.84rem] text-app-muted">{spec.category}</td>
                <td className="px-4 py-3 text-[0.84rem] text-app-muted">
                  {spec.allowedChildSpecIds.length || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="geo-input"
          placeholder="ex: Central Office"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as GeoSpec['category'])}
          className="geo-input"
        >
          {['Region', 'FunctionalGroup', 'Site', 'SubSite'].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="geo-btn primary justify-center"
          disabled={saving || !name.trim()}
        >
          Criar
        </button>
      </form>
    </Modal>
  );
}

function Modal({
  children,
  title,
  eyebrow,
  onClose,
  wide,
}: {
  children: ReactNode;
  title: string;
  eyebrow: string;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6">
      <div
        className={`max-h-[90vh] overflow-auto rounded-[26px] border border-app-border bg-white p-5 shadow-modal ${wide ? 'w-full max-w-[920px]' : 'w-full max-w-[720px]'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              {eyebrow}
            </div>
            <h3 className="mt-1 font-display text-[1.35rem] font-semibold text-app-text">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Estado de carregamento sob demanda (sub-locais, recursos do site, recursos
// internos de um recurso): sem isto a lista vazia por um instante era
// indistinguível de "não tem nada aqui", e a UI parecia travada.
function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      {label}
    </div>
  );
}

function SimpleRows({ rows, empty }: { rows: string[][]; empty: string }) {
  if (!rows.length)
    return (
      <div className="rounded-[14px] border border-dashed border-app-border p-3 text-[0.84rem] text-app-muted">
        {empty}
      </div>
    );
  return (
    <div className="grid min-w-0 rounded-[14px] border border-app-border">
      {rows.map((row) => (
        <div
          key={row.join('|')}
          className="grid min-w-0 gap-1 border-b border-app-border px-3 py-2.5 last:border-b-0"
        >
          {row.map((cell, index) => (
            <div
              key={`${cell}-${index}`}
              className={`min-w-0 break-words text-[0.82rem] leading-snug [overflow-wrap:anywhere] ${
                index === 0 ? 'font-semibold text-app-text' : 'text-app-muted'
              }`}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-app-border px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
      {children}
    </th>
  );
}

// Um GeoSite visto como nó da árvore. Serve os caminhos que chegam ao local por
// fora da navegação (link vindo de Recursos/Serviços, abertura do modal), para a
// seleção ter sempre a mesma forma.
function siteNodeOf(site: GeoSite): GeoTreeNode {
  return {
    id: `site:${site.id}`,
    kind: 'site',
    label: site.name,
    refId: site.id,
    referredType: 'GeographicSite',
    status: site.status,
    hasChildren: false,
  };
}

// Endereço e coordenada do local aberto. Buscados por id sob demanda: carregar os
// ~10 mil endereços e geometrias do acervo só para preencher dois campos de um
// modal era o que fazia a página abrir devagar. `site` nulo (alvo é Recurso, não
// Site) é um no-op — hoisted para GeoDetailPanel, que atende os dois, então só
// busca quando o alvo realmente é um Site (ver GeoDetailPanel).
function useSitePlace(site: GeoSite | null): {
  address: GeoAddress | null;
  point: [number, number] | null;
} {
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [point, setPoint] = useState<[number, number] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAddress(null);
    setPoint(null);

    if (site?.address?.id) {
      void getJson<GeoAddress>(`/v1/geo/addresses/${site.address.id}`)
        .then((data) => !cancelled && setAddress(data))
        .catch(() => undefined);
    }
    if (site?.place?.id) {
      void getJson<GeoLocation>(`/v1/geo/locations/${site.place.id}`)
        .then((data) => {
          if (cancelled || data.geometry.type !== 'Point') return;
          setPoint(data.geometry.coordinates);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [site?.address?.id, site?.place?.id]);

  return { address, point };
}

// Conteúdo do local: os mesmos filhos diretos que a árvore mostraria, separados
// em sub-locais e recursos para as duas abas do modal.
function useSiteChildren(siteId: string): {
  subSites: GeoTreeNode[];
  resources: GeoTreeNode[];
  loading: boolean;
} {
  const [nodes, setNodes] = useState<GeoTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setNodes([]);
    setLoading(true);
    // scope 'all': as abas Sub-locais e Recursos são a porta de entrada declarada para
    // o que a árvore e o mapa escondem (sala/andar e Splitter) — precisam ver tudo.
    void fetchTreeChildren(`site:${siteId}`, { scope: 'all' })
      .then((page) => !cancelled && setNodes(page.nodes))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return useMemo(
    () => ({
      subSites: nodes.filter((node) => node.kind === 'site'),
      resources: nodes.filter((node) => node.kind === 'resource'),
      loading,
    }),
    [nodes, loading],
  );
}
