import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CoverageLegend, FallbackMap, MapBalloonCard, type MapBalloon } from './MapOverlays';
import {
  treeNodePoint,
  treeNodeRoute,
  type GeoTreeNode,
  type MapBounds,
} from '../../services/geoTreeApi';
import {
  GOOGLE_MAPS_KEY,
  loadGoogleMaps,
  reverseGeocode,
  type DraftAddress,
  type GoogleCircleInstance,
  type GoogleInfoWindowInstance,
  type GoogleMapInstance,
  type GoogleMapMouseEvent,
  type GoogleMapsApi,
  type GoogleMarkerInstance,
  type GooglePolylineInstance,
} from '../../utils/googleMaps';
import {
  mapScaleMeters,
  readGoogleScaleMeters,
  DEVICE_LOCATION_SCALE_METERS,
} from '../../utils/mapScale';
import { mapTileFeatureNodeId, type MapTileFeature } from '../../services/geoMapTileApi';
import {
  mapLayerEntities,
  mapLayerVisualRank,
  ALL_MAP_LAYERS_VISIBLE,
  MAP_LAYER_CATALOG_FALLBACK,
  readStoredBaseMap,
  writeStoredBaseMap,
  type MapLayerGroupId,
  type MapLayerId,
  type MapLayerVisibility,
  type MapSiteRole,
} from '../../utils/mapLayers';
import type { StudioGeoEntityNode } from '../../services/studioGeoApi';
import {
  operationalIconFactsForTreeNode,
  pointLayerForTreeNode,
  resolveOperationalIcon,
  visualIdentityForTreeNode,
} from '../../utils/pointIconPreview';
import { getStudioSvgAssetDataUrl } from '../../services/studioAssetApi';
import {
  normalizeStudioGeoVisualConfig,
  resolveStudioGeoVisualStyle,
  type ResolvedStudioGeoLineStyle,
  type ResolvedStudioGeoPointStyle,
  type ResolvedStudioGeoPolygonStyle,
} from '../../utils/studioGeoVisual';
import { prefersReducedMotion } from '../../utils/studioGeoStroke';
import { createCoverageOverlay, type CoverageOverlayHandle } from './CoverageOverlay';
import type { CoverageNeighborhood, CoverageResponse } from '../../services/geoCoverageApi';
import { bottomInsetForOverlay, flyTo, cancelFlight, type FlyTarget } from '../../utils/mapCamera';
import { BRAZIL_CENTER, BRAZIL_DEFAULT_ZOOM, type MapCamera } from '../../utils/geoViewState';
import { acquireDeviceLocation, DEVICE_LOCATION_POOR_ACCURACY_M } from '../../utils/deviceLocation';
import { useSession } from '../../hooks/useSession';
import { resourceIconFor, MARKER_ICON_SIZE, CABLE_STROKE_WEIGHT } from '../../utils/resourceIcon';
import { selectionPinDataUrl, addressSourcePin, SELECTION_PIN_ASPECT } from '../../utils/siteIcon';
import {
  type AddressPinLocation,
  type AddressLocationResolution,
  getBaseMapLayers,
  MapBaseLayerSelector,
  MapLayerControl,
  MapLoadingBar,
  MapLocateButton,
  type DeviceLocation,
  type DropSimulation,
} from './index';
import { type ProjectArea, type ProjectSite } from '../../services/geoProjectApi';
import { createProjectAreaOverlay, type ProjectAreaOverlayHandle } from './ProjectAreaOverlay';
import { createInfraOverlay, type InfraOverlayHandle } from './InfraOverlay';
import { createProjectSiteOverlay, type ProjectSiteOverlayHandle } from './ProjectSiteOverlay';
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
} from '../../utils/dropSimulation';
import type { BottomSheetSnapState } from '../../components/BottomSheet';

