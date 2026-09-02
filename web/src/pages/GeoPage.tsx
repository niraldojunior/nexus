import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GeoStatus, GeoSpec, GeoSite } from '../services/geoApi';
import { getJson, listGeoSites } from '../services/geoApi';
import { siteKindFromSpec, siteKindLabel } from '../utils/placeLabel';
import { siteStatusLabel, siteSpecNameLabel } from '../utils/geoLabels';
import {
  treeNodePoint,
  treeNodeRoute,
  type GeoTreeNode,
  type MapBounds,
} from '../services/geoTreeApi';
import {
  GOOGLE_MAPS_KEY,
  loadGoogleMaps,
  reverseGeocode,
  resolveAddressByPlaceId,
  type DraftAddress,
  type GoogleCircleInstance,
  type GoogleInfoWindowInstance,
  type GoogleMapInstance,
  type GoogleMapMouseEvent,
  type GoogleMapsApi,
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
  coverageVisibleAtScale,
  siteIconSizeForScale,
  resourceIconSizeForScale,
  type CoverageLevel,
} from '../utils/mapScale';
import { useGponCoverage } from '../hooks/useGponCoverage';
import { useMapTiles } from '../hooks/useMapTiles';
import { mapTileFeatureNodeId, type MapTileFeature } from '../services/geoMapTileApi';
import { fetchTreeNode } from '../services/geoTreeApi';
import { useMapLayers } from '../hooks/useMapLayers';
import { useGeoViewState } from '../hooks/useGeoViewState';
import {
  viewportInclude,
  ALL_MAP_LAYERS_VISIBLE,
  type MapLayerGroupId,
  type MapLayerId,
  type MapLayerVisibility,
  type MapSiteRole,
} from '../utils/mapLayers';
import { createCoverageOverlay, type CoverageOverlayHandle } from './geo-tabs/CoverageOverlay';
import { coverageSwatch, coverageSwatchDataUrl } from '../utils/coverageColor';
import { projectAreaSwatchDataUrl } from '../utils/projectAreaColor';
import type { CoverageNeighborhood, CoverageResponse } from '../services/geoCoverageApi';
import { bottomInsetForOverlay, flyTo, cancelFlight, type FlyTarget } from '../utils/mapCamera';
import type { GeoViewContext, MapCamera } from '../utils/geoViewState';
import { acquireDeviceLocation, DEVICE_LOCATION_POOR_ACCURACY_M } from '../utils/deviceLocation';
import { useGeoTree } from '../hooks/useGeoTree';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  resourceIconFor,
  resourceIconDataUrl,
  MARKER_ICON_SIZE,
  CABLE_STROKE_WEIGHT,
} from '../utils/resourceIcon';
import {
  selectionPinDataUrl,
  addressSourcePin,
  siteIconDataUrl,
  siteIconFor,
  SELECTION_PIN_ASPECT,
  SITE_ICON_SIZE,
} from '../utils/siteIcon';
import { useNavigation } from '../hooks/useNavigation';
import { parseNavigationParams } from '../utils/navigation';
import {
  AddressDetailPanel,
  type AddressPinLocation,
  type AddressLocationResolution,
  BASE_MAP_LAYERS,
  GeoSearchBar,
  HierarchySidebar,
  type HierarchySidebarTab,
  MapBaseLayerSelector,
  MapLayerControl,
  MapLoadingBar,
  MapLocateButton,
  Modal,
  ProjectDetailPanel,
  ResourcePanel,
  SitePanel,
  type AddressSearchError,
  type DeviceLocation,
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
import {
  createProjectAreaOverlay,
  type ProjectAreaOverlayHandle,
} from './geo-tabs/ProjectAreaOverlay';
import { createInfraOverlay, type InfraOverlayHandle } from './geo-tabs/InfraOverlay';
import {
  createProjectSiteOverlay,
  type ProjectSiteOverlayHandle,
} from './geo-tabs/ProjectSiteOverlay';
import {
  DROP_ACCENT,
  DROP_INK,
  DROP_MUTED,
  type PortDropPreview,
  DROP_LABEL_HEIGHT,
  dropLabelDataUrl,
  dropLabelWidth,
  formatDropDistance,
  pathMidpoint,
  pathSpanMeters,
} from '../utils/dropSimulation';
import type { BottomSheetSnapState } from '../components/BottomSheet';

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

// Balão de hover da cobertura GPON: a área sob o cursor, com os números da rede. Não é um item
// pontual (não tem ícone de local/recurso), então usa um swatch da cor de disponibilidade. O
// título e a linha de localização mudam com o nível (LOD): bairro mostra município/UF; município
// mostra só o UF; estado não repete o próprio nome.
function coverageBalloonOf(
  hover: { point: [number, number]; neighborhood: CoverageNeighborhood } | null,
  level: CoverageLevel | undefined,
): MapBalloon | null {
  if (!hover) return null;
  const { neighborhood, point } = hover;
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
    ['CDOs', String(neighborhood.cdoTotal)],
    ['Disponíveis', `${neighborhood.cdoAvailable} (${pct}%)`],
    ['Indisponíveis', String(neighborhood.cdoUnavailable)],
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
    eyebrow: 'Cobertura GPON',
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

const EQUIPMENT_MARKER_Z = 1000;

// A Estação desenha ACIMA dos equipamentos (z maior): ela é a referência mais importante,
// então nunca fica escondida atrás de uma caixa/splitter que compartilha a coordenada.
const SITE_MARKER_Z = 1500;

// Stub de GeoTreeNode a partir de uma feature do InfraOverlay (canvas do mapa, Fase 3 da
// issue #69) — clique/hover sobre o canvas não tem um GeoTreeNode pronto, só o essencial que o
// índice de tile carrega. Suficiente para abrir o painel e desenhar o Marker/Polyline de
// seleção na hora; `selectNodeFromInfraOverlay` hidrata em seguida (`detail` completo e, pra
// cabo, a rota inteira — não só o trecho recortado neste tile).
function mapTileFeatureToNode(feature: MapTileFeature): GeoTreeNode {
  const node: GeoTreeNode = {
    id: mapTileFeatureNodeId(feature),
    kind: feature.kind,
    label: feature.label,
    refId: feature.entityId,
    // Site do canvas nunca é CO (ver o filtro de stationIds em GeoPage) — mesma régua
    // otimista de hasChildren:true da Fase 1 pro recurso; site segue sitesInViewport (false).
    hasChildren: feature.kind === 'resource',
    geometry:
      feature.shape === 'line' && feature.geometry
        ? feature.geometry
        : { type: 'Point', coordinates: [feature.lng, feature.lat] },
  };
  if (feature.sublabel) node.sublabel = feature.sublabel;
  if (feature.typeCode) node.resourceType = feature.typeCode;
  if (feature.siteCategory) node.siteCategory = feature.siteCategory;
  if (feature.status) node.status = feature.status;
  // `selectedSiteId` (GeoPage) só abre o SitePanel quando `referredType === 'GeographicSite'`
  // — sem isto, clicar um Site do canvas selecionava o nó mas nunca abria painel nenhum.
  if (
    feature.entityType === 'GeographicSite' ||
    feature.entityType === 'PhysicalResource' ||
    feature.entityType === 'LogicalResource'
  ) {
    node.referredType = feature.entityType;
  }
  return node;
}

// Ícone/z-index de um pin de nó (Site ou Recurso), na mesma lógica que o efeito de
// marcadores usava inline — extraído para ser reusado tanto na criação/reposicionamento em
// massa (quando `nodes` muda) quanto no efeito de troca de seleção, que toca só os 1-2
// marcadores cujo estado `selected` de fato mudou (ver os dois `useEffect` de marcadores
// logo abaixo). Mantém a mesma regra visual: o selecionado cresce, o resto segue o tier de
// escala (cheio perto, reduzido em zoom baixo).
function buildPointMarkerVisual(
  maps: GoogleMapsApi['maps'],
  node: GeoTreeNode,
  selected: boolean,
  siteMarkerSize: number,
  resourceMarkerSize: number | null,
): { iconOptions: Record<string, unknown>; zIndex: number; title: string } {
  if (node.kind === 'site') {
    const kind = siteKindFromSpec({ category: node.siteCategory, name: node.sublabel });
    const icon = siteIconFor(kind, node.status);
    // Só a Central/Estação é referência permanente do mapa. Qualquer outro Site
    // (cliente, condomínio, edificação, POP...) usa a mesma régua de Resource.
    const isStation = kind === 'CO';
    const size = isStation
      ? (selected ? SITE_ICON_SIZE + 8 : siteMarkerSize)
      : (selected ? MARKER_ICON_SIZE + 6 : (resourceMarkerSize ?? MARKER_ICON_SIZE));
    return {
      iconOptions: {
        url: siteIconDataUrl(icon, { size }),
        scaledSize: new maps.Size(size, size),
        anchor: new maps.Point(size / 2, size / 2),
      },
      zIndex: isStation ? (selected ? SITE_MARKER_Z + 1 : SITE_MARKER_Z) : (selected ? EQUIPMENT_MARKER_Z + 1 : EQUIPMENT_MARKER_Z),
      title: `${node.label} · ${icon.label}`,
    };
  }

  const icon = resourceIconFor({
    resourceType: node.resourceType ?? '',
    status: node.status,
    name: node.label,
    sublabel: node.sublabel,
  });
  // Um Recurso só chega aqui via Marker nativo quando é o nó selecionado (ver `mapNodes` em
  // GeoPage) — nesse caso `selected` é sempre true, então o fallback do `??` nunca é exercitado
  // de fato; existe só pra função ser total mesmo se isso mudar.
  const size = selected ? MARKER_ICON_SIZE + 6 : (resourceMarkerSize ?? MARKER_ICON_SIZE);
  return {
    iconOptions: {
      url: resourceIconDataUrl(icon, { size }),
      scaledSize: new maps.Size(size, size),
      // Âncora no canto inferior-esquerdo: o equipamento fica acima e à direita da
      // coordenada. Um equipamento dentro de um CO compartilha a coordenada exata do
      // local, e centrado ficaria escondido atrás do pin.
      anchor: new maps.Point(0, size),
    },
    zIndex: selected ? EQUIPMENT_MARKER_Z + 1 : EQUIPMENT_MARKER_Z,
    title: `${node.label} · ${icon.label}`,
  };
}

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
const DEFAULT_CENTER = { lat: -22.9068, lng: -43.1075 };
// Aguarda a janela nativa de duplo clique antes de tratar clique simples no mapa.
const MAP_SINGLE_CLICK_DELAY_MS = 500;

// Página da lista de locais no painel de Projeto (REQ-MOD01-017), quando ele já tem manchas
// de concentração/dispersão geradas — o total real aparece via `project.siteCount`, não pelo
// tamanho desta página (um projeto como "Onitel - Brasília" tem 25 mil locais).
const PROJECT_PANEL_SITE_LIMIT = 200;

// Teto de locais de projeto buscados por bbox para o MAPA (distinto de PROJECT_PANEL_SITE_LIMIT,
// que é a página da lista do painel). Sem limite, um projeto com dezenas de milhares de locais
// (ex.: "Onitel - Brasília", 25.507) enchia o viewport com até VIEWPORT_MAX_RESULTS (10.000)
// google.maps.Marker reais — o gargalo que travava a interação com o mapa (issue #72).
const PROJECT_VIEWPORT_SITE_LIMIT = 1500;

// A partir daqui o pin individual de um local de Projeto sai do mapa: a mancha de concentração/
// dispersão do ProjectAreaOverlay já representa o conjunto (REQ-MOD01-017). Mais restrito que
// PASSIVE_INFRA_MAX_SCALE_METERS (200 m, usado pela infra passiva comum) — coerente com o
// comentário original de projectSitesInViewport em tree-service.ts.
const PROJECT_PIN_MAX_SCALE_METERS = 50;

// Default de `onProjectAreaHover` — só usado pelos testes que montam GoogleMapPanel sem um
// Projeto em jogo (GeoPage sempre passa o setter de estado real).
const noopProjectAreaHover = (): void => {};

// Defaults dos handlers do controle de camadas (RF-011) — só usados pelos testes que montam
// GoogleMapPanel sem o controle em jogo (GeoPage sempre passa os callbacks reais de useMapLayers).
const noopToggleMapLayer = (): void => {};
const noopToggleMapLayerGroup = (): void => {};
const noopResetMapLayers = (): void => {};

// Default de `onSelectInfraFeature` — só usado pelos testes que montam GoogleMapPanel sem o
// InfraOverlay em jogo (GeoPage sempre passa selectNodeFromInfraOverlay).
const noopSelectInfraFeature = (): void => {};

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
  // Região visível atual (identidade só muda no `idle`) — alimenta a busca de cobertura GPON,
  // que roda acima de 100 m, não na de detalhe.
  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null);

  // Posição e contexto do mapa persistidos em URL + localStorage (issue #182) — ver
  // hooks/useGeoViewState. `initialView` semeia o mapa já no lugar certo (ver GoogleMapPanel
  // `initialView`); `reportCamera`/`setContext` são chamados abaixo, sem entrar em `useState`.
  const viewState = useGeoViewState();

  // Chamado pelo mapa a cada `idle` (fim de pan/zoom) com os limites, a escala e a câmera
  // atuais — registra estado (bounds/scaleMeters, para infra passiva/cobertura, que já
  // debouncam e deduplicam por conta própria) e reporta a câmera para persistência.
  const handleViewportChange = useCallback(
    (bounds: MapBounds, meters: number, camera: MapCamera) => {
      setScaleMeters(meters);
      setViewportBounds(bounds);
      viewState.reportCamera(camera);
    },
    // `reportCamera` é a única peça estável de `viewState` (ver useGeoViewState) — depender do
    // objeto inteiro recriaria este callback (e tudo que o consome, ver GoogleMapPanel) a cada
    // render, o mesmo cuidado já documentado em `selectNode`/`tree.revealNode` acima.
    [viewState.reportCamera],
  );

  const tree = useGeoTree();
  const { navParams, clearNav, goToResource } = useNavigation();

  // Controle de camadas do mapa (RF-011, REQ-MOD01-011): liga/desliga fetch + render por
  // grupo, persistido em localStorage. `include` fica memoizado pelas flags que realmente
  // importam para o viewport — sem isso, `viewportInclude` devolveria uma referência de array
  // nova a cada render e o useEffect de useMapTiles reentraria em loop.
  const mapLayers = useMapLayers();
  const viewportShapesInclude = useMemo(
    () => viewportInclude(mapLayers.layers),
    [
      mapLayers.layers.siteNetwork,
      mapLayers.layers.siteService,
      mapLayers.layers.netwinPole,
      mapLayers.layers.netwinDuct,
      mapLayers.layers.netwinManhole,
      mapLayers.layers.netwinTower,
      mapLayers.layers.resourceCdoe,
      mapLayers.layers.resourceCdoi,
      mapLayers.layers.resourceCeo,
      mapLayers.layers.resourceDio,
      mapLayers.layers.resourceFiberCable,
      mapLayers.layers.resourceDropCable,
    ],
  );
  // Papel funcional (siteRole, C11) por code de spec, para o seletor de camadas roteirar cada
  // feature de site para o grupo certo (Sites de Rede / Sites de Serviço) sem depender de
  // coluna nova em geo_map_feature (ver isMapFeatureVisible).
  const siteRoleByCode = useMemo(
    () => new Map(specs.map((spec) => [spec.code, spec.siteRole] as const)),
    [specs],
  );

  // Infra passiva (recursos + Sites não-CO + cabos) só entra abaixo de 200 m;
  // Estações (tree.mapNodes) continuam visíveis em qualquer escala — ver siteMarkerSize.
  // Desenhada por InfraOverlay (canvas, Fase 3 da issue #69), não por
  // Marker/Polyline — por isso fica FORA de `mapNodes` (que só alimenta os efeitos de
  // Marker/Polyline, ver GoogleMapPanel): as duas fontes nunca se misturam.
  const passiveInfraVisible = scaleMeters !== null && scaleMeters < PASSIVE_INFRA_MAX_SCALE_METERS;
  // Régua de escala própria dos pins de local de Projeto com manchas geradas (REQ-MOD01-017) —
  // mais restrita que a infra passiva comum (ver PROJECT_PIN_MAX_SCALE_METERS).
  const projectPinScaleVisible =
    scaleMeters !== null && scaleMeters < PROJECT_PIN_MAX_SCALE_METERS;
  const { data: infraFeaturesRaw, loading: viewportLoading } = useMapTiles(
    viewportBounds,
    scaleMeters,
    viewportShapesInclude,
    mapLayers.layers,
    siteRoleByCode,
  );
  // Um CO dentro do tile também vira feature 'site'. Filtra pelos
  // ids da árvore INTEIRA (não só as Estações visíveis, que podem estar com a camada desligada)
  // para não desenhar um CO duas vezes: Marker real (tree.mapNodes) + sprite do canvas.
  const infraFeatures = useMemo(() => {
    const stationIds = new Set(tree.mapNodes.map((node) => node.id));
    return infraFeaturesRaw.filter((feature) => !stationIds.has(mapTileFeatureNodeId(feature)));
  }, [infraFeaturesRaw, tree.mapNodes]);
  const siteMarkerSize = siteIconSizeForScale(scaleMeters);
  const resourceMarkerSize = resourceIconSizeForScale(scaleMeters);
  // CO/Estação permanece visível em qualquer escala (só muda de tamanho por siteMarkerSize);
  // a camada "Estações" do controle desliga só o desenho — a árvore precisa do fetch de
  // qualquer forma (ver MAP_LAYER_GROUPS em utils/mapLayers.ts). Não depende de `selectedNode`:
  // essa lista alimenta o efeito que cria/atualiza os N Marker do mapa (ver GoogleMapPanel), e
  // trocar a seleção NÃO deve reprocessar todos eles — o item selecionado que precisar de
  // Marker próprio fora deste recorte é responsabilidade isolada de `pinnedSelectedNode`, logo
  // abaixo (issue #72).
  const mapNodes = useMemo(
    () => (mapLayers.layers.stations ? tree.mapNodes : []),
    [tree.mapNodes, mapLayers.layers.stations],
  );

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
      activeProjectId !== null &&
      (hasProjectAreas ? projectPinScaleVisible : passiveInfraVisible);
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
    const selectedIsStation =
      selectedNode.kind === 'site' &&
      siteKindFromSpec({ category: selectedNode.siteCategory, name: selectedNode.sublabel }) === 'CO';
    const selectedVisible =
      selectedNode.kind === 'site' ? selectedIsStation || passiveInfraVisible : passiveInfraVisible;
    if (!selectedVisible) return null;
    return mapNodes.some((node) => node.id === selectedNode.id) ? null : selectedNode;
  }, [selectedNode, passiveInfraVisible, mapNodes]);

  // Cobertura GPON da viewport (mapa de calor por bairro), só acima de 100 m.
  // Camada "Cobertura GPON" desligada corta a busca inteira: bounds nulo já limpa `coverage` e
  // zera o dedupe interno do hook, então religar refaz o fetch sem precisar mexer no mapa.
  const { data: coverage, loading: coverageLoading } = useGponCoverage(
    mapLayers.layers.coverage ? viewportBounds : null,
    scaleMeters,
  );
  const coverageVisible = coverageVisibleAtScale(scaleMeters) && mapLayers.layers.coverage;
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
    loading || tree.busy || viewportLoading || coverageLoading;

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
  const detailResourceNodeId = detailOpen && detailTarget?.kind === 'resource' ? detailTarget.node.id : null;
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
      const siteData = await listGeoSites({ siteSpecificationIds: containerSpecIds });
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
      tree.revealNode(node.id, { expandSelf: node.hasChildren });
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
  // Seleciona o stub na hora (painel abre, Marker/Polyline de seleção aparece de imediato) e
  // troca pelo nó hidratado assim que a resposta chega, sem bloquear a interação por causa de
  // uma volta ao servidor. Nunca é um Local de Projeto (esses continuam vindo de
  // `projectViewportSites`/`projectSites`, um Marker real de sempre — `geo_map_feature` não os
  // indexa). Site não precisa de hidratação própria aqui (SitePanel já busca o detalhe completo
  // por id de qualquer jeito, e a geometria de Site no índice já é o ponto inteiro, nunca um
  // trecho recortado).
  const selectNodeFromInfraOverlay = useCallback(
    (feature: MapTileFeature) => {
      const stub = mapTileFeatureToNode(feature);
      selectNode(stub, 'map');
      if (stub.kind !== 'resource') return;
      const token = ++hydrateTokenRef.current;
      void fetchTreeNode(stub.id)
        .then((hydrated) => {
          if (hydrateTokenRef.current !== token) return;
          setSelectedNode((current) => (current?.id === stub.id ? hydrated : current));
        })
        .catch(() => {
          // Hidratação falhou (recurso terminado entre o build do índice e o clique, rede
          // instável): o stub já aberto continua funcional, só sem `detail`/rota completa.
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

  // Monta o conteúdo do balão de preview a partir do nó sob o mouse. Fica aqui,
  // e não no painel do mapa, porque é aqui que se sabe o que fazer com cada
  // tipo de item. Puro cartão de visita — tipo, endereço, status e modelo — sem
  // ação: quem abre o detalhe é o clique, não o hover.
  const balloon = useMemo<MapBalloon | null>(() => {
    const node = hoverNode;
    if (!node) {
      return (
        projectAreaBalloonOf(projectAreaHover) ?? coverageBalloonOf(coverageHover, coverage?.level)
      );
    }
    // O painel de detalhe já mostra tipo/endereço/status do mesmo item — o
    // balão por cima seria redundante enquanto ele está aberto.
    if (detailOpen && selectedNode?.id === node.id) return null;
    const point = treeNodePoint(node);
    if (!point) return null;

    if (node.kind === 'site') {
      const kindOfSite = siteKindFromSpec({ category: node.siteCategory, name: node.sublabel });
      const icon = siteIconFor(kindOfSite, node.status);
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
        iconUrl: siteIconDataUrl(icon, { size: 40 }),
        eyebrow: siteSpecNameLabel(node.sublabel) ?? siteKindLabel[kindOfSite],
        title: node.label,
        rows,
      };
    }

    const status = resourceStatusLabel[(node.status as GeoStatus) ?? 'active'];
    const icon = resourceIconFor({
      resourceType: node.resourceType ?? '',
      status: node.status,
      name: node.label,
      sublabel: node.sublabel,
    });
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
      iconUrl: resourceIconDataUrl(icon, { size: 40 }),
      eyebrow: icon.label,
      title: node.label,
      rows,
    };
  }, [detailOpen, hoverNode, selectedNode?.id, coverageHover, coverage?.level, projectAreaHover]);

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
              onOpenResource={goToResource}
            />
          ) : detailOpen && detailTarget?.kind === 'resource' ? (
            <>
              {/* Mesmo precedente de Projeto→Local: no mobile as duas telas se substituem,
                  no desktop a Porta abre ao lado da CTO sem fechá-la. */}
              {!isMobile || !stackedPortNode ? (
                <ResourcePanel
                  key={detailTarget.node.id}
                  isMobile={isMobile}
                  node={detailTarget.node}
                  onSnapChange={onMobileSheetSnapChange}
                  minimizeSignal={sheetMinimizeSignal}
                  onOpenResource={goToResource}
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
                  node={stackedPortNode}
                  onSnapChange={onMobileSheetSnapChange}
                  minimizeSignal={sheetMinimizeSignal}
                  onOpenResource={goToResource}
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
                  onOpenResource={goToResource}
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
              onCreateProject={() => void handleCreateProject()}
              onOpenProject={handleOpenProject}
              onDeleteProject={handleDeleteProject}
            />
          )}

          <div className="relative min-h-0 flex-1">
            <GoogleMapPanel
              nodes={mapNodes}
              pinnedNode={pinnedSelectedNode}
              projectSiteFeatures={projectSiteFeatures}
              infraFeatures={infraFeatures}
              onSelectInfraFeature={selectNodeFromInfraOverlay}
              selectedNode={selectedNode}
              draftAddress={draftAddress}
              addressPoint={
                addressLookup?.source === 'search' && addressLookup.resolution?.mode === 'automatic'
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
              siteMarkerSize={siteMarkerSize}
              resourceMarkerSize={resourceMarkerSize}
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
              mapLayers={mapLayers.layers}
              onToggleMapLayer={mapLayers.toggleLayer}
              onToggleMapLayerGroup={mapLayers.toggleGroup}
              onResetMapLayers={mapLayers.resetLayers}
              mapLayersAllVisible={mapLayers.allVisible}
              mapLayersScaleMeters={scaleMeters}
              siteRoleByCode={siteRoleByCode}
            />
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
            <p className="text-[0.9rem] text-app-text">Há campos preenchidos. Deseja descartar o novo local?</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="geo-btn secondary" onClick={() => setConfirmDiscardProjectSite(false)}>Cancelar</button>
              <button type="button" className="geo-btn border-status-red/30 bg-status-red-soft text-status-red" onClick={() => { closeProjectSite(dockView.projectId); setConfirmDiscardProjectSite(false); }}>Descartar</button>
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

// O mapa sempre mostra todas as estações (mesmo com o ramo fechado na árvore). Infra
// passiva (recursos + cabos) vem de fora, já filtrada por escala/viewport pelo
// GeoPage — este painel só desenha o que chega em `nodes` e avisa (`onViewportChange`)
// quando a região visível ou a escala mudam, para o chamador decidir o que buscar.
export function GoogleMapPanel({
  nodes,
  pinnedNode = null,
  projectSiteFeatures = [],
  infraFeatures = [],
  onSelectInfraFeature = noopSelectInfraFeature,
  selectedNode,
  draftAddress,
  addressPoint,
  addressResolution,
  dropSimulation,
  portDropPreview,
  focusRequest,
  initialView = null,
  bottomSheetState,
  balloon,
  onSelectNode,
  onHoverNode,
  onCloseBalloon,
  onDraftAddress,
  pickingAddress = false,
  onManualNavigation,
  selectionActive,
  onViewportChange,
  coverage,
  siteMarkerSize,
  resourceMarkerSize,
  onCoverageHover,
  projectAreas = [],
  onProjectAreaHover = noopProjectAreaHover,
  autoLocateOnOpen = false,
  busy = false,
  mapLayers = ALL_MAP_LAYERS_VISIBLE,
  onToggleMapLayer = noopToggleMapLayer,
  onToggleMapLayerGroup = noopToggleMapLayerGroup,
  onResetMapLayers = noopResetMapLayers,
  mapLayersAllVisible = true,
  mapLayersScaleMeters = null,
  siteRoleByCode,
}: {
  nodes: GeoTreeNode[];
  // Nó fora de `nodes` que precisa de Marker próprio mesmo assim (hoje só o selecionado,
  // quando cai fora do recorte de escala/viewport — ver `pinnedSelectedNode` em GeoPage).
  // Isolado de `nodes` de propósito: só o efeito dedicado abaixo o processa, nunca os N
  // marcadores normais (issue #72). `null` quando o selecionado já está em `nodes` ou não
  // deve aparecer.
  pinnedNode?: GeoTreeNode | null;
  // Locais do Projeto de trabalho aberto, desenhados por ProjectSiteOverlay (canvas) — nunca
  // viram Marker/Polyline (issue #72). Já vem filtrada por escala/projeto pelo chamador (ver
  // `projectSiteFeatures` em GeoPage). Opcional com default vazio, para os testes existentes.
  projectSiteFeatures?: ProjectSite[];
  // Infra passiva (recursos + Sites não-CO + cabos) da região visível, desenhada por
  // InfraOverlay (canvas, Fase 3 da issue #69) — nunca vira Marker/Polyline. Já vem filtrada
  // por camada/escala pelo chamador (ver useMapTiles em GeoPage). Opcional com default vazio,
  // para os testes existentes que montam GoogleMapPanel sem o InfraOverlay em jogo.
  infraFeatures?: MapTileFeature[];
  // Clique/hover resolvido pelo hit-test do InfraOverlay — o chamador decide seleção e
  // hidratação (ver selectNodeFromInfraOverlay em GeoPage).
  onSelectInfraFeature?: (feature: MapTileFeature) => void;
  // Nó selecionado inteiro (não só o id): o alfinete precisa da geometria mesmo quando o
  // nó já saiu da lista visível do mapa — recurso/cabo afastado, ou deep-link de Site que
  // ainda não virou marcador. O id é derivado abaixo, para os efeitos que só precisam dele.
  selectedNode: GeoTreeNode | null;
  draftAddress: DraftAddress | null;
  // Endereço resolvido pela busca (ver AddressDetailPanel) — cravado com o mesmo
  // alfinete de seleção, na ausência de um nó selecionado (os dois nunca coexistem,
  // ver onAddressFound/selectNode em GeoPage).
  addressPoint?: AddressPinLocation | [number, number] | null;
  // Resultado da comparação Google × GEONET. Em conflito, os dois pins permanecem
  // visíveis mesmo depois da escolha para permitir comparação em campo.
  addressResolution?: AddressLocationResolution | null;
  // Drop simulado entre o endereço e a CDO escolhida na aba de Viabilidade — estudo,
  // não planta: desenho próprio, animado, que some junto com o painel que o criou.
  dropSimulation?: DropSimulation | null;
  // Trajeto do drop físico da Porta (homologação CDOE-02-ICARAI) — canal isolado de
  // `dropSimulation`: inventário real, não hipótese, com dois estilos possíveis
  // ('active'/'muted') em vez de um só. Ver PortDropPreview em dropSimulation.ts.
  portDropPreview?: PortDropPreview | null;
  // Pedido de foco: para onde a câmera voa e com que zoom de chegada (ver flyTo).
  focusRequest?: FlyTarget | null;
  // Câmera restaurada (issue #182, ver hooks/useGeoViewState) com que o mapa já NASCE
  // posicionado, em vez de nascer no `DEFAULT_CENTER` e voar depois — evita carregar tiles do
  // centro padrão à toa, animação de voo encadeada e o zoom fracionário que `flyTo`
  // produziria. Só é lida na criação do mapa (ver `initialViewRef`); mudanças depois de o
  // mapa existir não têm efeito, por design (não pode "puxar" a câmera do usuário de volta).
  initialView?: MapCamera | null;
  // `undefined` = sem painel; `null` = painel mobile montando/sem medida; objeto =
  // snap e altura estabilizados, necessários para aplicar a política de reenquadramento.
  bottomSheetState?: BottomSheetSnapState | null;
  balloon: MapBalloon | null;
  onSelectNode: (node: GeoTreeNode) => void;
  onHoverNode: (node: GeoTreeNode | null) => void;
  onCloseBalloon: () => void;
  onDraftAddress: (address: DraftAddress) => void;
  // "Escolher no mapa" do painel unificado de Local (SitePanel/onTogglePickOnMap): o
  // cursor vira mira para sinalizar que o próximo clique define o ponto, em vez do
  // padrão de navegação. Some assim que o clique resolve o endereço (ver GeoPage).
  pickingAddress?: boolean;
  // Navegação manual do mapa com algo selecionado: mantém a seleção (issue #19) e serve
  // para o mobile encolher a folha para peek. Só é chamado quando `selectionActive`.
  onManualNavigation?: () => void;
  // Se há algo aberto (nó, endereço ou rascunho) — decide se a navegação manual encolhe
  // a folha e alimenta a invalidação do clique adiado.
  selectionActive?: boolean;
  // 3º argumento (`camera`) é a posição bruta (lat/lng/zoom), para persistência (ver
  // handleViewportChange/useGeoViewState em GeoPage) — distinto de `bounds`/`scaleMeters`, que
  // já existiam para infra passiva/cobertura e não bastam para recriar a câmera exata.
  onViewportChange: (bounds: MapBounds, scaleMeters: number, camera: MapCamera) => void;
  // Cobertura GPON da viewport (mapa de calor por bairro), ou null quando fora de escala. O
  // painel só a desenha na camada de canvas (ver CoverageOverlay); a busca é do chamador.
  coverage: CoverageResponse | null;
  // Tamanho em px do pin de Site na escala atual (ver siteIconSizeForScale em mapScale.ts).
  siteMarkerSize: number;
  // Tamanho em px do pin de Recurso na escala atual (ver resourceIconSizeForScale em
  // mapScale.ts), ou `null` quando o Recurso não é desenhado nessa escala.
  resourceMarkerSize: number | null;
  // Bairro sob o cursor sobre a mancha (ou null) — vira o balão de hover no GeoPage.
  onCoverageHover: (
    hover: { point: [number, number]; neighborhood: CoverageNeighborhood } | null,
  ) => void;
  // Manchas de concentração/dispersão do Projeto aberto (REQ-MOD01-017), ou lista vazia
  // quando o projeto não tem manchas geradas — o painel só as desenha na camada de canvas
  // (ver ProjectAreaOverlay); a busca é do chamador. Opcional: default vazio para os testes
  // que montam o painel sem um Projeto em jogo.
  projectAreas?: ProjectArea[];
  // Mancha sob o cursor (ou null) — vira o balão de hover no GeoPage.
  onProjectAreaHover?: (hover: { point: [number, number]; area: ProjectArea } | null) => void;
  // Só o mobile salta sozinho para a posição do dispositivo ao abrir (ver efeito de
  // auto-localização); no desktop o pulo fica reservado ao clique no botão.
  autoLocateOnOpen?: boolean;
  // Alguma camada do mapa (cobertura, catálogo, recursos, hierarquia) está carregando —
  // acende a barra fina no topo (ver MapLoadingBar). O carregamento do próprio script do
  // Google Maps é somado a isto internamente (mapsLoading).
  busy?: boolean;
  // Controle de camadas do mapa (RF-011, REQ-MOD01-011) — o painel só renderiza o botão/lista
  // (MapLayerControl); fetch e render condicionais são decididos pelo chamador (mapNodes,
  // coverage, useMapTiles em GeoPage). Opcional com default "tudo visível", para os
  // testes existentes que montam GoogleMapPanel sem o controle em jogo continuarem passando.
  mapLayers?: MapLayerVisibility;
  onToggleMapLayer?: (id: MapLayerId) => void;
  onToggleMapLayerGroup?: (groupId: MapLayerGroupId) => void;
  onResetMapLayers?: () => void;
  mapLayersAllVisible?: boolean;
  // Escala atual do mapa (ver mapScale.ts) — repassada ao MapLayerControl só para inibir
  // camadas com régua própria mais restrita que o toggle manual (hoje só o Poste).
  mapLayersScaleMeters?: number | null;
  // Papel funcional (siteRole, C11) por code de spec — refina o ícone de Site desenhado pelo
  // InfraOverlay (CO/POP/CTO) além da heurística por substring. Opcional: sem catálogo em mãos
  // (testes, ou carregamento inicial), o InfraOverlay cai no fallback por nome.
  siteRoleByCode?: ReadonlyMap<string, MapSiteRole>;
}) {
  const selectedNodeId = selectedNode?.id ?? null;
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  // Lido uma única vez, na criação do mapa (ver o efeito logo abaixo) — não é a prop
  // diretamente para não instabilizar as deps desse efeito a cada render.
  const initialViewRef = useRef(initialView);
  const framedFocusRequestRef = useRef<FlyTarget | null>(null);
  const framedBottomSheetStateRef = useRef<BottomSheetSnapState | undefined>(undefined);
  // Marcadores/polylines indexados por id do nó — permite reusar o mesmo objeto entre renders
  // (só atualizando ícone/posição quando algo muda) em vez de destruir e recriar tudo a cada
  // seleção, que é o que travava o mapa com muitos pontos expandidos.
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  // Marker isolado para `pinnedNode` — nunca compartilha o Map acima nem o efeito dos N
  // marcadores normais, para clicar em pin não reprocessar tudo (issue #72).
  const pinnedMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const cableRoutesRef = useRef<Map<string, GooglePolylineInstance>>(new Map());
  // Camada de calor da cobertura GPON (canvas em OverlayView, abaixo dos marcadores).
  const coverageOverlayRef = useRef<CoverageOverlayHandle | null>(null);
  const onCoverageHoverRef = useRef(onCoverageHover);
  const coverageHitTestRef = useRef<
    ((lng: number, lat: number) => CoverageNeighborhood | null) | null
  >(null);
  // Camada das manchas de concentração/dispersão do Projeto (REQ-MOD01-017), mesma técnica
  // de canvas da cobertura GPON.
  const projectAreaOverlayRef = useRef<ProjectAreaOverlayHandle | null>(null);
  const onProjectAreaHoverRef = useRef(onProjectAreaHover);
  const projectAreaHitTestRef = useRef<((lng: number, lat: number) => ProjectArea | null) | null>(
    null,
  );
  // Infra passiva (recursos + Sites não-CO + cabos) num <canvas> — substitui um
  // Marker/Polyline por feature (Fase 3, issue #69). Acima da cobertura, abaixo do
  // Marker/Polyline real do nó selecionado (que continua existindo — ver excludeNodeId).
  const infraOverlayRef = useRef<InfraOverlayHandle | null>(null);
  const onSelectInfraFeatureRef = useRef(onSelectInfraFeature);
  // Locais do Projeto de trabalho aberto num <canvas>, mesma técnica de InfraOverlay —
  // substitui até PROJECT_VIEWPORT_SITE_LIMIT Marker DOM reais por pin (issue #72). O
  // selecionado nunca é desenhado aqui — vira `pinnedNode`/`pinnedMarkerRef` acima.
  const projectSiteOverlayRef = useRef<ProjectSiteOverlayHandle | null>(null);
  const draftMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const selectionMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const addressSourceMarkersRef = useRef<Map<'google' | 'geonet', GoogleMarkerInstance>>(new Map());
  // Ponto azul "minha localização", cravado quando o usuário pede a geolocalização do
  // dispositivo (ver MapLocateButton). Vive fora do fluxo de nós/seleção — não é
  // inventário, é a posição real de quem está olhando o mapa.
  const userLocationMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  // Halo de incerteza em volta do ponto (raio = accuracy do fix, em metros), no espírito
  // do círculo de precisão do Google Maps: torna visível quão confiável é a leitura.
  const userLocationHaloRef = useRef<GoogleCircleInstance | null>(null);
  // Três peças da simulação de drop: o traço sólido de base, o pontilhado que anda por
  // cima dele e a pílula com a metragem no meio do caminho.
  const dropBaseRef = useRef<GooglePolylineInstance | null>(null);
  const dropDashRef = useRef<GooglePolylineInstance | null>(null);
  const dropLabelRef = useRef<GoogleMarkerInstance | null>(null);
  const dropAnimationRef = useRef<number | undefined>(undefined);
  // Trajeto do drop físico da Porta (homologação CDOE-02-ICARAI) — refs próprios, canal
  // isolado do trio acima (dropBase/dropDash/dropLabel são da simulação de Viabilidade).
  // Sem label: aqui é inventário, não estudo de distância.
  const portDropBaseRef = useRef<GooglePolylineInstance | null>(null);
  const portDropDashRef = useRef<GooglePolylineInstance | null>(null);
  const portDropAnimationRef = useRef<number | undefined>(undefined);
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
  // O listener de `click` do mapa é atado uma única vez (ver o guard `mapRef.current` no
  // efeito de criação abaixo) — sem ref, ele ficaria preso para sempre à função (e ao
  // `pickingProjectSite` capturado nela) da primeira montagem, mesmo depois do usuário
  // apertar "Escolher no mapa". Era exatamente esse o bug: o clique sempre abria o painel
  // de Endereço e derrubava o projeto em vez de devolver o ponto ao formulário.
  const onDraftAddressRef = useRef(onDraftAddress);
  const pickingAddressRef = useRef(pickingAddress);
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
  // Carregamento do script do Google Maps — soma-se ao `busy` do chamador na barra de
  // carga (ver MapLoadingBar). Distinto de `mapsReady`: derivar a barra de `!mapsReady` a
  // deixaria girando para sempre se o script falhasse (o catch faz setMapsReady(false)).
  const [mapsLoading, setMapsLoading] = useState(true);
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
    onDraftAddressRef.current = onDraftAddress;
  }, [onDraftAddress]);

  useEffect(() => {
    pickingAddressRef.current = pickingAddress;
    if (mapRef.current) {
      mapRef.current.setOptions({ draggableCursor: pickingAddress ? 'crosshair' : null });
    }
  }, [pickingAddress]);

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
    onCoverageHoverRef.current = onCoverageHover;
  }, [onCoverageHover]);

  useEffect(() => {
    onProjectAreaHoverRef.current = onProjectAreaHover;
  }, [onProjectAreaHover]);

  useEffect(() => {
    onSelectInfraFeatureRef.current = onSelectInfraFeature;
  }, [onSelectInfraFeature]);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !mapEl.current) return;
    void loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        const maps = window.google?.maps;
        if (!mapEl.current || mapRef.current || !maps) return;
        mapRef.current = new maps.Map(mapEl.current, {
          center: initialViewRef.current
            ? { lat: initialViewRef.current.lat, lng: initialViewRef.current.lng }
            : DEFAULT_CENTER,
          zoom: initialViewRef.current?.zoom ?? 15,
          mapTypeId: selectedBaseLayer.googleMapTypeId,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          // `greedy` reserva os gestos sobre o canvas ao mapa: um dedo faz pan e dois
          // fazem pinch-to-zoom. Mantemos o renderer raster para preservar os estilos
          // inline de POI. Os controles visuais de zoom/rotação e o controle de câmera
          // (bússola/tilt) continuam ocultos — o chrome do mapa é só o nosso (busca, MUB,
          // Minha localização).
          gestureHandling: 'greedy',
          zoomControl: false,
          rotateControl: false,
          cameraControl: false,
          scaleControl: true,
          styles: selectedBaseLayer.mapStyles,
        });
        mapRef.current.addListener('click', (event: GoogleMapMouseEvent) => {
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          // Locais do Projeto de trabalho aberto (ProjectSiteOverlay, canvas — issue #72)
          // também não têm Marker próprio; testado antes da infra passiva porque, com um
          // projeto aberto, o pin de local é o alvo mais específico. `onSelectNodeRef` já
          // decide entre abrir o painel de Local do projeto ou o de detalhe comum (ver
          // `selectNodeFromMap` em GeoPage) — mesmo callback que os Marker normais usam.
          const projectSiteHit = pickingAddressRef.current
            ? null
            : projectSiteOverlayRef.current?.hitTest(lng, lat);
          if (projectSiteHit) {
            closeBalloonRef.current();
            onSelectNodeRef.current(projectSiteHit);
            return;
          }
          // Infra passiva desenhada em canvas (InfraOverlay, Fase 3 da issue #69) não tem
          // Marker próprio pra capturar o clique nativamente — hit-test primeiro; um acerto
          // seleciona a feature e sai cedo, igual a um clique em Marker/Polyline de verdade
          // (que também nunca chega até aqui). Em modo "Escolher no mapa" (pickingAddress),
          // qualquer clique é o ponto do novo local — nunca seleciona a feature por baixo.
          const infraHit = pickingAddressRef.current ? null : infraOverlayRef.current?.hitTest(lng, lat);
          if (infraHit) {
            closeBalloonRef.current();
            onSelectInfraFeatureRef.current(infraHit);
            return;
          }
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
            // substituindo qualquer seleção anterior (ver onMapAddressFound em GeoPage) — a
            // menos que o painel de Local esteja em modo "Escolher no mapa", caso em que
            // onMapAddressFound devolve o ponto para o formulário em vez de trocar de doca.
            // É a terceira porta de troca de seleção; pan e zoom não passam por aqui. Sempre
            // via ref (onDraftAddressRef): este listener é atado uma única vez na criação do
            // mapa, então precisa ler a versão mais recente do callback a cada clique.
            void reverseGeocode(lat, lng)
              .catch(() => null)
              .then((address) => {
                if (mapClickGenerationRef.current !== clickGeneration) return;
                onDraftAddressRef.current(
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
            { lat: center.lat(), lng: center.lng(), zoom },
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

        // Camada de calor da cobertura GPON (canvas), abaixo dos marcadores. O hover sobre a
        // mancha vira o balão do bairro.
        coverageOverlayRef.current = createCoverageOverlay(maps, mapRef.current);
        coverageHitTestRef.current = coverageOverlayRef.current.hitTest;

        // Camada das manchas de concentração/dispersão do Projeto (REQ-MOD01-017), mesma
        // técnica de canvas — o hover sobre a mancha vira o balão de classe/contagem.
        projectAreaOverlayRef.current = createProjectAreaOverlay(maps, mapRef.current);
        projectAreaHitTestRef.current = projectAreaOverlayRef.current.hitTest;

        // Infra passiva (recursos + Sites não-CO + cabos) em canvas — substitui um
        // Marker/Polyline por feature (Fase 3, issue #69). Precisa emular o mouseout que um
        // Marker real teria (`lastInfraHoverId`): sem isso, sair do ícone sem passar por outro
        // deixaria o balão de hover grudado.
        infraOverlayRef.current = createInfraOverlay(maps, mapRef.current);
        let lastInfraHoverId: string | null = null;
        let infraCursorIsInteractive = false;

        // Locais do Projeto de trabalho aberto em canvas (issue #72) — mesmo padrão de mouseout
        // emulado do infra passiva acima (`lastProjectSiteHoverId`).
        projectSiteOverlayRef.current = createProjectSiteOverlay(maps, mapRef.current);
        let lastProjectSiteHoverId: string | null = null;
        let projectSiteCursorIsInteractive = false;

        // As três camadas escutavam `mousemove` cada uma com seu próprio throttle de 50ms —
        // três hit-tests por movimento do mouse, o gargalo que travava a interação com um
        // projeto aberto (issue #72). Um único listener, coalescido por
        // requestAnimationFrame, roda no máximo um hit-test de cada camada por frame — o mapa
        // sempre desenha a 60fps de qualquer forma, então não há ganho em checar mais rápido
        // que isso.
        let pendingMouseMoveEvent: GoogleMapMouseEvent | null = null;
        let mouseMoveScheduled = false;
        const processMouseMove = () => {
          mouseMoveScheduled = false;
          const event = pendingMouseMoveEvent;
          if (!event) return;
          const lng = event.latLng.lng();
          const lat = event.latLng.lat();

          const coverageHitTest = coverageHitTestRef.current;
          if (coverageHitTest) {
            const neighborhood = coverageHitTest(lng, lat);
            onCoverageHoverRef.current(neighborhood ? { point: [lng, lat], neighborhood } : null);
          }

          const projectAreaHitTest = projectAreaHitTestRef.current;
          if (projectAreaHitTest) {
            const area = projectAreaHitTest(lng, lat);
            onProjectAreaHoverRef.current(area ? { point: [lng, lat], area } : null);
          }

          const projectSiteOverlay = projectSiteOverlayRef.current;
          let projectSiteHit: ProjectSite | null = null;
          if (projectSiteOverlay) {
            projectSiteHit = projectSiteOverlay.hitTest(lng, lat);
            const cursorShouldBeInteractive = Boolean(projectSiteHit);
            if (
              !pickingAddressRef.current &&
              cursorShouldBeInteractive !== projectSiteCursorIsInteractive
            ) {
              projectSiteCursorIsInteractive = cursorShouldBeInteractive;
              mapRef.current?.setOptions({
                draggableCursor: cursorShouldBeInteractive ? 'pointer' : null,
              });
            }
            const hitId = projectSiteHit?.id ?? null;
            if (hitId !== lastProjectSiteHoverId) {
              lastProjectSiteHoverId = hitId;
              onHoverNodeRef.current(projectSiteHit);
            }
          }

          const overlay = infraOverlayRef.current;
          // Pin de local de Projeto tem prioridade (mesma ordem do listener de `click`) — só
          // testa a infra passiva embaixo quando não há acerto de projeto sob o cursor.
          if (overlay && !projectSiteHit) {
            const hit = overlay.hitTest(lng, lat);
            const cursorShouldBeInteractive = Boolean(hit);
            // O canvas não recebe ponteiros (para o mapa continuar navegável), então o Maps
            // não sabe sozinho que há uma feature clicável abaixo do mouse. Só toca na opção
            // quando cruza a fronteira de hover, evitando trabalho a cada mousemove. Em modo
            // "Escolher no mapa" a mira (crosshair) prevalece — não troca para "pointer" sobre
            // uma feature, porque o clique aqui nunca a seleciona (ver o listener de `click`).
            if (
              !pickingAddressRef.current &&
              cursorShouldBeInteractive !== infraCursorIsInteractive
            ) {
              infraCursorIsInteractive = cursorShouldBeInteractive;
              mapRef.current?.setOptions({
                draggableCursor: cursorShouldBeInteractive ? 'pointer' : null,
              });
            }
            const hitId = hit ? mapTileFeatureNodeId(hit) : null;
            if (hitId !== lastInfraHoverId) {
              lastInfraHoverId = hitId;
              onHoverNodeRef.current(hit ? mapTileFeatureToNode(hit) : null);
            }
          }
        };
        mapRef.current.addListener('mousemove', (event: GoogleMapMouseEvent) => {
          pendingMouseMoveEvent = event;
          if (mouseMoveScheduled) return;
          mouseMoveScheduled = true;
          requestAnimationFrame(processMouseMove);
        });

        setMapsReady(true);
      })
      .catch(() => setMapsReady(false))
      .finally(() => setMapsLoading(false));
  }, [
    handleManualNavigation,
    selectedBaseLayer.googleMapTypeId,
    selectedBaseLayer.mapStyles,
  ]);

  // O contêiner do mapa muda de largura sempre que uma doca aparece/some ao lado dele —
  // hierarquia, painel de Projeto, e agora também a janela de consulta de um local de
  // projeto (REQ-MOD01-015 §20), lado a lado como Salvos → Listas do Google Maps. Sem
  // este observer, o Google Maps só percebe o novo tamanho do `<div>` de forma
  // best-effort; disparar `resize` explicitamente garante o redesenho e mantém o centro
  // geográfico atual (`center`) ancorado no meio do novo retângulo visível — é isso que
  // "centraliza o alfinete" sem precisar recalcular um novo alvo de câmera.
  useEffect(() => {
    if (!mapsReady || !mapEl.current) return;
    const maps = window.google?.maps;
    if (!maps) return;
    // ResizeObserver não existe no jsdom (testes) — mesmo guard do OverlayScrollArea.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (mapRef.current) maps.event.trigger(mapRef.current, 'resize');
    });
    observer.observe(mapEl.current);
    return () => observer.disconnect();
  }, [mapsReady]);

  // Repassa os dados de cobertura para a camada de canvas quando mudam (ou saem de escala).
  useEffect(() => {
    coverageOverlayRef.current?.setData(coverage);
  }, [coverage, mapsReady]);

  // Descarta a camada de cobertura no desmonte, junto do mapa.
  useEffect(
    () => () => {
      coverageOverlayRef.current?.destroy();
      coverageOverlayRef.current = null;
      coverageHitTestRef.current = null;
    },
    [],
  );

  // Repassa as manchas do Projeto para a camada de canvas quando mudam (projeto trocado,
  // manchas carregadas, ou lista esvaziada ao fechar o projeto).
  useEffect(() => {
    projectAreaOverlayRef.current?.setData(projectAreas);
  }, [projectAreas, mapsReady]);

  // Descarta a camada de manchas no desmonte, junto do mapa.
  useEffect(
    () => () => {
      projectAreaOverlayRef.current?.destroy();
      projectAreaOverlayRef.current = null;
      projectAreaHitTestRef.current = null;
    },
    [],
  );

  // Repassa a infra passiva pra camada de canvas quando muda (pan/zoom, camada ligada/
  // desligada) ou quando a seleção troca — o nó selecionado nunca é desenhado pelo overlay
  // (ver excludeNodeId em InfraOverlay), então trocar a seleção precisa de um redraw mesmo
  // sem `infraFeatures` ter mudado.
  useEffect(() => {
    infraOverlayRef.current?.setData(infraFeatures, {
      resourceMarkerSize,
      siteMarkerSize,
      excludeNodeId: selectedNodeId,
      roleByCode: siteRoleByCode,
    });
  }, [
    infraFeatures,
    resourceMarkerSize,
    siteMarkerSize,
    selectedNodeId,
    mapsReady,
    siteRoleByCode,
  ]);

  // Descarta a camada de infra passiva no desmonte, junto do mapa.
  useEffect(
    () => () => {
      infraOverlayRef.current?.destroy();
      infraOverlayRef.current = null;
    },
    [],
  );

  // Repassa os locais do Projeto pra camada de canvas — mesma razão do efeito de infra
  // passiva acima: troca de seleção precisa de redraw mesmo sem `projectSiteFeatures` ter
  // mudado, porque o selecionado é excluído do desenho (ver excludeNodeId, issue #72).
  useEffect(() => {
    projectSiteOverlayRef.current?.setData(projectSiteFeatures, {
      siteMarkerSize,
      resourceMarkerSize,
      excludeNodeId: selectedNodeId,
    });
  }, [projectSiteFeatures, siteMarkerSize, resourceMarkerSize, selectedNodeId, mapsReady]);

  // Descarta a camada de locais de Projeto no desmonte, junto do mapa.
  useEffect(
    () => () => {
      projectSiteOverlayRef.current?.destroy();
      projectSiteOverlayRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!mapsReady || !mapRef.current || !selectedBaseLayer) return;
    mapRef.current.setMapTypeId(selectedBaseLayer.googleMapTypeId);
    // `mapTypeId` sozinho não basta: Mapa e Branco usam o mesmo `roadmap`, o que muda é o
    // `styles` (ver BASE_MAP_LAYERS em MapBaseLayerSelector).
    mapRef.current.setOptions({ styles: selectedBaseLayer.mapStyles });
  }, [mapsReady, selectedBaseLayer]);

  // Referência à última seleção aplicada aos marcadores — o que o efeito de troca de seleção
  // (logo abaixo) usa para saber qual marcador "desligar" sem precisar que o efeito de
  // criação/reposicionamento (este aqui) rode de novo.
  const appliedSelectedNodeIdRef = useRef<string | null>(null);

  // Pins dos nós visíveis. Local é quadrado arredondado e recurso é círculo —
  // é o que deixa dizer "isto é um lugar" e "isto é um equipamento" sem legenda.
  //
  // Marcadores são reusados por id (nunca destruídos/recriados à toa). Não depende de
  // `selectedNodeId`: trocar a seleção NÃO deve reprocessar todos os N marcadores — o
  // alfinete de seleção (selectionMarkerRef, efeito à parte) já marca sem ambiguidade o item
  // ativo, e o efeito seguinte cuida só de destacar o ícone por baixo dele. Sem essa separação,
  // clicar um pin reescrevia setIcon/setPosition/setZIndex nos milhares de marcadores visíveis
  // — o maior custo de interação do mapa em área densa.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;

    const selectedNodeIdAtRun = appliedSelectedNodeIdRef.current;
    const visibleIds = new Set<string>();
    const activeMarkers: GoogleMarkerInstance[] = [];

    for (const node of nodes) {
      if (node.geometry?.type !== 'Point') continue;
      visibleIds.add(node.id);
      nodeByIdRef.current.set(node.id, node);
      const [lng, lat] = node.geometry.coordinates;
      const selected = node.id === selectedNodeIdAtRun;
      const existing = markersRef.current.get(node.id);
      const visual = buildPointMarkerVisual(
        maps,
        node,
        selected,
        siteMarkerSize,
        resourceMarkerSize,
      );

      if (existing) {
        existing.setPosition({ lng, lat });
        existing.setIcon(visual.iconOptions);
        existing.setZIndex(visual.zIndex);
      } else {
        const marker = new maps.Marker({
          position: { lng, lat },
          title: visual.title,
          icon: visual.iconOptions,
          zIndex: visual.zIndex,
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

    // Cada ponto é um ícone individual no mapa — sem agrupamento. De 50 m para cima a leitura
    // da rede fica por conta da camada de cobertura GPON (ver CoverageOverlay), não de clusters.
    for (const marker of activeMarkers) marker.setMap(mapRef.current);
  }, [mapsReady, nodes, siteMarkerSize, resourceMarkerSize]);

  // Troca de seleção: toca só os 1-2 marcadores cujo `selected` de fato mudou (o que estava
  // selecionado antes e o que passou a estar agora), em vez de reprocessar todos os N do efeito
  // acima. Precisa do mesmo `buildPointMarkerVisual` para o ícone crescer/voltar ao tamanho do
  // tier — o resto (posição, criação/remoção) é responsabilidade exclusiva do outro efeito.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !maps) return;
    const previousId = appliedSelectedNodeIdRef.current;
    appliedSelectedNodeIdRef.current = selectedNodeId;
    if (previousId === selectedNodeId) return;

    for (const id of [previousId, selectedNodeId]) {
      if (!id) continue;
      const marker = markersRef.current.get(id);
      const node = nodeByIdRef.current.get(id);
      if (!marker || !node || node.geometry?.type !== 'Point') continue;
      const visual = buildPointMarkerVisual(
        maps,
        node,
        id === selectedNodeId,
        siteMarkerSize,
        resourceMarkerSize,
      );
      marker.setIcon(visual.iconOptions);
      marker.setZIndex(visual.zIndex);
    }
  }, [mapsReady, selectedNodeId, siteMarkerSize, resourceMarkerSize]);

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

  // Marker isolado do nó selecionado quando ele cai fora de `nodes` (fora do recorte de
  // escala/viewport) — único ponto que toca `pinnedNode`, nunca o efeito dos N marcadores
  // normais acima. Mesmo padrão de `draftMarkerRef`: um Marker próprio, criado/atualizado/
  // removido por este efeito só (issue #72).
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;
    if (!pinnedNode || pinnedNode.geometry?.type !== 'Point') {
      pinnedMarkerRef.current?.setMap(null);
      pinnedMarkerRef.current = null;
      return;
    }
    const [lng, lat] = pinnedNode.geometry.coordinates;
    const visual = buildPointMarkerVisual(maps, pinnedNode, true, siteMarkerSize, resourceMarkerSize);
    nodeByIdRef.current.set(pinnedNode.id, pinnedNode);
    if (!pinnedMarkerRef.current) {
      const marker = new maps.Marker({
        position: { lng, lat },
        title: visual.title,
        icon: visual.iconOptions,
        zIndex: visual.zIndex,
        map: mapRef.current,
      });
      marker.addListener('click', () =>
        onSelectNodeRef.current(nodeByIdRef.current.get(pinnedNode.id) ?? pinnedNode),
      );
      marker.addListener('mouseover', () =>
        onHoverNodeRef.current(nodeByIdRef.current.get(pinnedNode.id) ?? pinnedNode),
      );
      marker.addListener('mouseout', () => onHoverNodeRef.current(null));
      pinnedMarkerRef.current = marker;
    } else {
      pinnedMarkerRef.current.setPosition({ lng, lat });
      pinnedMarkerRef.current.setIcon(visual.iconOptions);
      pinnedMarkerRef.current.setZIndex(visual.zIndex);
    }
  }, [mapsReady, pinnedNode, siteMarkerSize, resourceMarkerSize]);

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

    // O snap visível é sempre memorizado (classifica a próxima transição). Já o foco só é
    // marcado como "enquadrado" quando REALMENTE voamos: um foco novo que chegou com a
    // folha em `full` (ex.: trocar de CDO na Viabilidade, que recolhe a folha para mid)
    // fica pendente e é enquadrado quando a folha assenta em mid/peek — recentralizando o
    // drop, como se o usuário tivesse recolhido e reaberto no meio.
    framedBottomSheetStateRef.current = currentSheet;
    if (!shouldFrame) return;
    framedFocusRequestRef.current = focusRequest;

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
    if (addressResolution?.mode === 'conflict') {
      selectionMarkerRef.current?.setMap(null);
      selectionMarkerRef.current = null;
      return;
    }
    const node =
      (selectedNodeId ? nodeByIdRef.current.get(selectedNodeId) : undefined) ?? selectedNode;
    const addressLocation = Array.isArray(addressPoint) ? undefined : addressPoint;
    const point = node
      ? treeNodePoint(node)
      : addressLocation
        ? addressLocation.coordinates
        : Array.isArray(addressPoint)
          ? addressPoint
          : null;
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
      selectionMarkerRef.current.setOptions({
        title: node
          ? undefined
          : `Localização usada: ${addressLocation?.source === 'geonet' ? 'GEONET' : 'Google Maps'} · ${addressLocation?.precision ?? ''}`,
      });
    } else {
      selectionMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        position: { lng, lat },
        icon: iconOptions,
        zIndex: SELECTION_PIN_Z,
        clickable: false,
        title: node
          ? undefined
          : `Localização usada: ${addressLocation?.source === 'geonet' ? 'GEONET' : 'Google Maps'} · ${addressLocation?.precision ?? ''}`,
      });
    }
  }, [mapsReady, selectedNodeId, selectedNode, nodes, addressPoint, addressResolution]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;
    if (addressResolution?.mode !== 'conflict') {
      for (const marker of addressSourceMarkersRef.current.values()) marker.setMap(null);
      addressSourceMarkersRef.current.clear();
      return;
    }
    for (const source of ['google', 'geonet'] as const) {
      const location = addressResolution[source];
      const selected = addressResolution.selectedSource === source;
      const pin = addressSourcePin(source, selected);
      const icon = {
        url: pin.url,
        scaledSize: new maps.Size(pin.width, pin.height),
        anchor: new maps.Point(pin.anchorX, pin.anchorY),
      };
      const title = `${source === 'google' ? 'Google Maps' : 'GEONET'}${selected ? ' — selecionado' : ''}`;
      // O pin escolhido fica por cima quando os dois pontos estão próximos.
      const zIndex = selected ? SELECTION_PIN_Z + 1 : SELECTION_PIN_Z;
      const marker = addressSourceMarkersRef.current.get(source);
      if (marker) {
        marker.setPosition({ lng: location.coordinates[0], lat: location.coordinates[1] });
        marker.setIcon(icon);
        marker.setOptions({ title, zIndex });
      } else {
        addressSourceMarkersRef.current.set(
          source,
          new maps.Marker({
            map: mapRef.current,
            position: { lng: location.coordinates[0], lat: location.coordinates[1] },
            icon,
            title,
            clickable: false,
            zIndex,
          }),
        );
      }
    }
  }, [addressResolution, mapsReady]);

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

  // Trajeto do drop físico da Porta (homologação CDOE-02-ICARAI): mesma técnica de
  // desenho da simulação de Viabilidade acima, mas canal isolado (inventário real, não
  // hipótese) e com dois estilos — 'active' anima igual ao pontilhado amarelo de sempre,
  // 'muted' é um traço cinza estático (churn ou drop histórico: não passar ideia de uso).
  // Sem rótulo de distância em nenhum dos dois: aqui o que importa é "existe trajeto", não
  // "quanto mede".
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;

    const stopAnimation = () => {
      if (portDropAnimationRef.current !== undefined) {
        window.clearInterval(portDropAnimationRef.current);
        portDropAnimationRef.current = undefined;
      }
    };

    if (!portDropPreview || portDropPreview.path.length < 2) {
      stopAnimation();
      portDropBaseRef.current?.setMap(null);
      portDropDashRef.current?.setMap(null);
      portDropBaseRef.current = null;
      portDropDashRef.current = null;
      return;
    }

    const path = portDropPreview.path.map(([lng, lat]) => ({ lng, lat }));
    const isActive = portDropPreview.style === 'active';
    const dashColor = isActive ? DROP_ACCENT : DROP_MUTED;

    const dashIcons = (offsetPercent: number) => [
      {
        icon: {
          path: 'M 0,-1 0,1',
          strokeColor: dashColor,
          strokeOpacity: 1,
          strokeWeight: 4,
          scale: 3.5,
        },
        offset: `${offsetPercent}%`,
        repeat: '14px',
      },
    ];

    if (portDropBaseRef.current) {
      portDropBaseRef.current.setPath(path);
      portDropBaseRef.current.setMap(mapRef.current);
    } else {
      portDropBaseRef.current = new maps.Polyline({
        map: mapRef.current,
        path,
        strokeColor: DROP_INK,
        strokeOpacity: isActive ? 0.85 : 0.5,
        strokeWeight: 5,
        zIndex: DROP_SIMULATION_Z,
        clickable: false,
      });
    }

    if (portDropDashRef.current) {
      portDropDashRef.current.setPath(path);
      portDropDashRef.current.setOptions({ icons: dashIcons(0) });
      portDropDashRef.current.setMap(mapRef.current);
    } else {
      portDropDashRef.current = new maps.Polyline({
        map: mapRef.current,
        path,
        strokeOpacity: 0,
        zIndex: DROP_SIMULATION_Z + 1,
        clickable: false,
        icons: dashIcons(0),
      });
    }

    // Só o estilo 'active' anima — 'muted' fica parado de propósito, reforçando a
    // ideia de "fora de uso" (o movimento é justamente o que sugere tráfego real).
    stopAnimation();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (isActive && !reduceMotion) {
      let offset = 0;
      portDropAnimationRef.current = window.setInterval(() => {
        offset = (offset + 2) % 100;
        portDropDashRef.current?.setOptions({ icons: dashIcons(offset) });
      }, DROP_DASH_INTERVAL_MS);
    }

    return stopAnimation;
  }, [portDropPreview, mapsReady]);

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
      userLocationHaloRef.current?.setMap(null);
      userLocationHaloRef.current = null;
    },
    [],
  );

  // Geolocalização do dispositivo (ver MapLocateButton): crava o ponto azul de "minha
  // localização" com um halo de incerteza (raio = precisão do fix), distinto dos pins de
  // inventário e do alfinete. `isFirst` marca a primeira leitura da aquisição — a única
  // que move a câmera: as melhoras do refino e o rastreamento vivo só reposicionam ponto e
  // halo, para não roubar um enquadramento que o usuário possa ter ajustado à mão.
  const handleDeviceLocate = useCallback(
    ({ lat, lng, accuracy }: DeviceLocation, isFirst: boolean) => {
      const maps = window.google?.maps;
      if (!mapsReady || !mapRef.current || !maps) return;

      if (isFirst) {
        // Enquadramento honesto: num fix grosseiro, deixamos o `fitSpanMeters` AFASTAR para
        // o halo inteiro (diâmetro = 2×accuracy) caber — em vez de prometer precisão de
        // calçada. Com fix bom/médio, pousa no zoom de rua INTEIRO (o `setZoom` fracionário
        // inflava marcadores e borrava os tiles).
        const target: FlyTarget =
          accuracy > DEVICE_LOCATION_POOR_ACCURACY_M
            ? { point: [lng, lat], scaleMeters: null, fitSpanMeters: accuracy * 2 }
            : { point: [lng, lat], scaleMeters: DEVICE_LOCATION_SCALE_METERS };
        // Com um painel mobile cobrindo a base do mapa, desconta a altura para o ponto não
        // pousar sob a folha (mesmo cálculo do enquadramento de foco).
        const bottomSheetHeightPx = bottomSheetState?.heightPx;
        const bottomInsetPx =
          bottomSheetHeightPx === undefined
            ? 0
            : bottomInsetForOverlay(
                mapRef.current.getDiv().getBoundingClientRect(),
                bottomSheetHeightPx,
                window.innerHeight,
              );
        flyTo(mapRef.current, target, {
          bottomInsetPx,
          onFlightChange: (active) => {
            flightActiveRef.current = active;
            if (!active) reportViewportRef.current();
          },
        });
      }

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

      // Halo de incerteza sob o ponto (zIndex logo abaixo dele). Só é desenhado quando a
      // precisão é um número útil; caso contrário some, para não pintar um círculo sem
      // significado.
      const reliableAccuracy = Number.isFinite(accuracy) && accuracy > 0;
      if (userLocationHaloRef.current) {
        if (reliableAccuracy) {
          userLocationHaloRef.current.setCenter({ lat, lng });
          userLocationHaloRef.current.setRadius(accuracy);
          userLocationHaloRef.current.setMap(mapRef.current);
        } else {
          userLocationHaloRef.current.setMap(null);
        }
      } else if (reliableAccuracy) {
        userLocationHaloRef.current = new maps.Circle({
          map: mapRef.current,
          center: { lat, lng },
          radius: accuracy,
          fillColor: '#1a73e8',
          fillOpacity: 0.12,
          strokeColor: '#1a73e8',
          strokeOpacity: 0.25,
          strokeWeight: 1,
          clickable: false,
          zIndex: USER_LOCATION_Z - 1,
        });
      }
    },
    [mapsReady, bottomSheetState],
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
    let cancelAcquire: (() => void) | undefined;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== 'granted' || selectedNodeIdRef.current) return;
        // Mesma aquisição refinada do botão (ver deviceLocation): pousa na primeira leitura
        // e vai apertando o fix. Silencioso — o auto-locate não mostra erro; se falhar, fica
        // para o clique explícito no botão Minha localização.
        cancelAcquire = acquireDeviceLocation({
          onUpdate: (coords, isFirst) => {
            // O usuário pode ter selecionado algo enquanto o fix chegava — aí paramos de
            // mexer no mapa para não roubar o enquadramento dele.
            if (cancelled || selectedNodeIdRef.current) return;
            handleDeviceLocate(coords, isFirst);
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cancelAcquire?.();
    };
  }, [mapsReady, handleDeviceLocate, autoLocateOnOpen]);

  if (!GOOGLE_MAPS_KEY) {
    // Sem chave do Maps não há script a carregar; a barra reflete só a carga de dados do
    // chamador (catálogo, recursos, hierarquia).
    return (
      <>
        <MapLoadingBar busy={busy} />
        <FallbackMap nodes={nodes} draftAddress={draftAddress} onSelectNode={onSelectNode} />
      </>
    );
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
      <MapLoadingBar busy={busy || mapsLoading} />
      <MapBaseLayerSelector value={baseLayerId} onChange={setBaseLayerId} />
      <MapLocateButton onLocate={handleDeviceLocate} />
      <MapLayerControl
        layers={mapLayers}
        onToggleLayer={onToggleMapLayer}
        onToggleGroup={onToggleMapLayerGroup}
        onReset={onResetMapLayers}
        allVisible={mapLayersAllVisible}
        scaleMeters={mapLayersScaleMeters}
      />
      {coverage ? <CoverageLegend /> : null}
      {balloon ? createPortal(<MapBalloonCard balloon={balloon} />, balloonNode) : null}
    </>
  );
}

