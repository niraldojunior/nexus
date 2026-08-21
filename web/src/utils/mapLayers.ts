// Controle de camadas do mapa Geo (RF-011, REQ-MOD01-011): liga/desliga fetch + render por
// grupo. É núcleo puro (sem React) — compartilhado entre o hook de estado (useMapLayers), o
// controle flutuante (MapLayerControl) e o serviço HTTP (geoTreeApi.fetchViewportResources),
// para os três lerem o mesmo catálogo e a mesma regra de tri-state de grupo.

export type MapLayerId =
  | 'stations'
  | 'sites'
  | 'coverage'
  | 'resourcePoints'
  | 'resourceLines'
  | 'netwinPole'
  | 'netwinManhole'
  | 'netwinTower'
  | 'netwinCto'
  | 'netwinDio'
  | 'netwinRisingTube'
  | 'netwinSpliceClosure'
  | 'netwinPedestal'
  | 'netwinSupportBracket'
  | 'netwinCableTunnel'
  | 'netwinIronPipe'
  | 'netwinBuilding'
  | 'netwinCentral'
  | 'netwinRoom'
  | 'netwinTechnicalRoom'
  | 'netwinCabinet'
  | 'netwinCustomerSite'
  | 'netwinRemoteUnit'
  | 'netwinAdvancedRemoteUnit'
  | 'netwinTechnicalContainer';

export type MapLayerVisibility = Record<MapLayerId, boolean>;

export const ALL_MAP_LAYERS_VISIBLE: MapLayerVisibility = {
  stations: true,
  sites: true,
  coverage: true,
  resourcePoints: true,
  resourceLines: true,
  netwinPole: true,
  netwinManhole: true,
  netwinTower: true,
  netwinCto: true,
  netwinDio: true,
  netwinRisingTube: true,
  netwinSpliceClosure: true,
  netwinPedestal: true,
  netwinSupportBracket: true,
  netwinCableTunnel: true,
  netwinIronPipe: true,
  netwinBuilding: true,
  netwinCentral: true,
  netwinRoom: true,
  netwinTechnicalRoom: true,
  netwinCabinet: true,
  netwinCustomerSite: true,
  netwinRemoteUnit: true,
  netwinAdvancedRemoteUnit: true,
  netwinTechnicalContainer: true,
};

export type MapLayerGroupId = 'locations' | 'coverage' | 'resources' | 'netwinInfrastructure';

type MapLayerEntry = { id: MapLayerId; label: string; hint: string };

export type MapLayerGroup = {
  id: MapLayerGroupId;
  label: string;
  hint?: string;
  // Grupo sem filhos (Cobertura) usa o próprio id como camada única.
  children: MapLayerEntry[];
};

// Catálogo exibido pelo MapLayerControl, na mesma ordem em que aparece na UI. Estações
// nunca deixam de SER BUSCADAS (vêm de useGeoTree, que a Hierarquia já precisa) — desligar
// só tira do desenho; as outras quatro cortam a requisição no cliente (ver viewportInclude).
export const MAP_LAYER_GROUPS: readonly MapLayerGroup[] = [
  {
    id: 'locations',
    label: 'Locais',
    children: [
      { id: 'stations', label: 'Estações', hint: 'CO — sempre buscadas, só o desenho é afetado' },
      { id: 'sites', label: 'Pontos e sub-locais', hint: 'POP, CDO, Ponto de Instalação…' },
    ],
  },
  {
    id: 'coverage',
    label: 'Cobertura GPON',
    hint: 'Mancha de disponibilidade por bairro',
    children: [{ id: 'coverage', label: 'Cobertura GPON', hint: 'Mancha por bairro' }],
  },
  {
    id: 'resources',
    label: 'Recursos de Rede',
    children: [
      { id: 'resourcePoints', label: 'Caixas e equipamentos', hint: 'CTOs, splitters, ONTs…' },
      { id: 'resourceLines', label: 'Cabos e dutos', hint: 'Traçado na rua' },
    ],
  },
  {
    id: 'netwinInfrastructure',
    label: 'Infraestrutura Civil',
    hint: 'Filtros por tipo para validação da carga',
    children: [
      { id: 'netwinPole', label: 'Postes', hint: 'Pole' },
      { id: 'netwinManhole', label: 'Caixas subterrâneas', hint: 'Manhole' },
      { id: 'netwinTower', label: 'Torres', hint: 'Tower' },
      { id: 'netwinCto', label: 'CTOs e CDOIs', hint: 'CTO' },
      { id: 'netwinDio', label: 'DIOs', hint: 'DIO' },
      { id: 'netwinRisingTube', label: 'Tubos de subida', hint: 'RisingTube' },
      { id: 'netwinSpliceClosure', label: 'Caixas de emenda', hint: 'SpliceClosure' },
      { id: 'netwinPedestal', label: 'Pedestais', hint: 'Pedestal' },
      { id: 'netwinSupportBracket', label: 'Suportes', hint: 'SupportBracket' },
      { id: 'netwinCableTunnel', label: 'Túneis de cabos', hint: 'CableTunnel' },
      { id: 'netwinIronPipe', label: 'Tubos de ferro', hint: 'IronPipe' },
      { id: 'netwinBuilding', label: 'Edificações', hint: 'BUILDING' },
      { id: 'netwinCentral', label: 'Centrais / POPs', hint: 'CENTRAL_POP_LEGACY' },
      { id: 'netwinRoom', label: 'Salas', hint: 'ROOM' },
      { id: 'netwinTechnicalRoom', label: 'Salas técnicas', hint: 'TECHNICAL_ROOM' },
      { id: 'netwinCabinet', label: 'Armários', hint: 'CABINET' },
      { id: 'netwinCustomerSite', label: 'Sites de cliente', hint: 'CUSTOMER_SITE' },
      { id: 'netwinRemoteUnit', label: 'Unidades remotas', hint: 'REMOTE_UNIT' },
      { id: 'netwinAdvancedRemoteUnit', label: 'Unidades remotas avançadas', hint: 'ADVANCED_REMOTE_UNIT' },
      { id: 'netwinTechnicalContainer', label: 'Contêineres técnicos', hint: 'TECHNICAL_CONTAINER' },
    ],
  },
];

