// Controle de camadas do mapa Geo (RF-011, REQ-MOD01-011): liga/desliga fetch + render por
// grupo. É núcleo puro (sem React) — compartilhado entre o hook de estado (useMapLayers), o
// controle flutuante (MapLayerControl) e o serviço HTTP (geoTreeApi.fetchViewportResources),
// para os três lerem o mesmo catálogo e a mesma regra de tri-state de grupo.

export type MapLayerId =
  | 'stations'
  | 'siteNetwork'
  | 'siteProperty'
  | 'siteService'
  | 'siteSublocal'
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
  | 'netwinIronPipe';

export type MapLayerVisibility = Record<MapLayerId, boolean>;

export const ALL_MAP_LAYERS_VISIBLE: MapLayerVisibility = {
  stations: true,
  siteNetwork: true,
  siteProperty: true,
  siteService: true,
  siteSublocal: true,
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
// só tira do desenho; as outras cortam a requisição no cliente (ver viewportInclude).
//
// "Locais" é organizado por papel funcional (siteRole, C11) — o que o site É — e não por
// categoria estrutural: Site é conceito agnóstico a telecom, então os rótulos são todos
// em português, sem código cru de spec.
export const MAP_LAYER_GROUPS: readonly MapLayerGroup[] = [
  {
    id: 'locations',
    label: 'Locais',
    children: [
      { id: 'stations', label: 'Estações', hint: 'CO — sempre buscadas, só o desenho é afetado' },
      { id: 'siteNetwork', label: 'Sites de Rede', hint: 'CO, POP, Armário, Sala técnica, Contêiner…' },
      { id: 'siteProperty', label: 'Imóveis', hint: 'Condomínio, Edificação, Bloco' },
      { id: 'siteService', label: 'Sites de Serviço', hint: 'Unidade atendida (casa, apartamento)' },
      { id: 'siteSublocal', label: 'Sub-locais', hint: 'Pavimento, Sala, Área segmentada' },
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
      { id: 'netwinPole', label: 'Postes', hint: 'Poste de rede aérea' },
      { id: 'netwinManhole', label: 'Caixas subterrâneas', hint: 'Poço de visita / caixa enterrada' },
      { id: 'netwinTower', label: 'Torres', hint: 'Estrutura de sustentação elevada' },
      { id: 'netwinCto', label: 'CTOs e CDOIs', hint: 'Caixa de terminação óptica' },
      { id: 'netwinDio', label: 'DIOs', hint: 'Distribuidor interno óptico' },
      { id: 'netwinRisingTube', label: 'Tubos de subida', hint: 'Subida de fachada/poste' },
      { id: 'netwinSpliceClosure', label: 'Caixas de emenda', hint: 'Emenda de cabo óptico' },
      { id: 'netwinPedestal', label: 'Pedestais', hint: 'Base de fixação no solo' },
      { id: 'netwinSupportBracket', label: 'Suportes', hint: 'Fixação auxiliar de cabo' },
      { id: 'netwinCableTunnel', label: 'Túneis de cabos', hint: 'Passagem subterrânea de cabos' },
      { id: 'netwinIronPipe', label: 'Tubos de ferro', hint: 'Duto rígido de proteção' },
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

// Eixo funcional (C11) de uma GeographicSiteSpecification — o mesmo vocabulário de
// web/src/services/geoApi.ts GeoSiteRole, repetido aqui para o núcleo de camadas não
// depender do módulo de serviço HTTP.
export type MapSiteRole = 'grouping' | 'network' | 'property' | 'service';

type MapFeatureLayerLike = {
  kind: 'resource' | 'site';
  shape: 'point' | 'line';
  typeCode?: string;
  sublabel?: string;
  siteCategory?: string;
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

// Camada de site por papel funcional. `sublabel` da feature guarda o code da spec (ver
// map-feature-synchronizer.ts) — o catálogo de specs já está em memória no front
// (GeoPage carrega `specs`), então o roteamento é resolvido aqui sem coluna nova em
// `geo_map_feature` nem rebuild do índice de 1.5M+ linhas (dívida server-side registrada em
// Q-GEO-013, docs/1-overview/open-questions.md).
function siteLayerFor(
  feature: MapFeatureLayerLike,
  roleByCode: ReadonlyMap<string, MapSiteRole> | undefined,
): MapLayerId {
  const role = feature.sublabel ? roleByCode?.get(feature.sublabel) : undefined;
  if (role === 'service') return 'siteService';
  if (role === 'property') return 'siteProperty';
  if (role === 'grouping') return 'siteNetwork';
  if (role === 'network') return 'siteNetwork';
  // Code desconhecido (spec ad-hoc sem papel resolvido, ou catálogo ainda não carregado):
  // cai por categoria estrutural — SubSite é sub-local, o resto permanece visível como rede.
  if (feature.siteCategory === 'SubSite') return 'siteSublocal';
  return 'siteNetwork';
}

// O tile é compartilhado por todos os filtros. As camadas gerais evitam fetch
// desnecessário; as camadas Netwin filtram cada classe sem multiplicar chamadas.
export function isMapFeatureVisible(
  feature: MapFeatureLayerLike,
  visibility: MapLayerVisibility,
  roleByCode?: ReadonlyMap<string, MapSiteRole>,
): boolean {
  if (feature.kind === 'site') {
    return visibility[siteLayerFor(feature, roleByCode)];
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
  const anySiteLayer =
    visibility.siteNetwork ||
    visibility.siteProperty ||
    visibility.siteService ||
    visibility.siteSublocal;
  if (anySiteLayer) shapes.push('sites');
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
// origem de dados nunca deve deixar o mapa em um estado que o usuário não escolheu. Chaves
// antigas do localStorage (`sites`, `netwinBuilding`…) somem sozinhas: `isLayerId` só aceita o
// vocabulário atual, então não precisa versionar a chave de storage.
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
