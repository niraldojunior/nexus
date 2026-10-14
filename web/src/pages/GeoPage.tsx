import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoStatus, GeoSpec, GeoSite } from '../services/geoApi';
import { getJson, listGeoSites } from '../services/geoApi';
import { siteStatusLabel } from '../utils/geoLabels';
import { type MapBalloon } from './geo-tabs/MapOverlays';
import {
  treeNodePoint,
  treeNodeRoute,
  type GeoTreeNode,
  type MapBounds,
} from '../services/geoTreeApi';
import { reverseGeocode, resolveAddressByPlaceId, type DraftAddress } from '../utils/googleMaps';
import {
  RESOURCE_FOCUS_SCALE_METERS,
  SITE_FOCUS_SCALE_METERS,
  ADDRESS_FOCUS_SCALE_METERS,
  siteIconSizeForScale,
  resourceIconSizeForScale,
  type CoverageLevel,
} from '../utils/mapScale';
import { useCoverage } from '../hooks/useCoverage';
import { useMapTiles } from '../hooks/useMapTiles';
import { useMapSites } from '../hooks/useMapSites';
import { useMapLines } from '../hooks/useMapLines';
import { type MapTileFeature } from '../services/geoMapTileApi';
import { fetchTreeNode } from '../services/geoTreeApi';
import { useMapLayers } from '../hooks/useMapLayers';
import { useMapLayerCatalog } from '../hooks/useMapLayerCatalog';
import { useGeoViewState } from '../hooks/useGeoViewState';
import {
  visibleCoverageLayer,
  viewportInclude,
  visibleMapLineSelections,
  visibleMapSiteSourceIds,
  isMapFeatureVisible,
} from '../utils/mapLayers';
import {
  operationalIconFactsForTreeNode,
  resolveOperationalIcon,
  visualIdentityForTreeNode,
} from '../utils/pointIconPreview';
import {
  normalizeStudioGeoVisualConfig,
  resolveStudioGeoVisualStyle,
} from '../utils/studioGeoVisual';
import { coverageSwatchDataUrl } from '../utils/coverageColor';
import { projectAreaSwatchDataUrl } from '../utils/projectAreaColor';
import type { CoverageNeighborhood } from '../services/geoCoverageApi';
import { type FlyTarget } from '../utils/mapCamera';
import { type GeoViewContext, type MapCamera } from '../utils/geoViewState';
import { useGeoTree } from '../hooks/useGeoTree';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSession } from '../hooks/useSession';
import { MARKER_ICON_SIZE } from '../utils/resourceIcon';
import { useResourceTypeVisualIdentities } from '../hooks/useResourceTypeVisualIdentities';
import { SITE_ICON_SIZE } from '../utils/siteIcon';
import { useNavigation } from '../hooks/useNavigation';
import { parseNavigationParams } from '../utils/navigation';
import {
  AddressDetailPanel,
  type AddressLocationResolution,
  GeoSearchBar,
  HierarchySidebar,
  type HierarchySidebarTab,
  MapLoadingBar,
  Modal,
  ProjectDetailPanel,
  ResourcePanel,
  SitePanel,
  type AddressSearchError,
  type DropSimulation,
  type GeoSearchSelection,
} from './geo-tabs';
import { useGeoProjects } from '../hooks/useGeoProjects';
import {
  fetchProjectAreasAndSites,
  fetchProjectResources,
  fetchProjectSites,
  projectIdOfNode,
  removeProjectSite,
  type ProjectArea,
  type ProjectSite,
} from '../services/geoProjectApi';
import { type PortDropPreview, pathMidpoint, pathSpanMeters } from '../utils/dropSimulation';
import type { BottomSheetSnapState } from '../components/BottomSheet';
import {
  GoogleMapPanel,
  mapTileFeatureToNode,
  pointLayerForNode,
  pointStyleForNode,
} from './geo-tabs/GoogleMapPanel';

// Reexportado para quem monta o mapa isolado (testes) sem passar pela página.
export { GoogleMapPanel };

// Quantiza o centro da câmera em células cujo tamanho cresce quando o zoom diminui: pans
// pequenos não trocam a origem da busca (nem refazem a consulta), e o ruído de ponto flutuante
// some. Sem câmera válida, não há origem (a busca segue com o ranking legado).
function snapSearchOrigin(camera: MapCamera): { lat: number; lng: number } | null {
  const { lat, lng, zoom } = camera;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const step = zoom >= 15 ? 0.01 : zoom >= 12 ? 0.05 : zoom >= 9 ? 0.2 : 1;
  const snap = (value: number) => Number((Math.round(value / step) * step).toFixed(4));
  return { lat: snap(lat), lng: snap(lng) };
}

// Balão de hover de uma camada de cobertura (qualquer uma — GPON é hoje a única, mas o balão não
// sabe disso): a área sob o cursor, com os números da rede. Não é um item pontual (não tem ícone
// de local/recurso), então usa um swatch da cor de disponibilidade. O título e a linha de
// localização mudam com o nível (LOD): bairro mostra município/UF; município mostra só o UF;
// estado não repete o próprio nome. `layerLabel`/`unitLabel` vêm da camada publicada no Studio —
// sem eles, cai num rótulo neutro em vez de inventar "CDO" para uma camada que não é GPON.
function coverageBalloonOf(
  hover: { point: [number, number]; neighborhood: CoverageNeighborhood } | null,
  level: CoverageLevel | undefined,
  layerLabel: string | undefined,
): MapBalloon | null {
  if (!hover) return null;
  const { neighborhood, point } = hover;
  const unitLabel = neighborhood.unitLabel ?? 'Unidades';
  const pct = Math.round(neighborhood.availabilityRatio * 100);
  const title =
    level === 'uf'
      ? neighborhood.uf
      : level === 'city'
        ? neighborhood.city
        : neighborhood.neighborhood;
  const rows: Array<[string, string]> = [];
  if (level === 'city') rows.push(['Estado', neighborhood.uf]);
  else if (level !== 'uf') rows.push(['Município', `${neighborhood.city}/${neighborhood.uf}`]);
  rows.push(
    [unitLabel, String(neighborhood.unitTotal)],
    ['Disponíveis', `${neighborhood.unitAvailable} (${pct}%)`],
    ['Indisponíveis', String(neighborhood.unitUnavailable)],
    ['Área coberta', `${neighborhood.coveredAreaKm2.toFixed(2)} km²`],
  );
  // Takeup (portas ocupadas / totais) entra quando a carga trouxer o dado — hoje é null.
  if (neighborhood.portsTotal !== null && neighborhood.portsTotal > 0) {
    const used = neighborhood.portsUsed ?? 0;
    const take = Math.round((used / neighborhood.portsTotal) * 100);
    rows.push(['Takeup', `${used}/${neighborhood.portsTotal} (${take}%)`]);
  }
  return {
    key: `coverage:${neighborhood.neighborhoodKey}`,
    point,
    offset: [0, -12],
    iconUrl: coverageSwatchDataUrl(neighborhood.availabilityRatio),
    eyebrow: layerLabel ?? 'Cobertura',
    title,
    rows,
  };
}

// Balão de hover de uma mancha de Projeto (REQ-MOD01-017): classe (concentração/dispersão) e
// contagem de locais. Mesmo espírito de coverageBalloonOf — não é item pontual, usa swatch.
function projectAreaBalloonOf(
  hover: { point: [number, number]; area: ProjectArea } | null,
): MapBalloon | null {
  if (!hover) return null;
  const { area, point } = hover;
  const kindLabel = area.kind === 'concentration' ? 'Concentração' : 'Dispersão';
  const rows: Array<[string, string]> = [['Locais', String(area.siteCount)]];
  if (area.areaKm2 !== null) rows.push(['Área', `${area.areaKm2.toFixed(2)} km²`]);
  return {
    key: `project-area:${area.id}`,
    point,
    offset: [0, -12],
    iconUrl: projectAreaSwatchDataUrl(area.kind),
    eyebrow: 'Projeto',
    title: kindLabel,
    rows,
  };
}

// Alvo do painel de detalhe aberto por clique — Site ou Recurso, cada um com o
// corpo que sabe montar a partir dele (ver SiteDetailBody/ResourceDetailBody). O lado 'site'
// guarda só o id: `SitePanel` resolve todo o detalhe por id via `useSiteDetail`, e o catálogo
// `sites` só contém specs "container" (ver loadGeo) — um Site de spec folha (Ponto de
// Instalação, Cabinet) nunca estaria lá, então derivar o alvo dali deixava o painel sem abrir
// para esses casos (e para local de Projeto, sempre CUSTOMER_SITE).
type DetailTarget = { kind: 'site'; siteId: string } | { kind: 'resource'; node: GeoTreeNode };

// O que a doca mostra quando nem endereço (`addressLookup`) nem detalhe de Site/Recurso
// (`detailOpen`) está aberto — a hierarquia de sempre, ou um painel de Projeto de trabalho
// (REQ-MOD01-015). `site` é a janela de consulta/criação de local, aberta ao LADO do painel
// do projeto (estilo Salvos → Listas do Google Maps) — não o substitui. `mode: 'create'` é
// um novo local; `mode: 'view'` consulta/edita o `siteId` informado.
type ProjectSiteView = { mode: 'create' } | { mode: 'view'; siteId: string };
type DockView =
  { kind: 'hierarchy' } | { kind: 'project'; projectId: string; site: ProjectSiteView | null };

// Nenhum Site é Marker permanente: todos vêm como feature do InfraOverlay (issue #314).
const NO_MAP_NODES: GeoTreeNode[] = [];

// Página da lista de locais no painel de Projeto (REQ-MOD01-017), quando ele já tem manchas
// de concentração/dispersão geradas — o total real aparece via `project.siteCount`, não pelo
// tamanho desta página (um projeto como "Onitel - Brasília" tem 25 mil locais).
const PROJECT_PANEL_SITE_LIMIT = 200;

// Teto de locais de projeto buscados por bbox para o MAPA (distinto de PROJECT_PANEL_SITE_LIMIT,
// que é a página da lista do painel). Sem limite, um projeto com dezenas de milhares de locais
// (ex.: "Onitel - Brasília", 25.507) enchia o viewport com até VIEWPORT_MAX_RESULTS (10.000)
// google.maps.Marker reais — o gargalo que travava a interação com o mapa (issue #72).
const PROJECT_VIEWPORT_SITE_LIMIT = 1500;

// Teto defensivo do seletor de local pai (ver loadGeo abaixo). O servidor já recusa listas
// implícitas acima do seu próprio teto (400 LIST_TOO_LARGE — issue #291); este `limit` explícito
// é defesa em profundidade para nunca deixar essa chamada sair sem um, mesmo que o filtro de
// specs-container volte vazio por algum motivo futuro. O conjunto real é dezenas de sites
// (Region/CO/POP/Floor/Room…), bem abaixo deste teto.
const GEO_CONTAINER_SITE_LIMIT = 500;