// Stub de GeoTreeNode a partir de uma feature do InfraOverlay (canvas do mapa, Fase 3 da
// issue #69) — clique/hover sobre o canvas não tem um GeoTreeNode pronto, só o essencial que o
// índice de tile carrega. Serve para hover e para abrir o painel na hora; a reidratação
// (`fetchTreeNode`) corrige o nó em segundo plano com o canônico (`detail` completo e, pra cabo,
// a rota inteira — não só o trecho recortado neste tile). Ver selectNodeFromInfraOverlay.
export function mapTileFeatureToNode(feature: MapTileFeature): GeoTreeNode {
  const node: GeoTreeNode = {
    id: mapTileFeatureNodeId(feature),
    kind: feature.kind,
    label: feature.label,
    refId: feature.entityId,
    // Régua otimista de hasChildren:true da Fase 1 pro recurso; Site (qualquer spec) começa
    // false e a reidratação (`fetchTreeNode`) corrige com o valor canônico.
    hasChildren: feature.kind === 'resource',
    geometry:
      feature.shape === 'line' && feature.geometry
        ? feature.geometry
        : { type: 'Point', coordinates: [feature.lng, feature.lat] },
  };
  if (feature.sublabel) node.sublabel = feature.sublabel;
  if (feature.typeCode) node.resourceType = feature.typeCode;
  if (feature.siteCategory) node.siteCategory = feature.siteCategory;
  if (feature.kind === 'site' && feature.sourceModelId) {
    node.siteSpecificationCode = feature.sourceModelId;
  }
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
/**
 * A identidade pertence ao tipo do modelo e a aparência pertence à entidade publicada do Studio.
 * Elas são buscadas e resolvidas separadamente para não criar uma segunda fonte de ícones.
 */
export function pointLayerForNode(
  node: GeoTreeNode,
  catalog: import('../../services/studioGeoApi').StudioGeoCatalog,
): StudioGeoEntityNode | undefined {
  return pointLayerForTreeNode(node, catalog);
}

export function pointStyleForNode(
  node: GeoTreeNode,
  catalog: import('../../services/studioGeoApi').StudioGeoCatalog,
  scaleMeters: number | null,
): ResolvedStudioGeoPointStyle | undefined {
  const layer = pointLayerForNode(node, catalog);
  if (!layer?.visualConfig) return undefined;
  const config = normalizeStudioGeoVisualConfig(layer.visualConfig, layer.entity, layer.label);
  const resolved = resolveStudioGeoVisualStyle(
    config,
    layer.entity.category,
    node.status,
    scaleMeters,
  );
  return resolved.geometryKind === 'POINT' ? resolved : undefined;
}

function buildPointMarkerVisual(
  maps: GoogleMapsApi['maps'],
  node: GeoTreeNode,
  selected: boolean,
  stationMarkerSize: number,
  resourceMarkerSize: number,
  catalog: import('../../services/studioGeoApi').StudioGeoCatalog,
  pointStyle?: ResolvedStudioGeoPointStyle,
  assetDataUrl?: string,
): { iconOptions: Record<string, unknown>; zIndex: number; title: string } {
  const facts = operationalIconFactsForTreeNode(node);
  if (!facts) throw new Error('Marcador operacional requer Resource ou Location.');
  // Elegibilidade e tamanho vêm da entidade publicada do Studio GEO. Quando não há
  // configuração, ambos os domínios usam o fallback neutro de Resource, sem privilegiar
  // códigos, nomes ou papéis de Local.
  const baseSize = node.kind === 'site' ? stationMarkerSize : resourceMarkerSize;
  const size = selected ? baseSize + 6 : (pointStyle?.sizePx ?? baseSize);
  const resolved = resolveOperationalIcon(facts, visualIdentityForTreeNode(node, catalog), {
    size,
    color: pointStyle?.color,
    opacity: pointStyle?.opacity,
  });

  return {
    iconOptions: {
      url: assetDataUrl ?? resolved.url,
      scaledSize: new maps.Size(size, size),
      // Recursos compartilham coordenada com o Site e ficam acima/à direita; Locations
      // permanecem centrados. Esta é uma regra de posicionamento, não de identidade.
      anchor: node.kind === 'site' ? new maps.Point(size / 2, size / 2) : new maps.Point(0, size),
    },
    zIndex: selected
      ? SELECTION_PIN_Z - 1
      : pointLayerZIndex(pointLayerForNode(node, catalog), catalog),
    title: `${node.label} · ${resolved.label}`,
  };
}

function lineStyleForNode(
  node: GeoTreeNode,
  catalog: import('../../services/studioGeoApi').StudioGeoCatalog,
  scaleMeters: number | null,
): ResolvedStudioGeoLineStyle | undefined {
  if (node.kind === 'site') return undefined;
  const layer = mapLayerEntities(catalog).find(
    (candidate) =>
      candidate.entity.sourceType === 'RESOURCE_TYPE' &&
      candidate.entity.sourceId === node.resourceType &&
      candidate.visualConfig?.geometryKind === 'LINE',
  );
  if (!layer?.visualConfig) return undefined;
  const config = normalizeStudioGeoVisualConfig(layer.visualConfig, layer.entity, layer.label);
  const resolved = resolveStudioGeoVisualStyle(
    config,
    layer.entity.category,
    node.status,
    scaleMeters,
  );
  return resolved.geometryKind === 'LINE' ? resolved : undefined;
}

// Tracejado numa google.maps.Polyline é feito de símbolos repetidos sobre um traço de opacidade
// zero — o "tracinho" é o próprio símbolo. Mesma técnica da simulação de drop mais abaixo, aqui
// parametrizada pelo estilo publicado no Studio. `offsetPercent` só varia no modo animado.
function polylineStyleOptions(
  maps: GoogleMapsApi['maps'],
  style: ResolvedStudioGeoLineStyle,
  offsetPercent = 0,
): Record<string, unknown> {
  if (style.strokeStyle === 'solid') {
    return {
      strokeColor: style.strokeColor,
      strokeOpacity: style.opacity,
      strokeWeight: style.strokeWidth,
      icons: [],
    };
  }
  const dashed = style.strokeStyle === 'dashed';
  return {
    strokeColor: style.strokeColor,
    strokeOpacity: 0,
    strokeWeight: style.strokeWidth,
    icons: [
      {
        icon: dashed
          ? {
              path: 'M 0,-1 0,1',
              strokeColor: style.strokeColor,
              strokeOpacity: style.opacity,
              strokeWeight: style.strokeWidth,
              scale: 3,
            }
          : {
              path: maps.SymbolPath.CIRCLE,
              fillColor: style.strokeColor,
              fillOpacity: style.opacity,
              strokeOpacity: 0,
              scale: Math.max(1, style.strokeWidth / 2),
            },
        offset: `${offsetPercent}%`,
        repeat: dashed ? '16px' : '12px',
      },
    ],
  };
}

// Faixas semânticas: o catálogo decide a ordem interna da planta; interação funcional continua
// acima dele. A primeira entidade publicada recebe o maior z-index operacional.
const OPERATIONAL_LAYER_Z_BASE = 100;
const OPERATIONAL_LAYER_Z_SPAN = 1000;

function pointLayerZIndex(
  layer: StudioGeoEntityNode | undefined,
  catalog: import('../../services/studioGeoApi').StudioGeoCatalog,
): number {
  if (!layer) return OPERATIONAL_LAYER_Z_BASE;
  const rank = mapLayerVisualRank(layer, catalog);
  return OPERATIONAL_LAYER_Z_BASE + OPERATIONAL_LAYER_Z_SPAN - Math.max(rank, 0);
}

// O ponto "minha localização" fica acima de tudo, inclusive do alfinete de seleção: é
// referência do usuário no mundo, não do inventário.
const USER_LOCATION_Z = 2500;

// O alfinete de seleção fica acima de tudo: precisa vencer local e recurso, que já
// crescem quando selecionados.
const SELECTION_PIN_Z = 2000;
const SELECTION_PIN_HEIGHT = 44;

// Destaque do item selecionado: halo azul translúcido atrás do ícone (ponto) ou faixa em volta
// do traçado (linha). Objetos do Google Maps não leem variáveis CSS, então espelha
// `--status-blue` (docs/4-design-system/tokens/colors.css). Larguras em pixels, para o destaque
// manter a mesma presença em qualquer zoom.
const SELECTION_HIGHLIGHT_COLOR = '#3b82f6';
const SELECTION_HIGHLIGHT_LINE_WEIGHT = 18;

// A simulação de drop (aba Viabilidade do painel de Endereço) desenha acima dos cabos
// reais — é sobreposição de estudo, tem de se destacar da planta —, mas abaixo do
// alfinete, que continua sendo o que diz "é aqui".
const DROP_SIMULATION_Z = 1500;
// Passo do pontilhado em movimento. 60 ms dá fluidez sem custar frame de mapa.
const DROP_DASH_INTERVAL_MS = 60;

// Centro e zoom nacionais: exibem todo o território brasileiro no primeiro acesso do usuário.
const DEFAULT_CENTER = BRAZIL_CENTER;
const DEFAULT_ZOOM = BRAZIL_DEFAULT_ZOOM;
// Aguarda a janela nativa de duplo clique antes de tratar clique simples no mapa.
const MAP_SINGLE_CLICK_DELAY_MS = 500;
const MAP_HOVER_DELAY_MS = 1_000;

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
  coverageStyle,
  coverageLayerLabel,
  siteMarkerSize,
  stationMarkerSize = siteMarkerSize,
  resourceMarkerSize,
  onCoverageHover,
  projectAreas = [],
  onProjectAreaHover = noopProjectAreaHover,
  autoLocateOnOpen = false,
  busy = false,
  mapLayerCatalog = MAP_LAYER_CATALOG_FALLBACK,
  mapLayers = ALL_MAP_LAYERS_VISIBLE,
  onToggleMapLayer = noopToggleMapLayer,
  onToggleMapLayerGroup = noopToggleMapLayerGroup,
  onResetMapLayers = noopResetMapLayers,
  mapLayersAllVisible = true,
  mapLayersScaleMeters = null,
  mapVisualScaleMeters = null,
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
  // Cobertura da viewport (mapa de calor por bairro), ou null quando fora de escala. O painel só
  // a desenha na camada de canvas (ver CoverageOverlay); a busca é do chamador.
  coverage: CoverageResponse | null;
  // Estilo da mancha já resolvido pelo catálogo publicado do Studio GEO para a escala atual.
  coverageStyle?: ResolvedStudioGeoPolygonStyle;
  // Rótulo da camada publicada no Studio GEO (ex.: "Cobertura GPON") — vira o texto da legenda
  // em vez de um nome de tecnologia fixo (ver CoverageLegend).
  coverageLayerLabel?: string;
  // Tamanho em px do pin de Site na escala atual (ver siteIconSizeForScale em mapScale.ts).
  siteMarkerSize: number;
  // Tamanho da Central Office publicado pelo Studio para a faixa de escala atual.
  stationMarkerSize?: number;
  // Tamanho em px do pin de Recurso na escala atual (ver resourceIconSizeForScale em
  // mapScale.ts). A visibilidade é resolvida pelo catálogo publicado do Studio GEO.
  resourceMarkerSize: number;
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
  // coverage, useMapTiles em GeoPage). O catálogo publicado vem do Studio; os testes seguem
  // usando o fallback canônico para montar o painel isoladamente.
  mapLayerCatalog?: import('../../services/studioGeoApi').StudioGeoCatalog;
  mapLayers?: MapLayerVisibility;
  onToggleMapLayer?: (id: MapLayerId) => void;
  onToggleMapLayerGroup?: (groupId: MapLayerGroupId) => void;
  onResetMapLayers?: () => void;
  mapLayersAllVisible?: boolean;
  // Escala atual do mapa (ver mapScale.ts) — repassada ao MapLayerControl só para inibir
  // camadas com régua própria mais restrita que o toggle manual (hoje só o Poste).
  mapLayersScaleMeters?: number | null;
  // Configuração visual publicada pelo Studio: o InfraOverlay resolve por feature a faixa de
  // escala, tamanho de ícone e estilo de traço definidos em cada nó de entidade.
  mapVisualScaleMeters?: number | null;
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
  // Camada de calor da cobertura (canvas em OverlayView, abaixo dos marcadores).
  const coverageOverlayRef = useRef<CoverageOverlayHandle | null>(null);
  const onCoverageHoverRef = useRef(onCoverageHover);
  const coverageHitTestRef = useRef<
    ((lng: number, lat: number) => CoverageNeighborhood | null) | null
  >(null);
  // Camada das manchas de concentração/dispersão do Projeto (REQ-MOD01-017), mesma técnica
  // de canvas da cobertura.
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
  const selectionHaloRef = useRef<GoogleMarkerInstance | null>(null);
  const selectionBandRef = useRef<GooglePolylineInstance | null>(null);
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
  // O mapa só abre preview após uma permanência deliberada no mesmo alvo. O hover da árvore e
  // dos painéis continua indo direto para `onHoverNode`, sem passar por este coordenador.
  const mapHoverTargetIdRef = useRef<string | null>(null);
  const mapHoverVisibleIdRef = useRef<string | null>(null);
  const mapHoverTimerRef = useRef<number | null>(null);
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
  // Assets SVG são carregados uma vez pelo client compartilhado e só atualizam os markers que
  // os referenciam quando o data URL chega; ícones nativos continuam inteiramente síncronos.
  const [assetDataUrls, setAssetDataUrls] = useState<ReadonlyMap<string, string>>(new Map());
  const { user } = useSession();
  const theme = user?.theme;
  const userId = user?.id ?? null;
  const baseMapLayers = useMemo(() => getBaseMapLayers(theme), [theme]);
  const [baseLayerId, setBaseLayerId] = useState(() =>
    readStoredBaseMap(baseMapLayers, mapLayerCatalog.environmentId, userId),
  );
  const selectedBaseLayer =
    baseMapLayers.find((layer) => layer.id === baseLayerId && !layer.disabled) ??
    baseMapLayers.find((layer) => !layer.disabled) ??
    baseMapLayers[0]!;

  const handleBaseLayerChange = useCallback(
    (nextBaseLayerId: string) => {
      if (!baseMapLayers.some((layer) => layer.id === nextBaseLayerId && !layer.disabled)) return;
      setBaseLayerId(nextBaseLayerId);
      writeStoredBaseMap(nextBaseLayerId, mapLayerCatalog.environmentId, userId);
    },
    [baseMapLayers, mapLayerCatalog.environmentId, userId],
  );

  useEffect(() => {
    setBaseLayerId(readStoredBaseMap(baseMapLayers, mapLayerCatalog.environmentId, userId));
  }, [baseMapLayers, mapLayerCatalog.environmentId, userId]);

  useEffect(() => {
    if (mapRef.current && mapsReady) {
      mapRef.current.setMapTypeId(selectedBaseLayer.googleMapTypeId);
      mapRef.current.setOptions({
        styles: selectedBaseLayer.mapStyles,
      });
    }
  }, [selectedBaseLayer, mapsReady]);

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

  // Agenda o preview só uma vez por alvo estável. Trocar/sair do alvo cancela a abertura
  // pendente; se o cartão já estava aberto, fecha na hora para nunca ficar preso longe da linha.
  const setMapHoverTarget = useCallback((node: GeoTreeNode | null) => {
    const nextId = node?.id ?? null;
    if (nextId === mapHoverTargetIdRef.current) return;
    mapHoverTargetIdRef.current = nextId;
    if (mapHoverTimerRef.current !== null) {
      window.clearTimeout(mapHoverTimerRef.current);
      mapHoverTimerRef.current = null;
    }
    if (mapHoverVisibleIdRef.current !== null) {
      mapHoverVisibleIdRef.current = null;
      onHoverNodeRef.current(null);
    }
    if (!node) return;
    mapHoverTimerRef.current = window.setTimeout(() => {
      mapHoverTimerRef.current = null;
      if (mapHoverTargetIdRef.current !== nextId) return;
      mapHoverVisibleIdRef.current = nextId;
      onHoverNodeRef.current(node);
    }, MAP_HOVER_DELAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (mapHoverTimerRef.current !== null) window.clearTimeout(mapHoverTimerRef.current);
    },
    [],
  );

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
    setMapHoverTarget(null);
    closeBalloonRef.current();
    if (mapRef.current) cancelFlight(mapRef.current);
    flightActiveRef.current = false;
    if (selectionActiveRef.current && !manualNavigationHandledRef.current) {
      manualNavigationHandledRef.current = true;
      onManualNavigationRef.current?.();
    }
  }, [clearPendingMapClick, setMapHoverTarget]);

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
    const assetIds = new Set<string>();
    for (const node of [...nodes, ...(pinnedNode ? [pinnedNode] : [])]) {
      const identity = visualIdentityForTreeNode(node, mapLayerCatalog);
      const assetId = identity?.kind === 'asset' ? identity.assetId : undefined;
      if (assetId && !assetDataUrls.has(assetId)) assetIds.add(assetId);
    }
    for (const assetId of assetIds) {
      void getStudioSvgAssetDataUrl(assetId).then((dataUrl) => {
        if (!dataUrl) return;
        setAssetDataUrls((current) => {
          if (current.get(assetId) === dataUrl) return current;
          return new Map(current).set(assetId, dataUrl);
        });
      });
    }
  }, [nodes, pinnedNode, mapLayerCatalog, assetDataUrls]);

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
          zoom: initialViewRef.current?.zoom ?? DEFAULT_ZOOM,
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
          const infraHit = pickingAddressRef.current
            ? null
            : infraOverlayRef.current?.hitTest(lng, lat);
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
        // Reporta a região visível e a escala atual para o chamador buscar infra passiva por
        // viewport; a escala só escolhe o LOD (tamanho/nível de detalhe), nunca se a camada é
        // visível — isso é 100% resolvido pelo catálogo publicado do Studio GEO.
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

        // Camada de calor da cobertura (canvas), abaixo dos marcadores. O hover sobre a
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
              setMapHoverTarget(projectSiteHit);
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
              setMapHoverTarget(hit ? mapTileFeatureToNode(hit) : null);
            }
          } else if (projectSiteHit) {
            // A prioridade do Local também precisa limpar uma linha/recurso que estava em hover.
            lastInfraHoverId = null;
          } else {
            // Overlay indisponível (ou acabou de ser desmontado): não deixa o último preview
            // do canvas preso na tela.
            lastInfraHoverId = null;
            setMapHoverTarget(null);
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
  }, [handleManualNavigation, selectedBaseLayer.googleMapTypeId, selectedBaseLayer.mapStyles]);

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
    coverageOverlayRef.current?.setData(coverage, coverageStyle);
  }, [coverage, coverageStyle, mapsReady]);

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
      catalog: mapLayerCatalog,
      scaleMeters: mapVisualScaleMeters,
    });
  }, [
    infraFeatures,
    resourceMarkerSize,
    siteMarkerSize,
    selectedNodeId,
    mapsReady,
    siteRoleByCode,
    mapLayerCatalog,
    mapVisualScaleMeters,
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
      const pointStyle = pointStyleForNode(node, mapLayerCatalog, mapVisualScaleMeters);
      const visual = buildPointMarkerVisual(
        maps,
        node,
        selected,
        stationMarkerSize,
        resourceMarkerSize,
        mapLayerCatalog,
        pointStyle,
        (() => {
          const identity = visualIdentityForTreeNode(node, mapLayerCatalog);
          return identity?.kind === 'asset' ? assetDataUrls.get(identity.assetId) : undefined;
        })(),
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
          setMapHoverTarget(nodeByIdRef.current.get(node.id) ?? node),
        );
        marker.addListener('mouseout', () => setMapHoverTarget(null));
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
    // da rede fica por conta da camada de cobertura (ver CoverageOverlay), não de clusters.
    for (const marker of activeMarkers) marker.setMap(mapRef.current);
  }, [
    mapsReady,
    nodes,
    stationMarkerSize,
    resourceMarkerSize,
    mapVisualScaleMeters,
    mapLayerCatalog,
    assetDataUrls,
    setMapHoverTarget,
  ]);

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
      const pointStyle = pointStyleForNode(node, mapLayerCatalog, mapVisualScaleMeters);
      const visual = buildPointMarkerVisual(
        maps,
        node,
        id === selectedNodeId,
        stationMarkerSize,
        resourceMarkerSize,
        mapLayerCatalog,
        pointStyle,
        (() => {
          const identity = visualIdentityForTreeNode(node, mapLayerCatalog);
          return identity?.kind === 'asset' ? assetDataUrls.get(identity.assetId) : undefined;
        })(),
      );
      marker.setIcon(visual.iconOptions);
      marker.setZIndex(visual.zIndex);
    }
  }, [
    mapsReady,
    selectedNodeId,
    stationMarkerSize,
    resourceMarkerSize,
    mapVisualScaleMeters,
    mapLayerCatalog,
    assetDataUrls,
  ]);

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
    const pinnedPointStyle = pointStyleForNode(pinnedNode, mapLayerCatalog, mapVisualScaleMeters);
    const visual = buildPointMarkerVisual(
      maps,
      pinnedNode,
      true,
      stationMarkerSize,
      resourceMarkerSize,
      mapLayerCatalog,
      pinnedPointStyle,
      (() => {
        const identity = visualIdentityForTreeNode(pinnedNode, mapLayerCatalog);
        return identity?.kind === 'asset' ? assetDataUrls.get(identity.assetId) : undefined;
      })(),
    );
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
        setMapHoverTarget(nodeByIdRef.current.get(pinnedNode.id) ?? pinnedNode),
      );
      marker.addListener('mouseout', () => setMapHoverTarget(null));
      pinnedMarkerRef.current = marker;
    } else {
      pinnedMarkerRef.current.setPosition({ lng, lat });
      pinnedMarkerRef.current.setIcon(visual.iconOptions);
      pinnedMarkerRef.current.setZIndex(visual.zIndex);
    }
  }, [
    mapsReady,
    pinnedNode,
    stationMarkerSize,
    resourceMarkerSize,
    mapLayerCatalog,
    mapVisualScaleMeters,
    assetDataUrls,
    setMapHoverTarget,
  ]);

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

  // Destaque do item selecionado. Ponto: círculo azul translúcido atrás do ícone (um Marker com
  // símbolo CIRCLE, de tamanho fixo em pixels). Linha: faixa larga e translúcida sob o traçado,
  // que mostra a extensão inteira dela e a distingue de linhas vizinhas. Ambos ficam abaixo do
  // ícone/Polyline reais e não capturam clique.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapsReady || !mapRef.current || !maps) return;
    const node =
      (selectedNodeId ? nodeByIdRef.current.get(selectedNodeId) : undefined) ?? selectedNode;
    const route = node ? treeNodeRoute(node) : null;
    const point =
      node && !route && node.geometry?.type === 'Point' ? node.geometry.coordinates : null;

    if (route) {
      const path = route.map(([lng, lat]) => ({ lng, lat }));
      if (selectionBandRef.current) {
        selectionBandRef.current.setPath(path);
      } else {
        selectionBandRef.current = new maps.Polyline({
          map: mapRef.current,
          path,
          clickable: false,
          zIndex: 0,
          strokeColor: SELECTION_HIGHLIGHT_COLOR,
          strokeOpacity: 0.3,
          strokeWeight: SELECTION_HIGHLIGHT_LINE_WEIGHT,
          geodesic: false,
        });
      }
    } else {
      selectionBandRef.current?.setMap(null);
      selectionBandRef.current = null;
    }

    if (point) {
      const [lng, lat] = point;
      // Ícone de recurso ancora no canto inferior-esquerdo; o de local é centrado (mesma regra
      // do alfinete acima). O símbolo desloca o centro do halo para o centro visual do ícone.
      const isPointResource = node?.kind === 'resource';
      const iconSize = MARKER_ICON_SIZE + 6;
      const scale = iconSize / 2 + 8;
      const shift = isPointResource ? iconSize / 2 : 0;
      const icon = {
        path: maps.SymbolPath.CIRCLE,
        scale,
        fillColor: SELECTION_HIGHLIGHT_COLOR,
        fillOpacity: 0.3,
        strokeColor: SELECTION_HIGHLIGHT_COLOR,
        strokeOpacity: 0.6,
        strokeWeight: 1.5,
        anchor: new maps.Point(-shift / scale, shift / scale),
      };
      if (selectionHaloRef.current) {
        selectionHaloRef.current.setPosition({ lng, lat });
        selectionHaloRef.current.setIcon(icon);
      } else {
        selectionHaloRef.current = new maps.Marker({
          map: mapRef.current,
          position: { lng, lat },
          icon,
          clickable: false,
          zIndex: 0,
        });
      }
    } else {
      selectionHaloRef.current?.setMap(null);
      selectionHaloRef.current = null;
    }
  }, [mapsReady, selectedNodeId, selectedNode, nodes]);

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
    // Um único relógio para todas as rotas com `animated-dotted` — um setInterval por cabo
    // multiplicaria timers por centenas de linhas na mesma viewport.
    const animated: Array<{ line: GooglePolylineInstance; style: ResolvedStudioGeoLineStyle }> = [];

    // O selecionado fora de `nodes` (cabo/trecho longo vindo só do canvas) também precisa da
    // Polyline real: InfraOverlay nunca desenha o `excludeNodeId`, então sem isto a linha some.
    const routeNodes =
      pinnedNode && !nodes.some((candidate) => candidate.id === pinnedNode.id)
        ? [...nodes, pinnedNode]
        : nodes;
    for (const node of routeNodes) {
      const route = treeNodeRoute(node);
      if (!route) continue;
      const style = lineStyleForNode(node, mapLayerCatalog, mapVisualScaleMeters);
      if (style && !style.visible) continue;
      visibleIds.add(node.id);
      nodeByIdRef.current.set(node.id, node);
      const icon = resourceIconFor({ resourceType: node.resourceType ?? '', status: node.status });
      const path = route.map(([lng, lat]) => ({ lng, lat }));
      const options = style
        ? polylineStyleOptions(maps, style)
        : {
            strokeColor: icon.color,
            strokeOpacity: 0.9,
            strokeWeight: CABLE_STROKE_WEIGHT[icon.code] ?? 2.5,
            icons: [],
          };
      const layer = mapLayerEntities(mapLayerCatalog).find(
        (candidate) =>
          candidate.entity.sourceType === 'RESOURCE_TYPE' &&
          candidate.entity.sourceId === node.resourceType &&
          candidate.visualConfig?.geometryKind === 'LINE',
      );
      const zIndex = pointLayerZIndex(layer, mapLayerCatalog);
      const existing = cableRoutesRef.current.get(node.id);

      if (existing) {
        existing.setPath(path);
        existing.setOptions({ ...options, zIndex });
        if (style?.strokeStyle === 'animated-dotted') animated.push({ line: existing, style });
        continue;
      }

      const line = new maps.Polyline({
        map: mapRef.current,
        path,
        zIndex,
        ...options,
      });
      line.addListener('click', () =>
        onSelectNodeRef.current(nodeByIdRef.current.get(node.id) ?? node),
      );
      line.addListener('mouseover', () =>
        setMapHoverTarget(nodeByIdRef.current.get(node.id) ?? node),
      );
      line.addListener('mouseout', () => setMapHoverTarget(null));
      cableRoutesRef.current.set(node.id, line);
      if (style?.strokeStyle === 'animated-dotted') animated.push({ line, style });
    }

    for (const [id, line] of cableRoutesRef.current) {
      if (!visibleIds.has(id)) {
        line.setMap(null);
        cableRoutesRef.current.delete(id);
      }
    }

    // Quem pediu menos movimento no sistema operacional fica com o pontilhado parado — a
    // informação é a mesma (mesma regra da simulação de drop).
    if (animated.length === 0 || prefersReducedMotion()) return;
    let offset = 0;
    const timer = window.setInterval(() => {
      offset = (offset + 2) % 100;
      for (const entry of animated) {
        entry.line.setOptions(polylineStyleOptions(maps, entry.style, offset));
      }
    }, DROP_DASH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [mapsReady, nodes, pinnedNode, mapLayerCatalog, mapVisualScaleMeters, setMapHoverTarget]);

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
        <FallbackMap
          nodes={nodes}
          catalog={mapLayerCatalog}
          draftAddress={draftAddress}
          onSelectNode={onSelectNode}
        />
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
      <MapBaseLayerSelector
        options={baseMapLayers}
        value={baseLayerId}
        onChange={handleBaseLayerChange}
      />
      <MapLocateButton onLocate={handleDeviceLocate} />
      <MapLayerControl
        catalog={mapLayerCatalog}
        layers={mapLayers}
        onToggleLayer={onToggleMapLayer}
        onToggleGroup={onToggleMapLayerGroup}
        onReset={onResetMapLayers}
        allVisible={mapLayersAllVisible}
        scaleMeters={mapLayersScaleMeters}
      />
      {coverage ? <CoverageLegend layerLabel={coverageLayerLabel} /> : null}
      {balloon ? createPortal(<MapBalloonCard balloon={balloon} />, balloonNode) : null}
    </>
  );
}
