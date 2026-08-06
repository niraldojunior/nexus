import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Plus, X } from 'lucide-react';
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
  PASSIVE_INFRA_MAX_SCALE_METERS,
  MARKER_CLUSTER_MIN_SCALE_METERS,
} from '../utils/mapScale';
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
import { selectionPinDataUrl, siteIconDataUrl, siteIconFor, SELECTION_PIN_ASPECT } from '../utils/siteIcon';
import { useNavigation } from '../hooks/useNavigation';
import { GeoSearchBar, GuidedSignupModal, HierarchySidebar } from './geo-tabs';
import { BottomSheet } from '../components/BottomSheet';
import { GoogleStreetViewButton } from '../components/GoogleStreetViewButton';
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

// O alfinete de seleção fica acima de tudo: precisa vencer local e recurso, que já
// crescem quando selecionados.
const SELECTION_PIN_Z = 2000;
const SELECTION_PIN_HEIGHT = 44;

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

export default function GeoPage() {
  const [sites, setSites] = useState<GeoSite[]>([]);
  const [specs, setSpecs] = useState<GeoSpec[]>([]);
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [draftAddress, setDraftAddress] = useState<DraftAddress | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  // Colapso da hierarquia, hoisted de HierarchySidebar: precisa viver aqui para a
  // barra de pesquisa decidir se flutua sobre o mapa ou fica dentro da doca (ver
  // dockPanelOpen), e para não mudar quando o detalhe abre/fecha por cima dela —
  // é isso que faz a hierarquia "lembrar" o estado de antes ao fechar o detalhe.
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
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
  const isMobile = useIsMobile();
  const { navParams, clearNav, goToResource } = useNavigation();

  // Infra passiva só entra quando a escala está em ≤ 200 m; Estações (tree.mapNodes)
  // continuam sempre visíveis, ramo aberto ou não.
  const passiveInfraVisible = scaleMeters !== null && scaleMeters <= PASSIVE_INFRA_MAX_SCALE_METERS;
  const mapNodes = useMemo(
    () => (passiveInfraVisible ? [...tree.mapNodes, ...viewportInfra] : tree.mapNodes),
    [tree.mapNodes, viewportInfra, passiveInfraVisible],
  );
  // Só agrupa acima de 100 m; em ≤ 100 m cada ponto é um ícone individual. Escala ainda
  // desconhecida (antes do primeiro idle) agrupa por segurança — geralmente é vista aberta.
  const clusterMarkers = (scaleMeters ?? Infinity) > MARKER_CLUSTER_MIN_SCALE_METERS;

  const specById = useMemo(() => new Map(specs.map((item) => [item.id, item])), [specs]);
  const siteById = useMemo(() => new Map(sites.map((item) => [item.id, item])), [sites]);
  const selectedSiteId = selectedNode?.referredType === 'GeographicSite' ? selectedNode.refId ?? null : null;
  const selectedSite = selectedSiteId ? siteById.get(selectedSiteId) ?? null : null;
  const selectedResourceNode = selectedNode?.kind === 'resource' ? selectedNode : null;
  // Alvo do painel de detalhe — deriva da mesma seleção usada pelo mapa e pela
  // árvore, então abrir por clique ou por deep-link (navParams) é o mesmo caminho.
  const detailTarget = useMemo<DetailTarget | null>(() => {
    if (selectedSite) return { kind: 'site', site: selectedSite };
    if (selectedResourceNode) return { kind: 'resource', node: selectedResourceNode };
    return null;
  }, [selectedSite, selectedResourceNode]);
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
        setSelectedNode(siteNodeOf(site));
        setDetailOpen(true);
        setQuery(site.name);
        clearNav();
      }
    }
  }, [navParams, sites, clearNav]);

  // Seleção — o mesmo caminho para o clique na árvore e no mapa. Centraliza o
  // mapa e expande o nó (e seus ancestrais) quando ele tem filhos: nada nasce
  // aberto por padrão, então é o clique na estação que revela CTOs/Splitters
  // abaixo dela. Site e Recurso também abrem o painel de detalhe — dock à
  // esquerda no desktop, bottom sheet no mobile (ver GeoDetailPanel). Nós de
  // UF/Município/grupo só navegam a árvore, não têm detalhe próprio.
  const selectNode = useCallback(
    (node: GeoTreeNode) => {
      setSelectedNode(node);
      setDraftAddress(null);
      const point = treeNodePoint(node);
      if (point) setFocusPoint(point);
      if (node.hasChildren) tree.expandNode(node.id);
      if (node.kind === 'site' || node.kind === 'resource') {
        setDetailTab('overview');
        setDetailOpen(true);
        // Nome do item vai para a barra de pesquisa — tal como se o usuário tivesse
        // pesquisado por ele (ver GeoSearchBar).
        setQuery(node.label);
      } else {
        setDetailOpen(false);
      }
    },
    [tree],
  );

  // Clique fora de qualquer item (vazio do mapa) com uma seleção ativa: tira o
  // alfinete e fecha o detalhe, igual ao Google Maps. A hierarquia reaparece
  // sozinha — seu colapso não é tocado por seleção/deseleção (ver selectNode).
  const onDeselect = useCallback(() => {
    setSelectedNode(null);
    setDetailOpen(false);
    setDraftAddress(null);
    setQuery('');
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
    setSelectedNode(siteNodeOf(site));
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

    const icon = resourceIconFor(node.resourceType ?? '');
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
    if (!detailOpen || createOpen || typeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [createOpen, detailOpen, typeOpen]);

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-transparent flex flex-col">
      <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-[#eef2f6]">
        {error ? (
          <div className="absolute left-5 top-5 z-40 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-[0.88rem] text-red-700 shadow-soft">
            {error}
          </div>
        ) : null}

        <div className="relative flex h-full min-h-0">
            {detailOpen && detailTarget ? (
              <GeoDetailPanel
                isMobile={isMobile}
                target={detailTarget}
                tab={detailTab}
                sites={sites}
                specById={specById}
                siteById={siteById}
                events={events}
                onTab={setDetailTab}
                onOpenSite={(next) => openDetail(next, 'overview')}
                onOpenResource={goToResource}
                onClose={onDeselect}
                onChanged={async () => {
                  if (!selectedSite) return;
                  await loadGeo();
                  const updatedEvents = await getJson<GeoEvent[]>(`/v1/geo/sites/${selectedSite.id}/events`).catch(() => []);
                  setEvents(updatedEvents);
                }}
                onCreateSubSite={() => {
                  setDetailOpen(false);
                  setCreateOpen(true);
                }}
                searchBar={
                  isMobile ? null : (
                    <GeoSearchBar
                      variant="panel"
                      query={query}
                      onQueryChange={setQuery}
                      onSelectNode={selectNode}
                      onSelectAddress={setDraftAddress}
                    />
                  )
                }
              />
            ) : (
              <HierarchySidebar
                tree={tree}
                selectedNodeId={selectedNode?.id ?? null}
                onSelect={selectNode}
                onHover={handleHover}
                onOpenTypes={() => setTypeOpen(true)}
                collapsed={hierarchyCollapsed}
                onCollapsedChange={setHierarchyCollapsed}
                searchBar={
                  isMobile || hierarchyCollapsed ? null : (
                    <GeoSearchBar
                      variant="panel"
                      query={query}
                      onQueryChange={setQuery}
                      onSelectNode={selectNode}
                      onSelectAddress={setDraftAddress}
                    />
                  )
                }
              />
            )}

            <div className="relative min-h-0 flex-1">
            <GoogleMapPanel
          nodes={mapNodes}
          selectedNodeId={selectedNode?.id ?? null}
          draftAddress={draftAddress}
          focusPoint={focusPoint}
          balloon={balloon}
          onSelectNode={selectNode}
          onHoverNode={handleHover}
          onCloseBalloon={() => handleHover(null)}
          onDraftAddress={setDraftAddress}
          onDeselect={onDeselect}
          onViewportChange={handleViewportChange}
          clusterMarkers={clusterMarkers}
        />

        {isMobile || (!detailOpen && hierarchyCollapsed) ? (
          <GeoSearchBar
            variant="floating"
            isMobile={isMobile}
            query={query}
            onQueryChange={setQuery}
            onSelectNode={selectNode}
            onSelectAddress={setDraftAddress}
          />
        ) : null}

        {loading ? (
          <div className="absolute right-5 bottom-5 z-30 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.84rem] font-medium text-app-muted shadow-soft backdrop-blur">
            Carregando dados Geo...
          </div>
        ) : null}

            </div>
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
    </div>
  );
}

// O mapa sempre mostra todas as estações (mesmo com o ramo fechado na árvore). Infra
// passiva (recursos + cabos) vem de fora, já filtrada por escala/viewport pelo
// GeoPage — este painel só desenha o que chega em `nodes` e avisa (`onViewportChange`)
// quando a região visível ou a escala mudam, para o chamador decidir o que buscar.
function GoogleMapPanel({
  nodes,
  selectedNodeId,
  draftAddress,
  focusPoint,
  balloon,
  onSelectNode,
  onHoverNode,
  onCloseBalloon,
  onDraftAddress,
  onDeselect,
  onViewportChange,
  clusterMarkers,
}: {
  nodes: GeoTreeNode[];
  selectedNodeId: string | null;
  draftAddress: DraftAddress | null;
  focusPoint?: [number, number] | null;
  balloon: MapBalloon | null;
  onSelectNode: (node: GeoTreeNode) => void;
  onHoverNode: (node: GeoTreeNode | null) => void;
  onCloseBalloon: () => void;
  onDraftAddress: (address: DraftAddress) => void;
  onDeselect: () => void;
  onViewportChange: (bounds: MapBounds, scaleMeters: number) => void;
  clusterMarkers: boolean;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  // Marcadores/polylines indexados por id do nó — permite reusar o mesmo objeto entre renders
  // (só atualizando ícone/posição quando algo muda) em vez de destruir e recriar tudo a cada
  // seleção, que é o que travava o mapa com muitos pontos expandidos.
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const cableRoutesRef = useRef<Map<string, GooglePolylineInstance>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const draftMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const selectionMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null);
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
  // O listener de clique no vazio do mapa também é atado uma única vez — precisa ler
  // sempre a seleção e o callback de deseleção atuais (ver efeito abaixo).
  const onDeselectRef = useRef(onDeselect);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const nodeByIdRef = useRef<Map<string, GeoTreeNode>>(new Map());
  const [mapsReady, setMapsReady] = useState(false);

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
    onDeselectRef.current = onDeselect;
  }, [onDeselect]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

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
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          scaleControl: true,
          styles: MAP_STYLES,
        });
        mapRef.current.addListener('click', (event: GoogleMapMouseEvent) => {
          // Clique fora de qualquer item: o balão sai. Cliques em marker ou
          // polyline não chegam aqui, então o balão só fecha no vazio do mapa.
          closeBalloonRef.current();
          // Com uma seleção ativa, o vazio do mapa desseleciona (tira o alfinete e
          // fecha o detalhe) — igual ao Google Maps. Só sem seleção é que o clique
          // larga um rascunho de endereço para cadastrar um site novo ali.
          if (selectedNodeIdRef.current) {
            onDeselectRef.current();
            return;
          }
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          reverseGeocode(lat, lng).then((address) => {
            onDraftAddress(address ?? {
              street: 'Ponto selecionado no mapa',
              city: 'Niteroi',
              stateOrProvince: 'RJ',
              country: 'BR',
              coordinates: [lng, lat],
              label: `Ponto selecionado [${lng.toFixed(5)}, ${lat.toFixed(5)}]`,
            });
          });
        });
        // `idle` dispara ao fim de todo pan/zoom (não a cada frame) — é aqui que
        // reportamos a região visível e a escala atual para o chamador decidir se
        // busca infra passiva por viewport (ver PASSIVE_INFRA_MAX_SCALE_METERS).
        mapRef.current.addListener('idle', () => {
          if (!mapRef.current) return;
          const zoom = mapRef.current.getZoom();
          const bounds = mapRef.current.getBounds();
          if (zoom === undefined || zoom === null || !bounds) return;
          const center = bounds.getCenter();
          const northEast = bounds.getNorthEast();
          const southWest = bounds.getSouthWest();
          // Preferimos o valor exato da barra de escala do Google (o que o usuário vê);
          // o cálculo por zoom/lat é só fallback se o controle não for encontrado no DOM.
          const scaleMeters = readGoogleScaleMeters(mapEl.current) ?? mapScaleMeters(zoom, center.lat());
          onViewportChangeRef.current(
            { minLng: southWest.lng(), minLat: southWest.lat(), maxLng: northEast.lng(), maxLat: northEast.lat() },
            scaleMeters,
          );
        });
        setMapsReady(true);
      })
      .catch(() => setMapsReady(false));
  }, [onDraftAddress]);

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
          marker.addListener('click', () => onSelectNodeRef.current(nodeByIdRef.current.get(node.id) ?? node));
          marker.addListener('mouseover', () => onHoverNodeRef.current(nodeByIdRef.current.get(node.id) ?? node));
          marker.addListener('mouseout', () => onHoverNodeRef.current(null));
          markersRef.current.set(node.id, marker);
        }
        const markerForNode = markersRef.current.get(node.id);
        if (markerForNode) activeMarkers.push(markerForNode);
        continue;
      }

      const icon = resourceIconFor(node.resourceType ?? '');
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
        marker.addListener('click', () => onSelectNodeRef.current(nodeByIdRef.current.get(node.id) ?? node));
        marker.addListener('mouseover', () => onHoverNodeRef.current(nodeByIdRef.current.get(node.id) ?? node));
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
    mapRef.current.panTo({ lng, lat });
  }, [draftAddress, mapsReady]);

  // Centralizar o mapa quando a hierarquia seleciona um item (Site ou recurso).
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !focusPoint) return;
    const [lng, lat] = focusPoint;
    mapRef.current.panTo({ lng, lat });
  }, [focusPoint, mapsReady]);

  // Alfinete do item selecionado — marca sem ambiguidade o que foi clicado por
  // último (árvore, mapa ou busca), distinto do "+" de rascunho e do pin do
  // Google. `clickable: false` deixa o clique passar para o marker do próprio
  // objeto por baixo (reseleção idempotente) em vez de o alfinete capturá-lo.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;
    const node = selectedNodeId ? nodeByIdRef.current.get(selectedNodeId) : undefined;
    const point = node ? treeNodePoint(node) : null;
    if (!point) {
      selectionMarkerRef.current?.setMap(null);
      selectionMarkerRef.current = null;
      return;
    }
    const [lng, lat] = point;
    const width = Math.round(SELECTION_PIN_HEIGHT * SELECTION_PIN_ASPECT);
    const iconOptions = {
      url: selectionPinDataUrl(SELECTION_PIN_HEIGHT),
      scaledSize: new maps.Size(width, SELECTION_PIN_HEIGHT),
      anchor: new maps.Point(width / 2, SELECTION_PIN_HEIGHT),
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
  }, [mapsReady, selectedNodeId, nodes]);

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
      const icon = resourceIconFor(node.resourceType ?? '');
      const path = route.map(([lng, lat]) => ({ lng, lat }));
      const existing = cableRoutesRef.current.get(node.id);

      if (existing) {
        existing.setPath(path);
        existing.setOptions({ strokeColor: icon.color, strokeWeight: CABLE_STROKE_WEIGHT[icon.code] ?? 2.5 });
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
      line.addListener('click', () => onSelectNodeRef.current(nodeByIdRef.current.get(node.id) ?? node));
      line.addListener('mouseover', () => onHoverNodeRef.current(nodeByIdRef.current.get(node.id) ?? node));
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

  if (!GOOGLE_MAPS_KEY) {
    return <FallbackMap nodes={nodes} draftAddress={draftAddress} onSelectNode={onSelectNode} />;
  }

  return (
    <>
      <div ref={mapEl} className="absolute inset-0 h-full w-full" />
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
          <h3 className="font-display text-[1rem] font-semibold leading-tight text-app-text">{balloon.title}</h3>
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
        Configure <strong className="text-app-text">VITE_GOOGLE_MAPS_API_KEY</strong> para ativar Google Maps.
      </div>
      {nodes.slice(0, 60).map((node, index) => {
        const isSite = node.kind === 'site';
        const icon = isSite
          ? siteIconFor(siteKindFromSpec({ category: node.siteCategory, name: node.sublabel }), (node.status as GeoStatus) ?? 'active')
          : resourceIconFor(node.resourceType ?? '');
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
        <div className="absolute left-[54%] top-[52%] z-20 flex h-10 w-10 items-center justify-center rounded-[14px] border-2 border-app-text bg-app-accent font-bold shadow-soft">+</div>
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
  onClose,
  onChanged,
  onCreateSubSite,
  searchBar,
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
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCreateSubSite: () => void;
  searchBar?: ReactNode;
}) {
  const eyebrow =
    target.kind === 'site'
      ? `Site · ${specById.get(target.site.siteSpecificationId)?.name ?? 'Tipo não informado'}`
      : target.node.sublabel ?? resourceIconFor(target.node.resourceType ?? '').label;
  const title = target.kind === 'site' ? target.site.name : target.node.label;

  const body =
    target.kind === 'site' ? (
      <SiteDetailBody
        site={target.site}
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
    <div className="flex items-center gap-2 border-b border-app-border px-3 py-3">
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Voltar para a hierarquia"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
          {eyebrow}
        </div>
        <h3 className="truncate font-display text-[1.05rem] font-semibold leading-tight text-app-text">{title}</h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Fechar detalhe"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet header={header} onClose={onClose}>
        <div className="px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    <div className="flex h-full w-[360px] max-w-[85vw] shrink-0 flex-col border-r border-app-border bg-app-panel">
      {searchBar}
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{body}</div>
    </div>
  );
}

// Corpo do detalhe de um Site: abas de visão geral, sub-locais, recursos
// hospedados, topologia e ciclo de vida. Extraído do antigo modal — o cabeçalho
// (título/eyebrow/fechar) agora é responsabilidade do GeoDetailPanel.
function SiteDetailBody({
  site,
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
  const { address, point } = useSitePlace(site);
  // O conteúdo do local vem do mesmo endpoint que alimenta a árvore, e só quando
  // o painel abre: sub-locais e recursos hospedados são os filhos diretos dele.
  const { subSites, resources } = useSiteChildren(site.id);
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

  return (
    <>
      {/* Sub-locais e Recursos levam contador: eles são a única porta de entrada
          para o que saiu da árvore, então o número precisa ser visível de fora. */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-app-border pb-3">
        {([
          ['overview', 'Visao geral', null],
          ['subsites', 'Sub-locais', subSites.length],
          ['resources', 'Recursos', resources.length],
          ['topology', 'Topologia', null],
          ['lifecycle', 'Ciclo de vida', null],
        ] as Array<[DetailTab, string, number | null]>).map(([id, label, count]) => (
          <button key={id} type="button" onClick={() => onTab(id)} className={`flex items-center gap-1.5 rounded-[999px] px-3 py-2 text-[0.82rem] font-semibold ${tab === id ? 'bg-app-accent text-app-text' : 'bg-app-accent-soft text-app-muted'}`}>
            {label}
            {count ? (
              <span className="rounded-[999px] bg-white/70 px-1.5 text-[0.68rem] font-semibold text-app-muted">{count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Info label="Tipo" value={`${spec?.name ?? '-'} · ${spec?.category ?? '-'}`} />
          <Info label="Status" value={statusLabel[site.status]} />
          <Info label="Endereço" value={address ? formatAddress(address) : 'Sem endereço'} />
          <Info
            label="Localização"
            value={point ? <CoordinateStreetView marker={siteStreetViewMarker(site, spec, point)} /> : 'Não localizado'}
          />
          <Info label="ParentSite" value={site.parentSite ? siteById.get(site.parentSite.id)?.name ?? site.parentSite.id : 'Nenhum'} />
          <Info label="ID" value={site.id} mono />
        </div>
      ) : null}

      {tab === 'subsites' ? (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[0.88rem] text-app-muted">
              Espaços internos deste local (sala, andar, gaveta). Não aparecem no mapa nem na
              hierarquia — abrem por aqui.
            </div>
            <button type="button" className="geo-btn primary shrink-0" onClick={onCreateSubSite}><Plus className="h-4 w-4" />Adicionar sub-local</button>
          </div>
          {subSites.length ? (
            <div className="grid gap-2">
              {subSites.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => {
                    const target = child.refId ? siteById.get(child.refId) : undefined;
                    if (target) onOpenSite(target);
                  }}
                  className="flex w-full items-center gap-3 rounded-[18px] border border-app-border px-4 py-3 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
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
                    <span className="block truncate text-[0.9rem] font-semibold text-app-text">{child.label}</span>
                    <span className="block truncate text-[0.78rem] text-app-muted">
                      {child.sublabel ?? 'Sub-local'} · {statusLabel[(child.status as GeoStatus) ?? 'active']}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">Abrir</span>
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
          <SimpleRows rows={site.relatedSite.map((rel) => [relationshipTypeLabel(rel.relationshipType), siteById.get(rel.id)?.name ?? rel.id, rel.id])} empty="Sem relações topológicas." />
          <div className="grid gap-3 rounded-[18px] border border-app-border p-4 md:grid-cols-[1fr_1fr_auto]">
            <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)} className="geo-input">
              {['fedBy', 'feeds', 'nearby', 'contains'].map((value) => <option key={value} value={value}>{relationshipTypeLabel(value)}</option>)}
            </select>
            <select value={relationshipTarget} onChange={(event) => setRelationshipTarget(event.target.value)} className="geo-input">
              <option value="">Site relacionado</option>
              {sites.filter((item) => item.id !== site.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="button" className="geo-btn primary justify-center" onClick={() => void addRelationship()}>Adicionar</button>
          </div>
        </div>
      ) : null}

      {tab === 'lifecycle' ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-[18px] border border-app-border p-4 md:grid-cols-[1fr_auto]">
            <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as GeoStatus)} className="geo-input">
              {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="geo-btn primary justify-center" onClick={() => void changeStatus()}>Mudar status</button>
          </div>
          <SimpleRows rows={events.map((event) => [new Date(event.eventTime).toLocaleString('pt-BR'), event.eventType, event.source])} empty="Sem eventos registrados." />
        </div>
      ) : null}

      {tab === 'resources' ? (
        <SiteResourcesTab resources={resources} onOpenResource={onOpenResource} />
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
  const icon = resourceIconFor(node.resourceType ?? '');
  const status = statusLabel[(node.status as GeoStatus) ?? 'active'];
  const streetViewTargets = streetViewTargetsForGeometry(node.geometry);
  const { children, loading } = useResourceChildren(node);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="Tipo" value={icon.label} />
        <Info label="Status" value={status} />
        <Info label="Endereço" value={node.detail?.address ?? 'Sem endereço'} />
        {streetViewTargets.map((target) => (
          <Info
            key={`${target.label ?? 'ponto'}:${target.point.join(',')}`}
            label={target.label ? `Localização · ${target.label}` : 'Localização'}
            value={<CoordinateStreetView marker={resourceStreetViewMarker(node, target.point)} />}
          />
        ))}
        {node.detail?.model ? <Info label="Modelo" value={node.detail.model} /> : null}
        {node.detail?.manufacturer ? <Info label="Fabricante" value={node.detail.manufacturer} /> : null}
        {node.detail?.serialNumber ? <Info label="Nº de série" value={node.detail.serialNumber} mono /> : null}
      </div>

      {node.hasChildren ? (
        <section>
          <h4 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            Recursos internos · {children.length}
          </h4>
          {children.length ? (
            <div className="grid gap-2">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => (child.refId ? onOpenResource(child.refId) : undefined)}
                  className="flex w-full items-center gap-3 rounded-[18px] border border-app-border px-4 py-2.5 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon resource={child.resourceType ?? ''} variant="badge" size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9rem] font-semibold text-app-text">{child.label}</span>
                    <span className="block truncate text-[0.78rem] text-app-muted">
                      {[resourceIconFor(child.resourceType ?? '').label, child.detail?.model, child.detail?.serialNumber]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">Abrir</span>
                </button>
              ))}
            </div>
          ) : loading ? (
            <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              Carregando recursos internos…
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
              Nenhum recurso interno registrado.
            </div>
          )}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => (node.refId ? onOpenResource(node.refId) : undefined)}
        className="geo-btn primary w-full justify-center"
      >
        Abrir no módulo Recursos
      </button>
    </div>
  );
}

// Filhos diretos de um recurso (ex.: portas de uma placa, fibras de um cabo).
// Só busca quando o próprio nó diz ter filhos — a maioria dos recursos é folha,
// e não vale a pena um round-trip por nada.
function useResourceChildren(node: GeoTreeNode): { children: GeoTreeNode[]; loading: boolean } {
  const [nodes, setNodes] = useState<GeoTreeNode[]>([]);
  const [loading, setLoading] = useState(node.hasChildren);

  useEffect(() => {
    let cancelled = false;
    setNodes([]);
    if (!node.hasChildren) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchTreeChildren(node.id)
      .then((page) => {
        if (cancelled) return;
        setNodes(page.nodes);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [node.id, node.hasChildren]);

  return { children: nodes, loading };
}

// Recursos hospedados no local, agrupados por planta. É aqui que vive tudo que
// saiu do mapa e da hierarquia: OLT, placa, porta, DIO e o equipamento de
// cliente. A fronteira Geo × Resource (C3) fica preservada — a lista é
// referencial e o detalhe abre no módulo Resource.
function SiteResourcesTab({
  resources,
  onOpenResource,
}: {
  resources: GeoTreeNode[];
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

  if (!groups.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Nenhum recurso registrado neste local.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {groups.map(({ plant, items }) => (
        <section key={plant}>
          <h4 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {plantLabel[plant]} · {items.length}
          </h4>
          <div className="grid gap-2">
            {items.map((resource) => {
              const icon = resourceIconFor(resource.resourceType ?? '');
              return (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => (resource.refId ? onOpenResource(resource.refId) : undefined)}
                  className="flex w-full items-center gap-3 rounded-[18px] border border-app-border px-4 py-2.5 text-left transition hover:border-app-accent-border hover:bg-app-accent-soft"
                >
                  <ResourceIcon resource={resource.resourceType ?? ''} variant="badge" size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9rem] font-semibold text-app-text">{resource.label}</span>
                    <span className="block truncate text-[0.78rem] text-app-muted">
                      {[icon.label, resource.detail?.model, resource.detail?.serialNumber].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] font-semibold text-app-muted">Abrir</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TypeManagementModal({ specs, onClose, onChanged }: { specs: GeoSpec[]; onClose: () => void; onChanged: () => Promise<void> }) {
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
          <thead><tr><Th>Nome</Th><Th>Categoria</Th><Th>Filhos permitidos</Th></tr></thead>
          <tbody>
            {specs.map((spec) => (
              <tr key={spec.id} className="border-t border-app-border">
                <td className="px-4 py-3 text-[0.88rem] font-semibold text-app-text">{spec.name}</td>
                <td className="px-4 py-3 text-[0.84rem] text-app-muted">{spec.category}</td>
                <td className="px-4 py-3 text-[0.84rem] text-app-muted">{spec.allowedChildSpecIds.length || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <input value={name} onChange={(event) => setName(event.target.value)} className="geo-input" placeholder="ex: Central Office" />
        <select value={category} onChange={(event) => setCategory(event.target.value as GeoSpec['category'])} className="geo-input">
          {['Region', 'FunctionalGroup', 'Site', 'SubSite'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="submit" className="geo-btn primary justify-center" disabled={saving || !name.trim()}>Criar</button>
      </form>
    </Modal>
  );
}

function Modal({ children, title, eyebrow, onClose, wide }: { children: ReactNode; title: string; eyebrow: string; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6">
      <div className={`max-h-[90vh] overflow-auto rounded-[26px] border border-app-border bg-white p-5 shadow-modal ${wide ? 'w-full max-w-[920px]' : 'w-full max-w-[720px]'}`}>
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{eyebrow}</div>
            <h3 className="mt-1 font-display text-[1.35rem] font-semibold text-app-text">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function CoordinateStreetView({ marker }: { marker: StreetViewMarker }) {
  const { point } = marker;
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono">[{point[0].toFixed(5)}, {point[1].toFixed(5)}]</span>
      <GoogleStreetViewButton marker={marker} />
    </span>
  );
}

function Info({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-[18px] border border-app-border p-4">
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{label}</div>
      <div className={`mt-1 text-[0.9rem] text-app-text ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function SimpleRows({ rows, empty }: { rows: string[][]; empty: string }) {
  if (!rows.length) return <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">{empty}</div>;
  return (
    <div className="overflow-auto rounded-[18px] border border-app-border">
      <table className="w-full border-collapse text-left">
        <tbody>{rows.map((row) => <tr key={row.join('|')} className="border-b border-app-border last:border-b-0">{row.map((cell, index) => <td key={`${cell}-${index}`} className="px-4 py-3 text-[0.86rem] text-app-muted first:font-semibold first:text-app-text">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-app-border px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{children}</th>;
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
// modal era o que fazia a página abrir devagar.
function useSitePlace(site: GeoSite): { address: GeoAddress | null; point: [number, number] | null } {
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [point, setPoint] = useState<[number, number] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAddress(null);
    setPoint(null);

    if (site.address?.id) {
      void getJson<GeoAddress>(`/v1/geo/addresses/${site.address.id}`)
        .then((data) => !cancelled && setAddress(data))
        .catch(() => undefined);
    }
    if (site.place?.id) {
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
  }, [site.address?.id, site.place?.id]);

  return { address, point };
}

// Conteúdo do local: os mesmos filhos diretos que a árvore mostraria, separados
// em sub-locais e recursos para as duas abas do modal.
function useSiteChildren(siteId: string): { subSites: GeoTreeNode[]; resources: GeoTreeNode[] } {
  const [nodes, setNodes] = useState<GeoTreeNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    setNodes([]);
    void fetchTreeChildren(`site:${siteId}`)
      .then((page) => !cancelled && setNodes(page.nodes))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return useMemo(
    () => ({
      subSites: nodes.filter((node) => node.kind === 'site'),
      resources: nodes.filter((node) => node.kind === 'resource'),
    }),
    [nodes],
  );
}

