// Controle de camadas do mapa Geo (RF-011, REQ-MOD01-011): liga/desliga fetch + render por
// grupo. É núcleo puro (sem React) — compartilhado entre o hook de estado (useMapLayers), o
// controle flutuante (MapLayerControl) e o serviço HTTP (geoTreeApi.fetchViewportResources),
// para os três lerem o mesmo catálogo e a mesma regra de tri-state de grupo.

import { poleVisibleAtScale } from './mapScale';
import { isCdoiResource } from './resourceIcon';

export type MapLayerId =
  | 'stations'
  | 'siteNetwork'
  | 'siteService'
  | 'netwinTower'
  | 'coverage'
  | 'netwinPole'
  | 'netwinDuct'
  | 'netwinManhole'
  | 'resourceCdoe'
  | 'resourceCdoi'
  | 'resourceCeo'
  | 'resourceDio'
  | 'resourceFiberCable'
  | 'resourceDropCable';

export type MapLayerVisibility = Record<MapLayerId, boolean>;

export const ALL_MAP_LAYERS_VISIBLE: MapLayerVisibility = {
  stations: true,
  siteNetwork: true,
  siteService: true,
  netwinTower: true,
  coverage: true,
  netwinPole: true,
  netwinDuct: true,
  netwinManhole: true,
  resourceCdoe: true,
  resourceCdoi: true,
  resourceCeo: true,
  resourceDio: true,
  resourceFiberCable: true,
  resourceDropCable: true,
};