export type GroupVisibility = 'all' | 'some' | 'none';

export function groupVisibility(
  visibility: MapLayerVisibility,
  groupId: MapLayerGroupId,
): GroupVisibility {
  const group = MAP_LAYER_GROUPS.find((candidate) => candidate.id === groupId);
  if (!group || group.children.length === 0) return 'none';
  const states = group.children.map((child) => visibility[child.id]);
  if (states.every(Boolean)) return 'all';
  if (states.every((state) => !state)) return 'none';
  return 'some';
}

// Clique no grupo: algum filho ligado (inclusive parcial) desliga todos; todos desligados
// liga todos — mesmo padrão de checkbox tri-state indeterminado.
export function setGroupVisibility(
  visibility: MapLayerVisibility,
  groupId: MapLayerGroupId,
): MapLayerVisibility {
  const group = MAP_LAYER_GROUPS.find((candidate) => candidate.id === groupId);
  if (!group) return visibility;
  const next = groupVisibility(visibility, groupId) === 'none';
  const patch: Partial<MapLayerVisibility> = {};
  for (const child of group.children) patch[child.id] = next;
  return { ...visibility, ...patch };
}

export type ViewportShape = 'sites' | 'resource-points' | 'resource-lines';

type MapFeatureLayerLike = {
  kind: 'resource' | 'site';
  shape: 'point' | 'line';
  typeCode?: string;
  sublabel?: string;
};

const NETWIN_RESOURCE_LAYER_BY_TYPE: Partial<Record<string, MapLayerId>> = {
  Pole: 'netwinPole',
  Manhole: 'netwinManhole',
  Tower: 'netwinTower',
  CTO: 'netwinCto',
  DIO: 'netwinDio',
  RisingTube: 'netwinRisingTube',
  SpliceClosure: 'netwinSpliceClosure',
  Pedestal: 'netwinPedestal',
  SupportBracket: 'netwinSupportBracket',
  CableTunnel: 'netwinCableTunnel',
  IronPipe: 'netwinIronPipe',
};

const NETWIN_SITE_LAYER_BY_SPEC: Partial<Record<string, MapLayerId>> = {
  BUILDING: 'netwinBuilding',
  CENTRAL_POP_LEGACY: 'netwinCentral',
  ROOM: 'netwinRoom',
  TECHNICAL_ROOM: 'netwinTechnicalRoom',
  CABINET: 'netwinCabinet',
  CUSTOMER_SITE: 'netwinCustomerSite',
  REMOTE_UNIT: 'netwinRemoteUnit',
  ADVANCED_REMOTE_UNIT: 'netwinAdvancedRemoteUnit',
  TECHNICAL_CONTAINER: 'netwinTechnicalContainer',
};

// O tile Ã© compartilhado por todos os filtros. As camadas gerais evitam fetch
// desnecessÃ¡rio; as camadas Netwin filtram cada classe sem multiplicar chamadas.
export function isMapFeatureVisible(
  feature: MapFeatureLayerLike,
  visibility: MapLayerVisibility,
): boolean {
  if (feature.kind === 'site') {
    if (!visibility.sites) return false;
    const layer = feature.sublabel ? NETWIN_SITE_LAYER_BY_SPEC[feature.sublabel] : undefined;
    return layer === undefined || visibility[layer];
  }
  if (feature.shape === 'line') return visibility.resourceLines;
  if (!visibility.resourcePoints) return false;
  const layer = feature.typeCode ? NETWIN_RESOURCE_LAYER_BY_TYPE[feature.typeCode] : undefined;
  return layer === undefined || visibility[layer];
}

// O que pedir a /v1/geo/tree/viewport para a visibilidade atual — omitido (`undefined`) quando
// tudo está ligado, para o caminho quente não carregar um parâmetro extra à toa.
export function viewportInclude(visibility: MapLayerVisibility): ViewportShape[] | undefined {
  const shapes: ViewportShape[] = [];
  if (visibility.sites) shapes.push('sites');
  if (visibility.resourcePoints) shapes.push('resource-points');
  if (visibility.resourceLines) shapes.push('resource-lines');
  if (shapes.length === 3) return undefined;
  return shapes;
}

const STORAGE_KEY = 'nexus.geo.mapLayers';

const isLayerId = (value: string): value is MapLayerId =>
  Object.prototype.hasOwnProperty.call(ALL_MAP_LAYERS_VISIBLE, value);

// Lê a preferência salva; qualquer coisa fora do formato esperado (JSON inválido, chave
// desconhecida, valor não-booleano, storage indisponível) cai no default "tudo visível" — a
// origem de dados nunca deve deixar o mapa em um estado que o usuário não escolheu.
export function readStoredLayers(): MapLayerVisibility {
  if (typeof window === 'undefined') return ALL_MAP_LAYERS_VISIBLE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_MAP_LAYERS_VISIBLE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return ALL_MAP_LAYERS_VISIBLE;
    const result = { ...ALL_MAP_LAYERS_VISIBLE };
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isLayerId(key) && typeof value === 'boolean') result[key] = value;
    }
    return result;
  } catch {
    return ALL_MAP_LAYERS_VISIBLE;
  }
}

export function writeStoredLayers(visibility: MapLayerVisibility): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // Storage indisponível (modo privado, cota): a preferência só não persiste.
  }
}