// Legenda da cobertura GPON: a rampa de disponibilidade (vermelho → verde). Aparece só quando
// a camada está visível. Cor via coverageSwatch (mesma rampa do canvas), não token hardcoded.
function CoverageLegend() {
  return (
    <div
      role="group"
      aria-label="Legenda da cobertura GPON"
      className="pointer-events-none absolute bottom-8 left-1/2 z-30 -translate-x-1/2 rounded-[14px] border border-app-border bg-white/90 px-2 py-2 text-[0.66rem] shadow-map-control backdrop-blur sm:px-3 sm:text-[0.72rem]"
    >
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="text-app-muted">Suspenso</span>
        <span
          className="h-2.5 w-16 rounded-full sm:w-24"
          style={{
            background: `linear-gradient(90deg, ${coverageSwatch(0)}, ${coverageSwatch(0.5)}, ${coverageSwatch(1)})`,
          }}
        />
        <span className="text-app-muted">Disponível</span>
      </div>
    </div>
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
              {/* Sem `truncate`: substatus/modelo/endereço podem ser longos e devem
                  quebrar em mais de uma linha em vez de virar "…". */}
              <dd className="break-words text-[0.78rem] leading-snug text-app-text">{value}</dd>
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
              node.status,
            )
          : resourceIconFor({
              resourceType: node.resourceType ?? '',
              status: node.status,
              name: node.label,
              sublabel: node.sublabel,
            });
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