export type MapLayerGroupId = 'locations' | 'coverage' | 'netwinInfrastructure' | 'resources';

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
// em português, sem código cru de spec. Torre entra em Locais por pedido do usuário mesmo
// sendo tecnicamente um PhysicalResource (mesma camada `netwinTower` de sempre — só muda o
// grupo em que aparece na UI).
export const MAP_LAYER_GROUPS: readonly MapLayerGroup[] = [
  {
    id: 'locations',
    label: 'Locais',
    children: [
      { id: 'stations', label: 'Estações', hint: 'CO — sempre buscadas, só o desenho é afetado' },
      {
        id: 'siteNetwork',
        label: 'Sites de Rede',
        hint: 'CO, POP, Armário, Sala técnica, Contêiner…',
      },
      {
        id: 'siteService',
        label: 'Sites de Serviço',
        hint: 'Unidade atendida (casa, apartamento)',
      },
      { id: 'netwinTower', label: 'Torres', hint: 'Estrutura de sustentação elevada' },
    ],
  },
  {
    id: 'coverage',
    label: 'Cobertura',
    hint: 'Manchas agregadas por tema — hoje só GPON, outras entram como novos itens do grupo',
    children: [{ id: 'coverage', label: 'Cobertura GPON', hint: 'Mancha por bairro' }],
  },
  {
    id: 'netwinInfrastructure',
    label: 'Infraestrutura Civil',
    children: [
      { id: 'netwinPole', label: 'Postes', hint: 'Poste de rede aérea' },
      {
        id: 'netwinDuct',
        label: 'Dutos',
        hint: 'Duto, tubo de subida, túnel de cabos, pedestal, suporte',
      },
      {
        id: 'netwinManhole',
        label: 'Caixas Subterrâneas',
        hint: 'Poço de visita / caixa enterrada',
      },
    ],
  },
  {
    id: 'resources',
    label: 'Recursos de Rede',
    children: [
      {
        id: 'resourceCdoe',
        label: 'CDOEs',
        hint: 'Caixa de terminação óptica externa (via pública)',
      },
      {
        id: 'resourceCdoi',
        label: 'CDOIs',
        hint: 'Caixa de terminação óptica interna (edificação)',
      },
      { id: 'resourceCeo', label: 'CEOs', hint: 'Caixa de emenda óptica' },
      { id: 'resourceDio', label: 'DIOs', hint: 'Distribuidor interno óptico' },
      { id: 'resourceFiberCable', label: 'Cabos de Fibra', hint: 'Backbone, distribuição e fibra' },
      { id: 'resourceDropCable', label: 'Cabo Drop', hint: 'Cabo de acesso até o cliente' },
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
  label?: string;
  sublabel?: string;
  siteCategory?: string;
};

// Tipos de recurso que caem numa camada fixa por typeCode. CTO fica de fora — CDOE/CDOI
// são o mesmo ResourceType e só se distinguem pelo nome (ver isCdoiResource).
const RESOURCE_LAYER_BY_TYPE: Partial<Record<string, MapLayerId>> = {
  Pole: 'netwinPole',
  Manhole: 'netwinManhole',
  Tower: 'netwinTower',
  DIO: 'resourceDio',
  SpliceClosure: 'resourceCeo',
  Duct: 'netwinDuct',
  RisingTube: 'netwinDuct',
  Pedestal: 'netwinDuct',
  SupportBracket: 'netwinDuct',
  CableTunnel: 'netwinDuct',
  IronPipe: 'netwinDuct',
  Fiber: 'resourceFiberCable',
  DistributionCable: 'resourceFiberCable',
  BackboneCable: 'resourceFiberCable',
  DropCable: 'resourceDropCable',
};

// Camada de site por papel funcional. `sublabel` da feature guarda o code da spec (ver
// map-feature-synchronizer.ts) — o catálogo de specs já está em memória no front
// (GeoPage carrega `specs`), então o roteamento é resolvido aqui sem coluna nova em
// `geo_map_feature` nem rebuild do índice de 1.5M+ linhas (dívida server-side registrada em
// Q-GEO-013, docs/1-overview/open-questions.md).
//
// Só existem duas camadas de site hoje (Sites de Rede / Sites de Serviço): qualquer papel
// diferente de "service" (grouping, network, property) ou desconhecido cai em Sites de Rede.
function siteLayerFor(
  feature: MapFeatureLayerLike,
  roleByCode: ReadonlyMap<string, MapSiteRole> | undefined,
): MapLayerId {
  const role = feature.sublabel ? roleByCode?.get(feature.sublabel) : undefined;
  return role === 'service' ? 'siteService' : 'siteNetwork';
}

// O tile é compartilhado por todos os filtros. As camadas gerais evitam fetch
// desnecessário; as camadas por tipo filtram cada classe sem multiplicar chamadas.
//
// `scaleMeters` é opcional (omitido = sem corte de escala, usado pelos testes que não simulam
// o mapa): hoje só o Poste tem régua própria, mais restrita que o corte geral de infra passiva
// (PASSIVE_INFRA_MAX_SCALE_METERS) — poluiria o desenho em qualquer escala mais aberta que a de
// campo (ver poleVisibleAtScale em mapScale.ts).
export function isMapFeatureVisible(
  feature: MapFeatureLayerLike,
  visibility: MapLayerVisibility,
  roleByCode?: ReadonlyMap<string, MapSiteRole>,
  scaleMeters?: number | null,
): boolean {
  if (feature.kind === 'site') {
    return visibility[siteLayerFor(feature, roleByCode)];
  }
  if (feature.typeCode === 'CTO') {
    return isCdoiResource({ name: feature.label })
      ? visibility.resourceCdoi
      : visibility.resourceCdoe;
  }
  const layer = feature.typeCode ? RESOURCE_LAYER_BY_TYPE[feature.typeCode] : undefined;
  if (layer === 'netwinPole' && scaleMeters !== undefined && !poleVisibleAtScale(scaleMeters)) {
    return false;
  }
  return layer === undefined || visibility[layer];
}

// O que pedir a /v1/geo/tree/viewport para a visibilidade atual — omitido (`undefined`) quando
// tudo está ligado, para o caminho quente não carregar um parâmetro extra à toa.
export function viewportInclude(visibility: MapLayerVisibility): ViewportShape[] | undefined {
  const shapes: ViewportShape[] = [];
  if (visibility.siteNetwork || visibility.siteService) shapes.push('sites');
  const anyResourcePoint =
    visibility.netwinPole ||
    visibility.netwinDuct ||
    visibility.netwinManhole ||
    visibility.netwinTower ||
    visibility.resourceCdoe ||
    visibility.resourceCdoi ||
    visibility.resourceCeo ||
    visibility.resourceDio;
  if (anyResourcePoint) shapes.push('resource-points');
  if (visibility.resourceFiberCable || visibility.resourceDropCable) shapes.push('resource-lines');
  if (shapes.length === 3) return undefined;
  return shapes;
}

const STORAGE_KEY = 'nexus.geo.mapLayers';

const isLayerId = (value: string): value is MapLayerId =>
  Object.prototype.hasOwnProperty.call(ALL_MAP_LAYERS_VISIBLE, value);

// Lê a preferência salva; qualquer coisa fora do formato esperado (JSON inválido, chave
// desconhecida, valor não-booleano, storage indisponível) cai no default "tudo visível" — a
// origem de dados nunca deve deixar o mapa em um estado que o usuário não escolheu. Chaves
// antigas do localStorage (`sites`, `netwinBuilding`, `resourcePoints`…) somem sozinhas:
// `isLayerId` só aceita o vocabulário atual, então não precisa versionar a chave de storage.
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