// A partir daqui o pin individual de um local de Projeto sai do mapa: a mancha de concentração/
// dispersão do ProjectAreaOverlay já representa o conjunto (REQ-MOD01-017). Este corte é
// específico de Projeto (agregação de UI, não inibição de camada) — a visibilidade de infra
// passiva em si é 100% determinada pelo catálogo publicado do Studio GEO, sem corte global de
// escala (ver mapScale.ts).
const PROJECT_PIN_MAX_SCALE_METERS = 50;

// Só para o balão de Recurso (linha ~980) — status de Resource é um vocabulário à parte
// do de GeographicSite (ver siteStatusLabel/SITE_STATUS_OPTIONS em utils/geoLabels.ts),
// fora do escopo desta rodada de tradução.
const resourceStatusLabel: Record<GeoStatus, string> = {
  planned: 'Planejado',
  active: 'Ativo',
  suspended: 'Suspenso',
  terminated: 'Terminado',
};

export default function GeoPage({ onOpenMainMenu }: { onOpenMainMenu?: () => void } = {}) {
  const isMobile = useIsMobile();
  // Gate de UI para edição de Locais/Recursos (inventory.editor ou platform.admin) — repassado
  // a SitePanel e ResourcePanel, que por sua vez repassam às abas. O backend já barra a
  // escrita; este flag só evita o beco sem saída de um 403 depois de editar (ver plano
  // "Edição do painel de Recursos + gate de permissão por papel").
  const { canEdit } = useSession();
  const [sites, setSites] = useState<GeoSite[]>([]);
  const [specs, setSpecs] = useState<GeoSpec[]>([]);
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
    resolution?: AddressLocationResolution;
  } | null>(null);
  const [addressError, setAddressError] = useState<AddressSearchError | null>(null);
  // Drop simulado entre o endereço aberto na doca e a CDO escolhida na aba de
  // Viabilidade. Mora aqui, e não no painel, porque quem desenha é o mapa; o painel só
  // o produz e o apaga ao se desmontar (ver ViabilityTab).
  const [dropSimulation, setDropSimulation] = useState<DropSimulation | null>(null);
  // Trajeto do drop físico da Porta (homologação CDOE-02-ICARAI) — canal isolado de
  // `dropSimulation` (Viabilidade/Esquemático): este é traçado real de inventário, não
  // hipótese, e tem dois estilos (`active`/`muted`) em vez de um só. Ver ResourcePanel.
  const [portDropPreview, setPortDropPreview] = useState<PortDropPreview | null>(null);
  const [confirmDiscardProjectSite, setConfirmDiscardProjectSite] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // Painel empilhado de Porta (issue #171 Fase 3), aberto pela aba "Portas" de uma CTO —
  // mesmo precedente de Projeto→Local (`activeProjectSiteView`): no desktop os dois
  // painéis ficam lado a lado, no mobile um substitui o outro. Vive fora do `dockView`
  // porque o painel de Recurso é dirigido por `detailTarget`/`selectedNode`, não por ele.
  const [stackedPortNode, setStackedPortNode] = useState<GeoTreeNode | null>(null);
  // Colapso da hierarquia, hoisted de HierarchySidebar: precisa viver aqui para a
  // barra de pesquisa decidir se flutua sobre o mapa ou fica dentro da doca (ver
  // dockPanelOpen), e para não mudar quando o detalhe abre/fecha por cima dela —
  // é isso que faz a hierarquia "lembrar" o estado de antes ao fechar o detalhe.
  // Fechada por padrão em qualquer viewport: a página abre com o mapa limpo, e quem
  // reabre é o ícone da barra de pesquisa (ver onToggleHierarchy mais abaixo).
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(true);
  // Aba ativa da hierarquia (Hierarquia | Projetos, REQ-MOD01-015) — hoisted para
  // sobreviver a um painel de projeto se fechar e reabrir na mesma aba.
  const [hierarchyTab, setHierarchyTab] = useState<HierarchySidebarTab>('hierarchy');
  // Qual conteúdo a doca mostra quando nem endereço nem detalhe de Site/Recurso está
  // aberto (ver a cadeia de precedência no render): a hierarquia de sempre, o painel de
  // um Projeto ou o painel de criação/edição de um local exclusivo dele.
  const [dockView, setDockView] = useState<DockView>({ kind: 'hierarchy' });
  // Local escolhido no mapa para o novo local de um projeto (ver SitePanel/
  // onTogglePickOnMap) — só é consultado quando `pickingProjectSite` está ativo; o clique
  // no vazio do mapa entrega o resultado aqui em vez de abrir o painel de Endereço.
  const [pickingProjectSite, setPickingProjectSite] = useState(false);
  const [pickedProjectAddress, setPickedProjectAddress] = useState<DraftAddress | null>(null);
  const [projectSites, setProjectSites] = useState<ProjectSite[]>([]);
  const [projectSitesLoading, setProjectSitesLoading] = useState(false);
  // Total real de locais do projeto (servidor, COUNT(*) OVER() em projectSitePage) e se há
  // mais páginas além da já carregada — alimentam o "Carregar mais" do painel.
  const [projectSitesTotal, setProjectSitesTotal] = useState(0);
  const [projectSitesHasMore, setProjectSitesHasMore] = useState(false);
  const [projectSitesLoadingMore, setProjectSitesLoadingMore] = useState(false);
  // Incrementado após criar/remover um local do projeto para forçar um novo GET — os
  // demais estados (nome, descrição, ícone) já atualizam otimista via useGeoProjects.
  const [projectSitesReloadToken, setProjectSitesReloadToken] = useState(0);
  // Manchas de concentração/dispersão do projeto aberto (REQ-MOD01-017), geradas por
  // scripts/build-project-areas.mjs. Vazio quando o projeto não tem manchas geradas — nesse
  // caso o mapa mantém o comportamento de sempre (todos os locais, em qualquer escala).
  const [projectAreas, setProjectAreas] = useState<ProjectArea[]>([]);
  const hasProjectAreas = projectAreas.length > 0;
  // Locais do projeto visíveis no MAPA quando ele tem manchas geradas (busca por bbox, ver o
  // efeito abaixo) — distinto de `projectSites`, que nesse caso vira a página do painel.
  const [projectViewportSites, setProjectViewportSites] = useState<ProjectSite[]>([]);
  const projects = useGeoProjects();
  // Projeto (ou local de projeto) atualmente aberto na doca — `null` fora desse fluxo.
  const activeProjectId = dockView.kind !== 'hierarchy' ? dockView.projectId : null;
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
  // Nó inteiro (não só o id): igual ao alfinete de seleção, o balão precisa ler
  // label/sublabel/status/detail do nó sob o mouse — e um nó do InfraOverlay (canvas, Fase 3
  // da issue #69) nunca está em `mapNodes` (só Estação/Local de Projeto/selecionado ficam lá),
  // então re-derivar por id via `mapNodes.find()` nunca acharia o nó e o balão de hover de um
  // recurso/site do canvas sumiria silenciosamente.
  const [hoverNode, setHoverNode] = useState<GeoTreeNode | null>(null);

  const [scaleMeters, setScaleMeters] = useState<number | null>(null);
  // Região visível atual (identidade só muda no `idle`) — alimenta a busca de cobertura,
  // que roda acima de 100 m, não na de detalhe.
  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null);
  // Centro do mapa quantizado por faixa de zoom — origem de proximidade da busca. Só muda
  // quando o centro cruza para outra célula, evitando refetch por jitter de pan.
  const [searchOrigin, setSearchOrigin] = useState<{ lat: number; lng: number } | null>(null);

  // O catálogo resolve a identidade persistida do namespace. Nunca restauramos viewport sob
  // `pending`: o painel só é montado depois que o environmentId real estiver disponível.
  const mapLayerCatalog = useMapLayerCatalog();
  // Nome real de cada tipo de recurso, sempre a partir do catálogo modelado no Studio —
  // usado no eyebrow do balão de hover (ver useMemo `balloon`), nunca um dicionário fixo.
  const presentationForResourceType = useResourceTypeVisualIdentities();
  const environmentId = mapLayerCatalog.loading ? null : mapLayerCatalog.catalog.environmentId;
  const viewState = useGeoViewState(environmentId);

  // Chamado pelo mapa a cada `idle` (fim de pan/zoom) com os limites, a escala e a câmera
  // atuais — registra estado (bounds/scaleMeters, para infra passiva/cobertura, que já
  // debouncam e deduplicam por conta própria) e reporta a câmera para persistência.
  const handleViewportChange = useCallback(
    (bounds: MapBounds, meters: number, camera: MapCamera) => {
      setScaleMeters(meters);
      setViewportBounds(bounds);
      const next = snapSearchOrigin(camera);
      setSearchOrigin((current) =>
        current && next && current.lat === next.lat && current.lng === next.lng ? current : next,
      );
      viewState.reportCamera(camera);
    },
    [viewState.reportCamera],
  );

  const tree = useGeoTree();
  const { navParams, clearNav } = useNavigation();

  // Controle de camadas do mapa (RF-011, REQ-MOD01-011): liga/desliga fetch + render por
  // grupo, persistido em localStorage. `include` fica memoizado pelas flags que realmente
  // importam para o viewport — sem isso, `viewportInclude` devolveria uma referência de array
  // nova a cada render e o useEffect de useMapTiles reentraria em loop.
  const mapLayers = useMapLayers(mapLayerCatalog.catalog);
  const viewportShapesInclude = useMemo(
    () => viewportInclude(mapLayers.layers, mapLayerCatalog.catalog, scaleMeters),
    [mapLayers.layers, mapLayerCatalog.catalog, scaleMeters],
  );
  // Papel funcional (siteRole, C11) por code de spec, para o seletor de camadas roteirar cada
  // feature de site para o grupo certo (Sites de Rede / Sites de Serviço) sem depender de
  // coluna nova em geo_map_feature (ver isMapFeatureVisible).
  const siteRoleByCode = useMemo(
    () => new Map(specs.map((spec) => [spec.code, spec.siteRole] as const)),
    [specs],
  );

  // Infraestrutura de viewport é decidida exclusivamente pelo catálogo publicado, preferência
  // do usuário e faixa de escala. O canvas mantém-se separado dos Marker/Polyline de `mapNodes`.
  const passiveInfraVisible =
    viewportShapesInclude === undefined || viewportShapesInclude.length > 0;
  // Régua de escala própria dos pins de local de Projeto com manchas geradas (REQ-MOD01-017) —
  // mais restrita que a infra passiva comum (ver PROJECT_PIN_MAX_SCALE_METERS).
  const projectPinScaleVisible = scaleMeters !== null && scaleMeters < PROJECT_PIN_MAX_SCALE_METERS;
  // Resources: índice por tile z16 (cache local). Sites: leitura única por bbox, uniforme para
  // qualquer GeographicSiteSpecification pontual publicada (issue #314) — sem exceção por tipo.
  const { data: resourceFeatures, loading: viewportLoading } = useMapTiles(
    viewportBounds,
    scaleMeters,
    viewportShapesInclude,
    mapLayers.layers,
    siteRoleByCode,
    mapLayerCatalog.catalog,
  );
  const siteSourceIds = useMemo(
    () => visibleMapSiteSourceIds(mapLayers.layers, mapLayerCatalog.catalog, scaleMeters, specs),
    [mapLayers.layers, mapLayerCatalog.catalog, scaleMeters, specs],
  );
  const { features: siteFeaturesRaw, loading: sitesLoading } = useMapSites(
    mapLayerCatalog.loading ? null : viewportBounds,
    siteSourceIds,
  );
  const siteFeatures = useMemo(
    () =>
      siteFeaturesRaw.filter((feature) =>
        isMapFeatureVisible(
          feature,
          mapLayers.layers,
          siteRoleByCode,
          mapLayerCatalog.catalog,
          scaleMeters,
        ),
      ),
    [siteFeaturesRaw, mapLayers.layers, siteRoleByCode, mapLayerCatalog.catalog, scaleMeters],
  );
  // Linhas: uma leitura agregada por viewport, um LOD por camada/faixa (issue #317).
  const lineSelections = useMemo(
    () => visibleMapLineSelections(mapLayers.layers, mapLayerCatalog.catalog, scaleMeters),
    [mapLayers.layers, mapLayerCatalog.catalog, scaleMeters],
  );
  const {
    features: lineFeaturesRaw,
    truncated: linesTruncated,
    stale: linesStale,
  } = useMapLines(mapLayerCatalog.loading ? null : viewportBounds, lineSelections);
  const lineFeatures = useMemo(
    () =>
      lineFeaturesRaw.filter((feature) =>
        isMapFeatureVisible(
          feature,
          mapLayers.layers,
          siteRoleByCode,
          mapLayerCatalog.catalog,
          scaleMeters,
        ),
      ),
    [lineFeaturesRaw, mapLayers.layers, siteRoleByCode, mapLayerCatalog.catalog, scaleMeters],
  );
  const infraFeatures = useMemo(
    () => [...siteFeatures, ...resourceFeatures, ...lineFeatures],
    [siteFeatures, resourceFeatures, lineFeatures],
  );
  const siteMarkerSize = siteIconSizeForScale(scaleMeters);
  const resourceMarkerSize = resourceIconSizeForScale(scaleMeters);
  // Nenhum Site é Marker permanente: todos entram no InfraOverlay. `nodes` do painel fica vazio;
  // só o item selecionado ganha Marker próprio (`pinnedSelectedNode`).
  const mapNodes = NO_MAP_NODES;
  const stationMarkerSize = siteMarkerSize;

  // Locais do Projeto de trabalho aberto (REQ-MOD01-015), desenhados por ProjectSiteOverlay
  // (canvas — substitui até 1.500 Marker DOM reais por pin, issue #72), NUNCA por
  // Marker/Polyline: por isso ficam fora de `mapNodes`, mesma separação que `infraFeatures` já
  // tem para o resto da infra passiva. Entram só enquanto a doca mostra aquele projeto. Com
  // manchas geradas (REQ-MOD01-017), o pin individual só entra até PROJECT_PIN_MAX_SCALE_METERS
  // (50 m) — em escala mais aberta, a mancha do overlay representa o conjunto — e vem de
  // `projectViewportSites` (buscado por bbox, já limitado a PROJECT_VIEWPORT_SITE_LIMIT), não
  // da página do painel. Sem manchas (projeto pequeno, `projectSites` é a lista inteira e já
  // cabe na página do painel), mantém a régua de sempre da infra passiva (< 200 m).
  const projectSiteFeatures = useMemo(() => {
    const projectSitesVisible =
      activeProjectId !== null && (hasProjectAreas ? projectPinScaleVisible : passiveInfraVisible);
    if (!projectSitesVisible) return [];
    return hasProjectAreas ? projectViewportSites : projectSites;
  }, [
    activeProjectId,
    hasProjectAreas,
    projectPinScaleVisible,
    passiveInfraVisible,
    projectSites,
    projectViewportSites,
  ]);

  // O item selecionado é imune à escala e ao viewport: recurso e cabo do canvas só existem em
  // `infraFeatures`, e sem isto afastar o mapa (ou arrastá-lo até a borda) apagaria o
  // Marker/Polyline real dele (InfraOverlay nunca desenha o selecionado — ver excludeNodeId).
  // CO já vem sempre em `tree.mapNodes`, então isto só é não-nulo quando o nó selecionado
  // realmente sumiu de `mapNodes` — um Marker isolado (ver GoogleMapPanel), que troca sem
  // reprocessar os N marcadores normais a cada clique (issue #72).
  const pinnedSelectedNode = useMemo(() => {
    if (!selectedNode?.geometry) return null;
    const selectedVisible = selectedNode.kind === 'site' || passiveInfraVisible;
    return selectedVisible ? selectedNode : null;
  }, [selectedNode, passiveInfraVisible]);

  // Cobertura da viewport (mapa de calor por bairro), só acima de 100 m. `visibleCoverageLayer`
  // resolve visibilidade e identidade da camada de uma vez, por `entity.category === 'COVERAGE'`
  // — GPON é hoje o único gerador de dados, mas a página não sabe disso. Camada de cobertura
  // desligada corta a busca inteira: bounds nulo já limpa `coverage` e zera o dedupe interno do
  // hook, então religar refaz o fetch sem precisar mexer no mapa. Com duas camadas COVERAGE
  // ligadas ao mesmo tempo, ganha a primeira em ordem de desenho — só uma mancha por vez.
  const coverageLayer = visibleCoverageLayer(
    mapLayers.layers,
    mapLayerCatalog.catalog,
    scaleMeters,
  );
  const coverageVisible = Boolean(coverageLayer);
  const coverageLayerRef = useMemo(
    () =>
      coverageLayer
        ? { sourceType: coverageLayer.entity.sourceType, sourceId: coverageLayer.entity.sourceId }
        : null,
    [coverageLayer],
  );
  const { data: coverage, loading: coverageLoading } = useCoverage(
    coverageVisible ? viewportBounds : null,
    scaleMeters,
    coverageVisible,
    coverageLayerRef,
  );
  // Nem toda camada de cobertura expõe status por área em runtime — a cor resolvida cai sempre
  // no `defaultColor` da regra publicada quando não há, sem inventar um estado que a fonte não
  // fornece.
  const coverageStyle = useMemo(() => {
    if (!coverageLayer?.visualConfig) return undefined;
    const config = normalizeStudioGeoVisualConfig(
      coverageLayer.visualConfig,
      coverageLayer.entity,
      coverageLayer.label,
    );
    if (config.geometryKind !== 'POLYGON') return undefined;
    const resolved = resolveStudioGeoVisualStyle(
      config,
      coverageLayer.entity.category,
      null,
      scaleMeters,
    );
    return resolved.geometryKind === 'POLYGON' ? resolved : undefined;
  }, [coverageLayer, scaleMeters]);
  // Bairro sob o cursor sobre a mancha — vira o balão de hover (ver coverageBalloon).
  const [coverageHover, setCoverageHover] = useState<{
    point: [number, number];
    neighborhood: CoverageNeighborhood;
  } | null>(null);
  // Some com o balão de cobertura ao descer abaixo de 50 m (a mancha sai de cena).
  useEffect(() => {
    if (!coverageVisible) setCoverageHover(null);
  }, [coverageVisible]);

  // Mancha do Projeto sob o cursor — vira o balão de hover (ver projectAreaBalloonOf).
  const [projectAreaHover, setProjectAreaHover] = useState<{
    point: [number, number];
    area: ProjectArea;
  } | null>(null);
  // Some com o balão ao fechar o projeto ou ao perder as manchas (regeração/erro).
  useEffect(() => {
    if (!hasProjectAreas) setProjectAreaHover(null);
  }, [hasProjectAreas]);

  // Qualquer camada do mapa ainda em voo — vira a barra de progresso no topo do mapa (ver
  // MapLoadingBar). Cargas internas dos painéis (Viabilidade, GEONET, eventos) têm spinner
  // próprio dentro da doca e não entram aqui. O script do Google Maps é rastreado dentro do
  // GoogleMapPanel (mapsReady) e somado à barra por lá.
  const mapDataLoading =
    loading ||
    tree.busy ||
    mapLayerCatalog.loading ||
    viewportLoading ||
    sitesLoading ||
    coverageLoading;

  const selectedSiteId =
    selectedNode?.referredType === 'GeographicSite' ? (selectedNode.refId ?? null) : null;
  const selectedResourceNode = selectedNode?.kind === 'resource' ? selectedNode : null;
  // Alvo do painel de detalhe — deriva da mesma seleção usada pelo mapa e pela
  // árvore, então abrir por clique ou por deep-link (navParams) é o mesmo caminho.
  const detailTarget = useMemo<DetailTarget | null>(() => {
    if (selectedSiteId) return { kind: 'site', siteId: selectedSiteId };
    if (selectedResourceNode) return { kind: 'resource', node: selectedResourceNode };
    return null;
  }, [selectedSiteId, selectedResourceNode]);
  // Troca de CTO (ou fechamento do painel de Recurso) desfaz o empilhamento de Porta —
  // senão a Porta da CTO anterior ficaria pendurada ao lado da CTO nova.
  const detailResourceNodeId =
    detailOpen && detailTarget?.kind === 'resource' ? detailTarget.node.id : null;
  useEffect(() => {
    setStackedPortNode(null);
  }, [detailResourceNodeId]);
  const mobilePanelKey = !isMobile
    ? null
    : addressLookup
      ? `address:${addressLookup.address.coordinates.join(',')}`
      : detailOpen && detailTarget
        ? detailTarget.kind === 'site'
          ? `site:${detailTarget.siteId}`
          : `resource:${detailTarget.node.id}`
        : dockView.kind === 'project'
          ? dockView.site
            ? `project-site:${dockView.projectId}:${dockView.site.mode === 'view' ? dockView.site.siteId : 'new'}`
            : `project:${dockView.projectId}`
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
  // Catálogo de locais: as specs são dezenas de linhas e alimentam os modais de
  // cadastro e detalhe (via `parentOptions` em SiteOverviewTab, para o seletor de
  // local pai). `sites`, porém, deixou de ser "dezenas de linhas" — 62 mil
  // Installation Points de uma carga só já bastam para travar a página (a
  // consulta sem filtro nem tinha LIMIT). Especificações-folha (sem
  // allowedChildSpecIds, ex.: Installation Point, Cabinet) nunca são pai de
  // ninguém, então nunca precisam entrar aqui — só as que podem conter algo
  // (Region, CO, POP, Floor, Room…), um conjunto que cresce com a topologia da
  // rede, não com a quantidade de pontos de instalação. O acervo pesado
  // (endereços, geometrias e a planta inteira) não vem por aqui de qualquer
  // forma — cada nó da árvore traz a sua geometria, e o resto se busca por id
  // quando o modal abre.
  const loadGeo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const specData = await getJson<GeoSpec[]>('/v1/geo/site-specifications');
      const containerSpecIds = specData
        .filter((spec) => spec.allowedChildSpecIds.length > 0)
        .map((spec) => spec.id);
      // Sem spec-container nenhuma não existe local pai válido para o seletor — desistir é a
      // resposta certa (ver comentário acima de loadGeo), não um fallback para buscar tudo.
      const siteData =
        containerSpecIds.length > 0
          ? await listGeoSites({
              siteSpecificationIds: containerSpecIds,
              limit: GEO_CONTAINER_SITE_LIMIT,
            })
          : [];
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

  // Manchas do projeto aberto (REQ-MOD01-017) e a primeira página de locais do painel — o
  // teto do servidor é 100 por página (ver GET /v1/geo/projects/:id/sites em app.ts);
  // `loadMoreProjectSites` abaixo busca as páginas seguintes. `projectSitesReloadToken`
  // força um novo GET (da primeira página) após criar/remover um local.
  useEffect(() => {
    if (!activeProjectId) {
      setProjectAreas([]);
      setProjectSites([]);
      setProjectSitesTotal(0);
      setProjectSitesHasMore(false);
      return;
    }
    let cancelled = false;
    setProjectSitesLoading(true);
    // Disparadas em paralelo: `areas` não decide mais o `limit` da lista do painel (o
    // servidor já pagina a no máximo 100 linhas de qualquer forma) — pedir sempre
    // PROJECT_PANEL_SITE_LIMIT (200, clampado a 100 no servidor) remove a dependência serial
    // sem mudar o que o painel mostra, e corta pela metade a fila de requisições da abertura
    // (backend local atende em série — AGENTS.md §3). `fetchProjectAreasAndSites` dedupe por
    // projectId (StrictMode monta este efeito duas vezes, e reabrir o mesmo projeto rápido
    // remonta de novo) — issue #72.
    void fetchProjectAreasAndSites(activeProjectId, { limit: PROJECT_PANEL_SITE_LIMIT })
      .then(([areas, page]) => {
        if (cancelled) return;
        setProjectAreas(areas);
        setProjectSites(page.items);
        setProjectSitesTotal(page.total);
        setProjectSitesHasMore(page.hasMore);
      })
      .catch(() => {
        if (!cancelled) {
          setProjectAreas([]);
          setProjectSites([]);
          setProjectSitesTotal(0);
          setProjectSitesHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setProjectSitesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, projectSitesReloadToken]);

  // "Carregar mais" do painel (ProjectDetailPanel) — busca a próxima página a partir do
  // offset já carregado e acrescenta, nunca refaz a lista inteira. Mesmo espírito de
  // useGeoTree.loadMore, mas sem o dedupe por chave: só um "Carregar mais" fica visível por
  // vez (o botão já desativa via `sitesLoadingMore`), não há como disparar duas requisições
  // concorrentes pelo mesmo clique.
  const loadMoreProjectSites = useCallback(() => {
    if (!activeProjectId || projectSitesLoadingMore) return;
    setProjectSitesLoadingMore(true);
    void fetchProjectSites(activeProjectId, {
      limit: PROJECT_PANEL_SITE_LIMIT,
      offset: projectSites.length,
    })
      .then((page) => {
        setProjectSites((current) => [...current, ...page.items]);
        setProjectSitesTotal(page.total);
        setProjectSitesHasMore(page.hasMore);
      })
      .finally(() => setProjectSitesLoadingMore(false));
  }, [activeProjectId, projectSitesLoadingMore, projectSites.length]);

  // Locais do projeto VISÍVEIS NO MAPA, quando ele tem manchas geradas: busca por bbox (mesmo
  // padrão de handleViewportChange/viewportInfra), só ativa em ≤ PROJECT_PIN_MAX_SCALE_METERS —
  // em escala mais aberta, a mancha do overlay já representa o conjunto. Sem manchas, o mapa usa
  // `projectSites` (lista completa) diretamente, como sempre. `limit` é obrigatório: sem ele, um
  // projeto com dezenas de milhares de locais devolvia até VIEWPORT_MAX_RESULTS (10.000) —
  // outros tantos google.maps.Marker reais, o gargalo que travava o mapa (issue #72).
  const projectViewportFetchTokenRef = useRef(0);
  const projectViewportDebounceRef = useRef<number | undefined>(undefined);
  const lastProjectViewportKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProjectId || !hasProjectAreas || !viewportBounds || !projectPinScaleVisible) {
      if (projectViewportDebounceRef.current !== undefined) {
        window.clearTimeout(projectViewportDebounceRef.current);
        projectViewportDebounceRef.current = undefined;
      }
      lastProjectViewportKeyRef.current = null;
      setProjectViewportSites([]);
      return;
    }
    const key = [
      activeProjectId,
      viewportBounds.minLng,
      viewportBounds.minLat,
      viewportBounds.maxLng,
      viewportBounds.maxLat,
    ]
      .map((value) => (typeof value === 'number' ? value.toFixed(4) : value))
      .join(',');
    if (key === lastProjectViewportKeyRef.current) return;
    if (projectViewportDebounceRef.current !== undefined) {
      window.clearTimeout(projectViewportDebounceRef.current);
    }
    projectViewportDebounceRef.current = window.setTimeout(() => {
      lastProjectViewportKeyRef.current = key;
      const token = ++projectViewportFetchTokenRef.current;
      void fetchProjectSites(activeProjectId, {
        bounds: viewportBounds,
        limit: PROJECT_VIEWPORT_SITE_LIMIT,
      })
        .then((page) => {
          if (projectViewportFetchTokenRef.current === token) setProjectViewportSites(page.items);
        })
        .catch(() => {
          if (projectViewportFetchTokenRef.current === token) setProjectViewportSites([]);
        });
    }, 250);
    return () => {
      if (projectViewportDebounceRef.current !== undefined) {
        window.clearTimeout(projectViewportDebounceRef.current);
      }
    };
  }, [activeProjectId, hasProjectAreas, viewportBounds, projectPinScaleVisible]);

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
    (node: GeoTreeNode, from: 'search' | 'tree' | 'map' | 'restore' = 'tree') => {
      setError(null);
      setSelectedNode(node);
      setDraftAddress(null);
      setAddressLookup(null);
      // Sai do fluxo de Projeto de trabalho: uma seleção normal (busca, árvore ou mapa)
      // volta a doca para a Hierarquia, para não deixar um painel de projeto grudado no
      // fundo depois que o usuário já mudou de assunto (ver dockView).
      setDockView({ kind: 'hierarchy' });
      // Restauração (issue #182): o mapa já nasceu na câmera salva (ver GoogleMapPanel
      // `initialView`) — pedir um voo aqui reenquadraria por cima da posição que acabou de
      // ser restaurada, com o zoom de chegada do tipo do item em vez do zoom salvo.
      if (from !== 'restore') {
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
      }
      if (from === 'map') {
        window.setTimeout(() => {
          tree.revealNode(node.id, { expandSelf: node.hasChildren });
        }, 80);
      } else {
        tree.revealNode(node.id, { expandSelf: node.hasChildren });
      }
      if (node.kind === 'site' || node.kind === 'resource') {
        setDetailOpen(true);
        // Nome e identidade do item vão para a barra como seleção confirmada.
        setQuery(node.label);
        setSearchSelection({ type: 'node', node });
      } else {
        setDetailOpen(false);
        setSearchSelection(null);
      }
    },
    // Só usa `tree.revealNode` (que já é estável) — depender do objeto `tree` inteiro
    // tornaria `selectNode` (e tudo que a referencia: openProjectSite,
    // selectNodeFromMap/Search/Tree) instável a cada render, já que `useGeoTree` devolvia
    // um objeto novo por render antes de ser memoizado.
    [tree.revealNode],
  );

  // "Abrir recurso" a partir de um id (link relacionado dentro de Site/CTO/Porta) — resolve o nó
  // via `fetchTreeNode` e seleciona dentro do próprio Mapa, sem sair de Geo (a antiga página de
  // Recursos, que recebia esse id como deep-link, foi removida do sidebar principal).
  const handleOpenResourceById = useCallback(
    (resourceId: string) => {
      void fetchTreeNode(`resource:${resourceId}`)
        .then((node) => selectNode(node, 'search'))
        .catch(() => {
          // Recurso pode não existir mais (terminado/excluído) ou não ser navegável nesta
          // árvore — ignora silenciosamente, o painel de origem continua aberto.
        });
    },
    [selectNode],
  );

  // Contexto persistido do mapa (issue #182): deriva do que está aberto na doca, na mesma
  // precedência do resto do arquivo — endereço e nó nunca coexistem (ver
  // onAddressFound/selectNode/onDeselect). Sem nada aberto cai em `{kind:'none'}`, e só o
  // viewport (câmera) segue sendo persistido.
  const viewContext = useMemo<GeoViewContext>(() => {
    if (addressLookup) {
      const [lng, lat] = addressLookup.address.coordinates;
      return {
        kind: 'address',
        source: addressLookup.source,
        lat,
        lng,
        placeId: addressLookup.address.placeId,
        query: addressLookup.address.sourceQuery,
        address: addressLookup.address,
      };
    }
    if (selectedNode?.refId && (selectedNode.kind === 'site' || selectedNode.kind === 'resource')) {
      return selectedNode.kind === 'site'
        ? { kind: 'site', siteId: selectedNode.refId }
        : { kind: 'resource', resourceId: selectedNode.refId };
    }
    return { kind: 'none' };
  }, [addressLookup, selectedNode]);

  useEffect(() => {
    viewState.setContext(viewContext);
    // `setContext` é a única peça estável de `viewState` (mesmo cuidado do
    // handleViewportChange acima) — o objeto inteiro mudaria de identidade a cada render.
  }, [viewContext, viewState.setContext]);

  // Suprime a próxima chamada de `setFocusRequest` do painel de Endereço
  // (onAddressLocationResolved) logo após uma restauração de contexto — ela voaria com
  // ADDRESS_FOCUS_SCALE_METERS por cima do zoom que acabou de ser restaurado.
  const suppressNextAddressFocusRef = useRef(false);

  // Restaura o contexto salvo (issue #182) na montagem: reconstrói a seleção de Site/Recurso
  // (via fetchTreeNode) ou o endereço aberto (do cache do storage ou por nova geocodificação).
  // Roda uma única vez — dedupe por ref, no espírito do StrictMode double-invoke documentado
  // em AGENTS.md §3, não por array de dependências (o efeito reage a `viewState.initialView`,
  // que só existe na primeira renderização). Deep-link de `?siteId=` vence: quando presente, a
  // restauração de contexto não mexe em nada — só o viewport (já aplicado via `initialView` do
  // mapa) permanece, e o efeito de deep-link abaixo decide a seleção.
  const restoredContextRef = useRef(false);
  useEffect(() => {
    if (restoredContextRef.current) return;
    restoredContextRef.current = true;

    const deepLinkParams = parseNavigationParams();
    if (deepLinkParams?.page === 'geo' && deepLinkParams.siteId) return;

    const context = viewState.initialView?.context;
    if (!context || context.kind === 'none') return;

    let cancelled = false;

    if (context.kind === 'site' || context.kind === 'resource') {
      const nodeId =
        context.kind === 'site' ? `site:${context.siteId}` : `resource:${context.resourceId}`;
      void fetchTreeNode(nodeId)
        .then((node) => {
          if (!cancelled) selectNode(node, 'restore');
        })
        .catch(() => {
          // Site/Recurso não existe mais (terminado ou excluído entre sessões) — o
          // viewport restaurado permanece, só sem seleção.
        });
      return () => {
        cancelled = true;
      };
    }

    suppressNextAddressFocusRef.current = true;
    const applyAddress = (address: DraftAddress) => {
      if (cancelled) return;
      setAddressLookup({
        address,
        source: context.source,
        resolution: {
          mode: 'automatic',
          selected: {
            coordinates: address.coordinates,
            source: 'google',
            precision: address.precision ?? 'Desconhecida',
            label: address.label,
          },
        },
      });
      setQuery(address.sourceQuery?.trim() || address.label);
      setSearchSelection({ type: 'address', address });
    };

    if (context.address) {
      applyAddress(context.address);
      return () => {
        cancelled = true;
      };
    }

    // Sem `DraftAddress` em cache (URL compartilhada, aba diferente da que gravou o
    // storage): re-geocodifica pelo placeId (mais preciso) e cai para reverse geocode do
    // ponto salvo; se os dois falharem, sintetiza o mínimo no mesmo formato do fallback de
    // clique no mapa (ver o listener `click` de GoogleMapPanel).
    void (context.placeId ? resolveAddressByPlaceId(context.placeId) : Promise.resolve(null))
      .then((outcome) => (outcome?.ok ? outcome.address : null))
      .catch(() => null)
      .then((address) => address ?? reverseGeocode(context.lat, context.lng).catch(() => null))
      .then((address) => {
        applyAddress(
          address ?? {
            street: 'Ponto salvo',
            country: 'BR',
            coordinates: [context.lng, context.lat],
            label:
              context.query || `Ponto salvo [${context.lng.toFixed(5)}, ${context.lat.toFixed(5)}]`,
          },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [viewState.initialView, selectNode]);

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
  // O chip da seleção fica sobre o mapa e acompanha a aparência publicada da camada. Árvore,
  // resultados e esquemático continuam usando NodeIcon no contexto de inventário.
  const selectedNodeIcon = useCallback(
    (node: GeoTreeNode) => {
      const facts = operationalIconFactsForTreeNode(node);
      const pointStyle = pointStyleForNode(node, mapLayerCatalog.catalog, scaleMeters);
      if (!facts || !pointStyle) return undefined;
      return resolveOperationalIcon(
        facts,
        visualIdentityForTreeNode(node, mapLayerCatalog.catalog),
        {
          size: 20,
          color: pointStyle.color,
          opacity: pointStyle.opacity,
        },
      );
    },
    [mapLayerCatalog.catalog, scaleMeters],
  );
  const openProjectSite = useCallback(
    (projectId: string, node: GeoTreeNode) => {
      if (!node.refId) return;
      // Projeto terminado (RF-010): o local já ganhou vida própria (Active, sem herdar mais
      // status do projeto) — abre o painel comum de Local, não o painel de projeto, que só
      // faz sentido enquanto o projeto está em curso. O vínculo em `geo_project_site`
      // continua existindo (é a Origem histórica do local), mas não é mais o dono dele.
      const project = projects.projects.find((item) => item.id === projectId);
      if (project?.status === 'terminated') {
        selectNode(node, 'map');
        return;
      }
      setSelectedNode(node);
      // Um painel de cada vez na doca: sem isto, o painel genérico de Local (detailTarget)
      // cobriria o par ProjectDetailPanel + SitePanel logo abaixo dele.
      setDetailOpen(false);
      const point = treeNodePoint(node);
      if (point) setFocusRequest({ point, scaleMeters: RESOURCE_FOCUS_SCALE_METERS });
      setDockView({ kind: 'project', projectId, site: { mode: 'view', siteId: node.refId } });
    },
    [projects.projects, selectNode],
  );

  const selectNodeFromMap = useCallback(
    (node: GeoTreeNode) => {
      // Clicar num pin de local do Projeto de trabalho aberto abre o painel unificado de Local
      // em contexto de projeto (SitePanel ao lado do ProjectDetailPanel), não o painel comum: o
      // Site não existe na Hierarquia (ver PROJECT_SITE_EXCLUSION_SQL). O vínculo viaja
      // carimbado no próprio nó (ver ProjectSite.projectId em geoProjectApi.ts) — não num Set
      // derivado de `projectSites`, que é só a página de 200 do painel e não cobre os pins que
      // vêm de `projectViewportSites` quando o projeto tem manchas geradas (REQ-MOD01-017).
      if (activeProjectId && projectIdOfNode(node) === activeProjectId) {
        openProjectSite(activeProjectId, node);
        return;
      }
      selectNode(node, 'map');
    },
    [activeProjectId, openProjectSite, selectNode],
  );

  // Foco automático ao abrir um Projeto de trabalho: entra direto num ponto útil em vez de
  // enquadrar o bbox inteiro (que, num projeto grande — ex. um estado — não diz nada de
  // acionável). Ordem de preferência: (1) mancha de maior concentração, quando o projeto tem
  // cobertura gerada (REQ-MOD01-017); (2) primeiro local da lista do painel, quando não há
  // cobertura; (3) primeiro recurso do projeto, quando não há sequer um local. Espera o
  // carregamento inicial de áreas/locais assentar (`projectSitesLoading`) para não focar
  // prematuramente com listas ainda vazias.
  //
  // Dispara UMA VEZ por projeto aberto (`autoFocusedProjectRef`): sem esse guard, qualquer
  // render com o projeto já carregado reexecuta o efeito e chama `setFocusRequest` com um
  // objeto novo (mesmo alvo, identidade diferente), o que o `flyTo` em GoogleMapPanel lê como
  // um pedido de voo novo (`previousFocus !== focusRequest`) e cancela qualquer pan/zoom manual
  // do usuário — a câmera fica "grudada" no centróide do projeto. `openProjectSite`/`selectNode`
  // são lidos por ref (não entram nas deps) porque não são estáveis entre renders.
  const openProjectSiteRef = useRef(openProjectSite);
  openProjectSiteRef.current = openProjectSite;
  const selectNodeRef = useRef(selectNode);
  selectNodeRef.current = selectNode;
  const autoFocusedProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProjectId) {
      autoFocusedProjectRef.current = null;
      return;
    }
    if (projectSitesLoading) return;
    if (autoFocusedProjectRef.current === activeProjectId) return;
    autoFocusedProjectRef.current = activeProjectId;
    let cancelled = false;

    if (hasProjectAreas) {
      const concentrations = projectAreas.filter((area) => area.kind === 'concentration');
      const candidates = concentrations.length > 0 ? concentrations : projectAreas;
      const largest = candidates.reduce((best, area) =>
        area.siteCount + (area.resourceCount ?? 0) > best.siteCount + (best.resourceCount ?? 0)
          ? area
          : best,
      );
      if (largest.centroid) {
        const outerRing = largest.geometry.coordinates[0] ?? [];
        const span = pathSpanMeters(outerRing);
        setFocusRequest(
          span > 0
            ? { point: largest.centroid, scaleMeters: null, fitSpanMeters: span }
            : { point: largest.centroid, scaleMeters: SITE_FOCUS_SCALE_METERS },
        );
        return;
      }
    }

    const firstSite = projectSites[0];
    if (firstSite) {
      openProjectSiteRef.current(activeProjectId, firstSite);
      return;
    }

    void fetchProjectResources(activeProjectId, { limit: 1 }).then((page) => {
      if (cancelled) return;
      const firstResource = page.items[0];
      if (firstResource) selectNodeRef.current(firstResource, 'search');
    });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, projectSitesLoading, hasProjectAreas, projectAreas, projectSites]);

  // Descarta uma hidratação em voo se o usuário selecionar outra coisa no meio do caminho
  // (clique rápido em duas features do canvas em sequência).
  const hydrateTokenRef = useRef(0);

  // Clique/hover resolvido pelo InfraOverlay (canvas do mapa, Fase 3 da issue #69): a feature
  // do índice de tile não tem `detail` nem (pra cabo) a rota inteira — ver mapTileFeatureToNode.
  //
  // O painel abre de forma otimista, direto do stub, e a reidratação (`fetchTreeNode`) corre em
  // paralelo só para corrigir o nó — nunca como porteiro. Esperar a hidratação antes de abrir
  // (como se fazia até o commit 58b6362) custava ~4s de percepção: o backend de dev atende
  // requisições em série (AGENTS.md §3), então esse `await` empurrava uma requisição inteira à
  // frente da que realmente enche o painel (useResourceDetail, disparada só na montagem do
  // ResourcePanel). Os dois casos que motivaram o porteiro continuam cobertos: LogicalResource é
  // barrado na hora pelo `referredType` que o próprio índice de tile já traz, e a entrada órfã
  // (recurso encerrado entre o build do índice e o clique) fecha o painel quando o 404 chega.
  const selectNodeFromInfraOverlay = useCallback(
    (feature: MapTileFeature) => {
      const stub = mapTileFeatureToNode(feature);
      if (stub.kind !== 'resource') {
        // Site (qualquer specification): abre pelo stub e hidrata pelo mesmo contrato canônico
        // dos Resources; falha na hidratação mantém o stub, sem fechar o painel.
        selectNode(stub, 'map');
        const siteToken = ++hydrateTokenRef.current;
        void fetchTreeNode(stub.id)
          .then((hydrated) => {
            if (hydrateTokenRef.current !== siteToken) return;
            setSelectedNode((current) => (current?.id === stub.id ? hydrated : current));
          })
          .catch(() => undefined);
        return;
      }
      // O índice de tile já classifica a entidade (mapTileFeatureToNode copia `entityType`), então
      // um LogicalResource nem chega a abrir o ResourcePanel — que depende do agregado físico.
      if (stub.referredType && stub.referredType !== 'PhysicalResource') {
        setSelectedNode(null);
        setDetailOpen(false);
        setSearchSelection(null);
        setError('Este tipo de recurso ainda não possui painel de detalhe no mapa.');
        return;
      }
      setError(null);
      selectNode(stub, 'map');
      const token = ++hydrateTokenRef.current;
      void fetchTreeNode(stub.id)
        .then((hydrated) => {
          if (hydrateTokenRef.current !== token) return;
          if (hydrated.referredType !== 'PhysicalResource') {
            setSelectedNode(null);
            setDetailOpen(false);
            setSearchSelection(null);
            setError('Este tipo de recurso ainda não possui painel de detalhe no mapa.');
            return;
          }
          // Só reencaminha se o canônico de fato acrescenta algo (rota inteira do cabo,
          // hasChildren real): reexecutar selectNode à toa remonta o painel e joga fora o
          // detalhe que já está carregando.
          setSelectedNode((current) => (current?.id === stub.id ? hydrated : current));
        })
        .catch((reason) => {
          if (hydrateTokenRef.current !== token) return;
          setSelectedNode(null);
          setDetailOpen(false);
          setSearchSelection(null);
          if (reason instanceof Error && reason.message.includes('(404)')) {
            setError('O recurso selecionado não está mais disponível no inventário.');
            return;
          }
          setError('Não foi possível carregar o recurso selecionado. Tente novamente.');
        });
    },
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
    setPortDropPreview(null);
    setDockView({ kind: 'hierarchy' });
    setPickingProjectSite(false);
    setPickedProjectAddress(null);
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
    // Centraliza no meio do traçado e enquadra o comprimento inteiro (`fitSpanMeters`),
    // para a simulação nascer inteira na tela mesmo com a folha mobile cobrindo parte do
    // mapa — o enquadramento pode afastar se o drop for maior que a área visível.
    if (midpoint) {
      setFocusRequest({
        point: midpoint,
        scaleMeters: null,
        fitSpanMeters: pathSpanMeters(simulation.path),
      });
    }
  }, []);

  // Trajeto do drop físico da Porta (homologação CDOE-02-ICARAI): mesmo padrão de
  // centralização de `onDropSimulation`, mas em canal isolado — o mapa e o painel de
  // Recurso já ficam lado a lado (flex row), então centralizar aqui já nasce "à direita
  // do painel" sem nenhum deslocamento horizontal novo.
  const onPortDropPreview = useCallback((preview: PortDropPreview | null) => {
    setPortDropPreview(preview);
    if (!preview) return;
    const midpoint = pathMidpoint(preview.path);
    if (midpoint) {
      setFocusRequest({
        point: midpoint,
        scaleMeters: null,
        fitSpanMeters: pathSpanMeters(preview.path),
      });
    }
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
    setPortDropPreview(null);
    setDockView({ kind: 'hierarchy' });
    setAddressLookup({
      address,
      source: 'search',
      resolution: {
        mode: 'automatic',
        selected: {
          coordinates: address.coordinates,
          source: 'google',
          precision: address.precision ?? 'Desconhecida',
          label: address.label,
        },
      },
    });
    setQuery(address.sourceQuery?.trim() || address.label);
    setSearchSelection({ type: 'address', address });
  }, []);

  // Base escolhida (GEONET por padrão na abertura, ou a que o usuário marcar na chave do
  // painel). A câmera pousa direto no alfinete escolhido e a barra de pesquisa passa a exibir
  // o endereço daquela fonte. Só o chip da busca muda — `addressLookup.address` é a entrada de
  // useGeonetAddress e mexer nela redispararia a consulta.
  const onAddressLocationResolved = useCallback((resolution: AddressLocationResolution) => {
    const active =
      resolution.mode === 'automatic' ? resolution.selected : resolution[resolution.selectedSource];
    setAddressLookup((current) => {
      if (!current || current.source !== 'search') return current;
      return { ...current, resolution };
    });
    // Uma restauração de contexto (issue #182) acabou de posicionar a câmera no zoom salvo —
    // essa primeira resolução não deve voar por cima dele (ver o efeito de restauração acima).
    if (suppressNextAddressFocusRef.current) {
      suppressNextAddressFocusRef.current = false;
    } else {
      setFocusRequest({ point: active.coordinates, scaleMeters: ADDRESS_FOCUS_SCALE_METERS });
    }
    setQuery(active.label);
    setSearchSelection((current) =>
      current?.type === 'address' && current.address.label !== active.label
        ? { type: 'address', address: { ...current.address, label: active.label } }
        : current,
    );
  }, []);

  const onAddressError = useCallback((err: AddressSearchError) => {
    setAddressError(err);
  }, []);

  // Clique no vazio do mapa — reverse geocode do ponto, que larga o "+" de rascunho
  // (`draftAddress`, o marcador visual do ponto escolhido) e abre o painel de endereço na
  // doca. Consulta é seleção: some qualquer nó em curso (mesma doca, um painel por vez) — é
  // a terceira porta de troca de seleção, junto do X da busca e de uma nova pesquisa. O
  // mapa só desenha o "+" para essa origem (`source: 'map'`) — o alfinete fica reservado à
  // busca, para não duplicar marcador na mesma coordenada (ver GoogleMapPanel e a prop
  // `addressPoint`).
  const onMapAddressFound = useCallback(
    (address: DraftAddress) => {
      // "Escolher no mapa" do painel unificado de Local (criação de local de projeto,
      // REQ-MOD01-015) desvia o clique para o painel em vez de abrir o de Endereço — a
      // doca não troca.
      if (pickingProjectSite) {
        setPickedProjectAddress(address);
        setPickingProjectSite(false);
        setFocusRequest({ point: address.coordinates, scaleMeters: null });
        return;
      }
      setSelectedNode(null);
      setDetailOpen(false);
      setAddressError(null);
      setDraftAddress(address);
      setDropSimulation(null);
      setPortDropPreview(null);
      setDockView({ kind: 'hierarchy' });
      setAddressLookup({ address, source: 'map' });
      // O ponto veio de um clique no mapa — já está à vista, então só recentraliza, sem
      // mexer no zoom. A centralização passa pelo mesmo voo dos demais focos (flyTo).
      setFocusRequest({ point: address.coordinates, scaleMeters: null });
      setQuery(address.label);
      setSearchSelection({ type: 'address', address });
    },
    [pickingProjectSite],
  );

  // Some quando o mouse sai do item; sem atraso perceptível, mas absorve o
  // instante entre uma linha da árvore e a próxima para o balão não piscar.
  const hoverTimeoutRef = useRef<number | undefined>(undefined);
  const handleHover = useCallback((node: GeoTreeNode | null) => {
    if (hoverTimeoutRef.current !== undefined) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = undefined;
    }
    if (node) {
      setHoverNode(node.geometry ? node : null);
    } else {
      hoverTimeoutRef.current = window.setTimeout(() => setHoverNode(null), 60);
    }
  }, []);

  // Volta a doca para a Hierarquia (aba Projetos, ver hierarchyTab) e limpa qualquer
  // estado do fluxo de local que ficou pendente — o excluir do menu ⋯ e a exclusão de
  // projeto passam por aqui.
  const closeProjectPanel = useCallback(() => {
    setDockView({ kind: 'hierarchy' });
    setSelectedNode(null);
    setPickingProjectSite(false);
    setPickedProjectAddress(null);
  }, []);

  // Fecha só a janela de consulta do local — o painel do projeto continua aberto ao lado
  // (estilo Salvos → Listas do Google Maps, ver DockView/ProjectSiteView). É o botão "X" do
  // SitePanel e, no mobile, o gesto de fechar a folha.
  const closeProjectSite = useCallback((projectId: string) => {
    setDockView({ kind: 'project', projectId, site: null });
    setPickingProjectSite(false);
    setPickedProjectAddress(null);
  }, []);

  // "+ Novo Projeto": cria e já abre o painel dele — é o pedido do usuário ("Ao clicar em
  // novo projeto, vamos abrir um novo painel específico para projeto").
  const handleCreateProject = useCallback(async () => {
    const project = await projects.create();
    setHierarchyTab('projects');
    setDockView({ kind: 'project', projectId: project.id, site: null });
  }, [projects]);

  const handleOpenProject = useCallback((projectId: string) => {
    setDockView({ kind: 'project', projectId, site: null });
  }, []);

  // Excluir projeto — pode vir da lista (ProjectListView, projeto fechado) ou do menu ⋯
  // dentro do próprio painel dele. Aguarda a resposta do servidor (pode conter locais
  // bloqueados que mantiveram o projeto vivo, issue #58): só fecha a doca quando o projeto
  // excluído é o aberto E o servidor confirmou `deleted: true`. Erro/summary propagam para o
  // chamador (ProjectListView/ProjectDetailPanel) mostrar o estado real, nunca `void`.
  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      const summary = await projects.remove(projectId);
      if (summary.deleted && dockView.kind !== 'hierarchy' && dockView.projectId === projectId) {
        closeProjectPanel();
      }
      return summary;
    },
    [projects, dockView, closeProjectPanel],
  );

  // Local recém-criado: sai do formulário direto para a consulta dele (não de volta para a
  // lista do projeto) — é a leitura natural do fluxo ("acabei de criar, quero ver o que
  // ficou"). `projectSitesReloadToken` força o próximo GET a incluir o local novo.
  //
  // `adjustSiteCount` atualiza a lista de Projetos (ProjectListView) na hora — sem ele o
  // contador ficava preso ao valor carregado no mount até um reload de página inteiro
  // (bug reportado); o `projects.reload()` em seguida reconcilia com o servidor sem
  // travar a UI (o `inFlight` do hook já deduplica sob StrictMode).
  const handleProjectSiteCreated = useCallback(
    (projectId: string, created: { site: GeoSite }) => {
      setProjectSitesReloadToken((token) => token + 1);
      projects.adjustSiteCount(projectId, 1);
      void projects.reload();
      setDockView({
        kind: 'project',
        projectId,
        site: { mode: 'view', siteId: created.site.id },
      });
    },
    [projects],
  );

  // Nome/tipo/observação editados no painel de consulta — só precisa de um novo GET; o
  // local aberto continua o mesmo (ver SitePanel.onChanged).
  const handleProjectSiteChanged = useCallback(() => {
    setProjectSitesReloadToken((token) => token + 1);
  }, []);

  // "Remover do projeto" dentro do painel de consulta: já resolvido no próprio painel (a
  // chamada DELETE já aconteceu), só falta fechar a janela e atualizar a lista.
  const handleProjectSiteRemoved = useCallback(
    (projectId: string) => {
      setProjectSitesReloadToken((token) => token + 1);
      projects.adjustSiteCount(projectId, -1);
      void projects.reload();
      closeProjectSite(projectId);
    },
    [closeProjectSite, projects],
  );

  // Excluir direto pela lista do painel do projeto (botão que aparece no hover, ver
  // ProjectDetailPanel) — sem abrir a janela de consulta primeiro. Fecha a janela também
  // se por acaso o local excluído for o que estava aberto.
  const handleQuickRemoveSite = useCallback(
    async (projectId: string, site: GeoTreeNode) => {
      if (!site.refId) return;
      await removeProjectSite(projectId, site.refId);
      setProjectSitesReloadToken((token) => token + 1);
      projects.adjustSiteCount(projectId, -1);
      void projects.reload();
      setDockView((current) =>
        current.kind === 'project' &&
        current.projectId === projectId &&
        current.site?.mode === 'view' &&
        current.site.siteId === site.refId
          ? { kind: 'project', projectId, site: null }
          : current,
      );
    },
    [projects],
  );

  // Nome real de cada GeographicSiteSpecification por código — para resolver o eyebrow do
  // balão de hover sem depender de tradução fixa: hovers do canvas só trazem o código
  // (issue #69 fase 3, ver map-feature-synchronizer.ts), então o nome configurado na
  // modelagem precisa ser buscado aqui, no mesmo catálogo que a página já carrega em `specs`.
  const siteSpecNameByCode = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const spec of specs) byCode.set(spec.code, spec.name);
    return byCode;
  }, [specs]);

  // Monta o conteúdo do balão de preview a partir do nó sob o mouse. Fica aqui,
  // e não no painel do mapa, porque é aqui que se sabe o que fazer com cada
  // tipo de item. Puro cartão de visita — tipo, endereço, status e modelo — sem
  // ação: quem abre o detalhe é o clique, não o hover.
  const balloon = useMemo<MapBalloon | null>(() => {
    const node = hoverNode;
    if (!node) {
      return (
        projectAreaBalloonOf(projectAreaHover) ??
        coverageBalloonOf(coverageHover, coverage?.level, coverageLayer?.label)
      );
    }
    // O painel de detalhe já mostra tipo/endereço/status do mesmo item — o
    // balão por cima seria redundante enquanto ele está aberto.
    if (detailOpen && selectedNode?.id === node.id) return null;
    const point = treeNodePoint(node);
    if (!point) return null;

    const facts = operationalIconFactsForTreeNode(node);
    if (!facts) return null;
    const pointStyle = pointStyleForNode(node, mapLayerCatalog.catalog, scaleMeters);
    const resolvedIcon = resolveOperationalIcon(
      facts,
      visualIdentityForTreeNode(node, mapLayerCatalog.catalog),
      {
        size: 40,
        color: pointStyle?.color,
        opacity: pointStyle?.opacity,
      },
    );

    if (node.kind === 'site') {
      // O pin do local é centrado na coordenada e cresce quando selecionado.
      const pinSize = SITE_ICON_SIZE + 8;
      const rows: Array<[string, string]> = [
        ['Endereço', node.detail?.address ?? 'Sem endereço'],
        ['Status', siteStatusLabel(node.status)],
      ];
      if (node.detail?.substatus) rows.push(['Substatus', node.detail.substatus]);
      if (node.detail?.model) rows.push(['Modelo', node.detail.model]);
      return {
        key: node.id,
        point,
        offset: [0, -(pinSize / 2 + 6)],
        iconUrl: resolvedIcon.url!,
        // A camada é uma coleção plural ("Estações", "Postes"); o balão descreve
        // uma entidade individual e, por isso, usa sempre o tipo de Site singular.
        // O rótulo é sempre o nome real configurado na modelagem (Studio) — nunca uma
        // tradução fixa. Hovers do canvas (issue #69 fase 3) só trazem o código da spec em
        // siteSpecificationCode/sublabel, então resolve pelo catálogo carregado (`specs`);
        // hovers da árvore já trazem o nome real em sublabel. Sem nenhum dos dois, cai no
        // rótulo genérico por categoria (dado ausente/corrompido).
        eyebrow:
          (node.siteSpecificationCode && siteSpecNameByCode.get(node.siteSpecificationCode)) ||
          node.sublabel ||
          'Local',
        title: node.label,
        rows,
      };
    }

    const status = resourceStatusLabel[(node.status as GeoStatus) ?? 'active'];
    // O nome do tipo vem sempre da modelagem/Studio:
    // 1. Nome do ResourceType via useResourceTypeVisualIdentities (a partir de sublabel ou resourceType).
    // 2. Rótulo da camada no Studio GEO (pointLayerForNode).
    // 3. sublabel (nome da ResourceSpecification).
    // 4. resourceType (código do tipo).
    // 5. 'Recurso' (fallback genérico final se nada for conhecido).
    const studioLayerLabel = pointLayerForNode(node, mapLayerCatalog.catalog)?.label;
    const resourceTypeTitle =
      (node.sublabel && presentationForResourceType(node.sublabel)?.name) ||
      (node.resourceType &&
        presentationForResourceType(node.resourceType.replace(/^category:/i, ''))?.name) ||
      studioLayerLabel ||
      node.sublabel ||
      node.resourceType ||
      'Recurso';
    // Cabo não tem pin: o balão nasce sobre o traçado, sem folga de ícone.
    const isCable = Boolean(treeNodeRoute(node));
    const rows: Array<[string, string]> = [
      ['Endereço', node.detail?.address ?? 'Sem endereço'],
      ['Status', status],
    ];
    if (node.detail?.substatus) rows.push(['Substatus', node.detail.substatus]);
    if (node.detail?.model) rows.push(['Modelo', node.detail.model]);
    return {
      key: node.id,
      point,
      // O ícone de equipamento é ancorado no canto inferior-esquerdo, então ele
      // fica acima e à direita da coordenada — o balão segue o ícone.
      offset: isCable ? [0, -8] : [MARKER_ICON_SIZE / 2, -(MARKER_ICON_SIZE + 4)],
      iconUrl: resolvedIcon.url!,
      eyebrow: resourceTypeTitle,
      title: node.label,
      rows,
    };
  }, [
    detailOpen,
    hoverNode,
    selectedNode?.id,
    coverageHover,
    coverage?.level,
    coverageLayer?.label,
    projectAreaHover,
    mapLayerCatalog.catalog,
    scaleMeters,
    siteSpecNameByCode,
    presentationForResourceType,
  ]);

  // Esc fecha o painel de detalhe — mas só quando nenhum outro modal está
  // aberto, senão a tecla fecharia os dois de uma vez.
  useEffect(() => {
    if (!detailOpen || addressError) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [addressError, detailOpen]);

  // Projeto do dockView atual, se houver — `undefined` enquanto a lista ainda carrega ou se
  // o projeto foi excluído em outra aba; nesse caso o render cai de volta para a Hierarquia.
  const activeProject =
    dockView.kind === 'project'
      ? projects.projects.find((project) => project.id === dockView.projectId)
      : undefined;
  // Local aberto ao lado do projeto (criação ou consulta), se houver.
  const activeProjectSiteView = dockView.kind === 'project' ? dockView.site : null;

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-transparent flex flex-col">
      <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-[#eef2f6]">
        {error ? (
          <div className="absolute left-5 top-5 z-40 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-[0.88rem] text-red-700 shadow-soft">
            {error}
          </div>
        ) : null}
        {linesStale ? (
          <div
            role="status"
            className="pointer-events-none absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.78rem] font-semibold text-app-text shadow-map-control"
          >
            Índice de linhas desatualizado — reindexe o mapa para ver as linhas.
          </div>
        ) : linesTruncated ? (
          <div
            role="status"
            className="pointer-events-none absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.78rem] font-semibold text-app-text shadow-map-control"
          >
            Linhas parciais — aproxime o mapa para ver todas.
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
              geonetEnabled={addressLookup.source === 'search'}
              onLocationResolved={onAddressLocationResolved}
            />
          ) : detailOpen && detailTarget?.kind === 'site' ? (
            // Painel unificado de Local (REQ-MOD01-016), aberto pela Hierarquia, busca ou
            // clique no mapa — a `key` força remontar ao trocar de site (senão a pilha
            // interna de drill-down em sub-locais sobreviveria de um site para outro).
            <SitePanel
              key={`site:${detailTarget.siteId}`}
              isMobile={isMobile}
              canEdit={canEdit}
              mode="view"
              siteId={detailTarget.siteId}
              project={null}
              specs={specs}
              sites={sites}
              pickedAddress={null}
              pickingOnMap={false}
              onTogglePickOnMap={() => undefined}
              onSnapChange={onMobileSheetSnapChange}
              minimizeSignal={sheetMinimizeSignal}
              // Voltar (‹) só fecha o painel — a seleção fica de pé, então a hierarquia
              // reaparece já expandida e rolada até o nó (ver HierarchyTreeView), com o
              // alfinete ainda no mapa. Desfazer a seleção por completo é o X da barra de
              // pesquisa (onClear) e, no mobile, arrastar a folha para baixo (onClose).
              onBack={() => setDetailOpen(false)}
              onClose={onDeselect}
              onCreated={() => undefined}
              onChanged={() => void loadGeo()}
              onOpenResource={handleOpenResourceById}
            />
          ) : detailOpen && detailTarget?.kind === 'resource' ? (
            <>
              {/* Mesmo precedente de Projeto→Local: no mobile as duas telas se substituem,
                  no desktop a Porta abre ao lado da CTO sem fechá-la. */}
              {!isMobile || !stackedPortNode ? (
                <ResourcePanel
                  key={detailTarget.node.id}
                  isMobile={isMobile}
                  canEdit={canEdit}
                  node={detailTarget.node}
                  onSnapChange={onMobileSheetSnapChange}
                  minimizeSignal={sheetMinimizeSignal}
                  onOpenResource={handleOpenResourceById}
                  onOpenPort={setStackedPortNode}
                  onBack={() => setDetailOpen(false)}
                  onClose={onDeselect}
                  onDropSimulation={onDropSimulation}
                  onPreview={handleHover}
                  onPortDropPreview={onPortDropPreview}
                />
              ) : null}
              {stackedPortNode ? (
                <ResourcePanel
                  key={stackedPortNode.id}
                  isMobile={isMobile}
                  canEdit={canEdit}
                  node={stackedPortNode}
                  onSnapChange={onMobileSheetSnapChange}
                  minimizeSignal={sheetMinimizeSignal}
                  onOpenResource={handleOpenResourceById}
                  onBack={() => setStackedPortNode(null)}
                  onClose={() => setStackedPortNode(null)}
                  onDropSimulation={onDropSimulation}
                  onPreview={handleHover}
                  onPortDropPreview={onPortDropPreview}
                />
              ) : null}
            </>
          ) : dockView.kind === 'project' && activeProject ? (
            <>
              {/* No mobile as duas telas se substituem (uma folha por vez); no desktop
                  ficam lado a lado, como Salvos → Listas do Google Maps: o painel do
                  projeto continua visível enquanto a janela do local está aberta. */}
              {!isMobile || !activeProjectSiteView ? (
                <ProjectDetailPanel
                  isMobile={isMobile}
                  canEdit={canEdit}
                  project={activeProject}
                  sites={projectSites}
                  sitesLoading={projectSitesLoading}
                  sitesTotal={projectSitesTotal}
                  hasMoreSites={projectSitesHasMore}
                  sitesLoadingMore={projectSitesLoadingMore}
                  onLoadMoreSites={loadMoreProjectSites}
                  areas={projectAreas}
                  selectedSiteId={
                    activeProjectSiteView?.mode === 'view' ? activeProjectSiteView.siteId : null
                  }
                  onSnapChange={onMobileSheetSnapChange}
                  minimizeSignal={sheetMinimizeSignal}
                  onUpdate={(patch) => projects.update(dockView.projectId, patch)}
                  onDelete={() => handleDeleteProject(dockView.projectId)}
                  onBack={closeProjectPanel}
                  onAddSite={() =>
                    setDockView({
                      kind: 'project',
                      projectId: dockView.projectId,
                      site: { mode: 'create' },
                    })
                  }
                  addSiteDisabled={activeProjectSiteView?.mode === 'create'}
                  onDiscardNewSite={() => closeProjectSite(dockView.projectId)}
                  onOpenSite={(site) => openProjectSite(dockView.projectId, site)}
                  onOpenResource={(resource) => selectNode(resource, 'search')}
                  onFocusArea={(area) => {
                    if (area.centroid) setFocusRequest({ point: area.centroid, scaleMeters: 1500 });
                  }}
                  onRemoveSite={(site) => void handleQuickRemoveSite(dockView.projectId, site)}
                  onResourceCreated={() => void projects.reload()}
                />
              ) : null}
              {activeProjectSiteView ? (
                <SitePanel
                  key={`${dockView.projectId}:${activeProjectSiteView.mode === 'view' ? activeProjectSiteView.siteId : 'new'}`}
                  isMobile={isMobile}
                  canEdit={canEdit}
                  mode={activeProjectSiteView.mode}
                  siteId={
                    activeProjectSiteView.mode === 'view' ? activeProjectSiteView.siteId : null
                  }
                  project={activeProject}
                  projectId={dockView.projectId}
                  specs={specs}
                  sites={sites}
                  pickedAddress={pickedProjectAddress}
                  pickingOnMap={pickingProjectSite}
                  onTogglePickOnMap={() => setPickingProjectSite((picking) => !picking)}
                  onSnapChange={onMobileSheetSnapChange}
                  minimizeSignal={sheetMinimizeSignal}
                  onClose={() => closeProjectSite(dockView.projectId)}
                  onRequestClose={(dirty) => {
                    if (dirty) setConfirmDiscardProjectSite(true);
                    else closeProjectSite(dockView.projectId);
                  }}
                  onCreated={(created) => handleProjectSiteCreated(dockView.projectId, created)}
                  onChanged={handleProjectSiteChanged}
                  onOpenResource={handleOpenResourceById}
                  onRemoveFromProject={
                    activeProjectSiteView.mode === 'view' && activeProject.status !== 'terminated'
                      ? async () => {
                          await removeProjectSite(dockView.projectId, activeProjectSiteView.siteId);
                          handleProjectSiteRemoved(dockView.projectId);
                        }
                      : undefined
                  }
                />
              ) : null}
            </>
          ) : (
            <HierarchySidebar
              tree={tree}
              selectedNodeId={selectedNode?.id ?? null}
              onSelect={selectNodeFromTree}
              onHover={handleHover}
              collapsed={hierarchyCollapsed}
              onCollapsedChange={setHierarchyCollapsed}
              tab={hierarchyTab}
              onTabChange={setHierarchyTab}
              projects={projects.projects}
              projectsLoading={projects.loading}
              canEdit={canEdit}
              onCreateProject={() => void handleCreateProject()}
              onOpenProject={handleOpenProject}
              onDeleteProject={handleDeleteProject}
            />
          )}

          <div className="relative min-h-0 flex-1">
            {environmentId ? (
              <GoogleMapPanel
                key={environmentId}
                nodes={mapNodes}
                pinnedNode={pinnedSelectedNode}
                projectSiteFeatures={projectSiteFeatures}
                // Não desenha a infraestrutura contra o catálogo sentinela: ele não carrega
                // identidade nem estilo publicado e causava um flash de ícones legados antes
                // da primeira resposta do Studio GEO.
                infraFeatures={mapLayerCatalog.loading ? [] : infraFeatures}
                onSelectInfraFeature={selectNodeFromInfraOverlay}
                selectedNode={selectedNode}
                draftAddress={draftAddress}
                addressPoint={
                  addressLookup?.source === 'search' &&
                  addressLookup.resolution?.mode === 'automatic'
                    ? addressLookup.resolution.selected
                    : null
                }
                addressResolution={
                  addressLookup?.source === 'search' ? addressLookup.resolution : null
                }
                dropSimulation={dropSimulation}
                portDropPreview={portDropPreview}
                focusRequest={focusRequest}
                initialView={viewState.initialView?.camera ?? null}
                bottomSheetState={bottomSheetState}
                balloon={balloon}
                onSelectNode={selectNodeFromMap}
                onHoverNode={handleHover}
                onCloseBalloon={() => handleHover(null)}
                onDraftAddress={onMapAddressFound}
                pickingAddress={pickingProjectSite}
                // Navegação manual do mapa (arrastar, pinça, roda, duplo clique) NÃO
                // desseleciona (issue #19); no mobile, encolhe a folha para peek (ver
                // handleManualMapNavigation). `selectionActive` diz ao mapa se há algo aberto,
                // para só encolher a folha quando faz sentido.
                onManualNavigation={handleManualMapNavigation}
                selectionActive={
                  selectedNode !== null ||
                  addressLookup !== null ||
                  draftAddress !== null ||
                  dockView.kind !== 'hierarchy'
                }
                onViewportChange={handleViewportChange}
                coverage={coverageVisible ? coverage : null}
                coverageStyle={coverageStyle}
                coverageLayerLabel={coverageLayer?.label}
                siteMarkerSize={siteMarkerSize}
                stationMarkerSize={stationMarkerSize}
                resourceMarkerSize={resourceMarkerSize}
                mapVisualScaleMeters={scaleMeters}
                onCoverageHover={setCoverageHover}
                projectAreas={projectAreas}
                onProjectAreaHover={setProjectAreaHover}
                // Com uma posição restaurada (F5, link compartilhado), o auto-locate mobile não
                // deve roubar o enquadramento que o usuário já tinha antes de sair (ele só desiste
                // sozinho quando há uma seleção, ver `selectedNodeIdRef` — não há uma para
                // viewport puro).
                autoLocateOnOpen={isMobile && !viewState.initialView}
                // Qualquer camada do mapa em carga acende a barra fina no topo do mapa; o
                // script do Google Maps é somado à barra dentro do painel (ver MapLoadingBar).
                busy={mapDataLoading}
                mapLayerCatalog={mapLayerCatalog.catalog}
                mapLayers={mapLayers.layers}
                onToggleMapLayer={mapLayers.toggleLayer}
                onToggleMapLayerGroup={mapLayers.toggleGroup}
                onResetMapLayers={mapLayers.resetLayers}
                mapLayersAllVisible={mapLayers.allVisible}
                mapLayersScaleMeters={scaleMeters}
                siteRoleByCode={siteRoleByCode}
              />
            ) : (
              <MapLoadingBar busy />
            )}
          </div>

          {/* Instância única da barra de pesquisa: sobreposta à doca e ao mapa, com o
              mesmo retângulo em todos os estados (estilo Google Maps). É o único
              controle de abrir/fechar a hierarquia (ver o slot ListTree/X) — por isso
              vive aqui, irmã da doca e do mapa, e não dentro de nenhum painel. */}
          <GeoSearchBar
            isMobile={isMobile}
            query={query}
            selection={searchSelection}
            selectedNodeIcon={selectedNodeIcon}
            searchOrigin={searchOrigin}
            onEditSelection={() => setSearchSelection(null)}
            onQueryChange={setQuery}
            onSelectNode={selectNodeFromSearch}
            onAddressFound={onAddressFound}
            onAddressError={onAddressError}
            onClear={onDeselect}
            hierarchyOpen={
              !addressLookup &&
              !(detailOpen && detailTarget) &&
              dockView.kind === 'hierarchy' &&
              !hierarchyCollapsed
            }
            onToggleHierarchy={() => {
              // Fechado por um painel de Projeto: reabrir a Hierarquia volta a doca para
              // ela, além de tirar o colapso — senão o ícone reabriria um painel que já
              // não está visível (ver dockView).
              if (dockView.kind !== 'hierarchy') {
                setDockView({ kind: 'hierarchy' });
                setHierarchyCollapsed(false);
              } else {
                setHierarchyCollapsed((collapsed) => !collapsed);
              }
            }}
            onOpenMainMenu={onOpenMainMenu}
          />
        </div>
      </main>

      {confirmDiscardProjectSite && dockView.kind === 'project' ? (
        <Modal
          onClose={() => setConfirmDiscardProjectSite(false)}
          title="Descartar novo local"
          eyebrow="Projeto"
        >
          <div className="grid gap-4">
            <p className="text-[0.9rem] text-app-text">
              Há campos preenchidos. Deseja descartar o novo local?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="geo-btn secondary"
                onClick={() => setConfirmDiscardProjectSite(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="geo-btn border-status-red/30 bg-status-red-soft text-status-red"
                onClick={() => {
                  closeProjectSite(dockView.projectId);
                  setConfirmDiscardProjectSite(false);
                }}
              >
                Descartar
              </button>
            </div>
          </div>
        </Modal>
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
