import type { ResourceGeometryKind } from './domain.js';

/**
 * Resolução determinística da geometria canônica de um ResourceType já existente (issue #240).
 *
 * A autoria passou a viver em `ResourceType.geometryKind`, mas as bases atuais foram povoadas
 * antes disso: a geometria de cada tipo estava implícita na publicação do Studio GEO, no catálogo
 * de compatibilidade `legacy-*` ou apenas nas geometrias já gravadas das instâncias. Este módulo
 * concentra as três fontes de evidência em funções puras — a migration Oracle apenas as alimenta
 * com linhas do banco, para que a regra possa ser testada sem instância.
 *
 * A ordem é estrita e nunca "chuta": evidência ausente ou contraditória devolve `undefined` e a
 * migration interrompe o lote em vez de escolher um valor arbitrário.
 */

/** Fonte que produziu a evidência — reportada no erro/log da migration para tornar o backfill auditável. */
export type GeometryEvidenceSource = 'studio-geo' | 'legacy-catalog' | 'instance-geometry';

export type GeometryEvidence = {
  geometryKind: ResourceGeometryKind;
  source: GeometryEvidenceSource;
};

/**
 * Geometria dos identificadores do catálogo canônico de compatibilidade. Espelha deliberadamente
 * `fallbackGeometryKind`/`nodeForMapFeature` de `web/src/utils/mapLayers.ts` — os contratos entre
 * `src/` e `web/src/` são espelhados à mão neste repositório, então a tabela é duplicada de forma
 * explícita em vez de inferida por heurística de string nos dois lados.
 */
export const LEGACY_SOURCE_ID_GEOMETRY: Readonly<Record<string, ResourceGeometryKind>> = {
  'legacy-tower': 'POINT',
  'legacy-pole': 'POINT',
  'legacy-duct': 'POINT',
  'legacy-manhole': 'POINT',
  'legacy-cdoe': 'POINT',
  'legacy-cdoi': 'POINT',
  'legacy-ceo': 'POINT',
  'legacy-dio': 'POINT',
  'legacy-fiber-cable': 'LINE',
  'legacy-drop-cable': 'LINE',
};

/**
 * `type_code` do ResourceType → identificador legado. Inverte a classificação que o frontend faz
 * por feature; um mesmo identificador legado pode cobrir vários códigos (dutos), e códigos que o
 * catálogo legado resolvia por rótulo (CTO → CDOE/CDOI) concordam na geometria, logo não geram
 * ambiguidade aqui.
 */
const LEGACY_TYPE_CODE_SOURCE_ID: Readonly<Record<string, string>> = {
  Tower: 'legacy-tower',
  Pole: 'legacy-pole',
  Duct: 'legacy-duct',
  RisingTube: 'legacy-duct',
  CableTunnel: 'legacy-duct',
  Pedestal: 'legacy-duct',
  SupportBracket: 'legacy-duct',
  IronPipe: 'legacy-duct',
  Manhole: 'legacy-manhole',
  OpticalNode: 'legacy-cdoe',
  DIO: 'legacy-dio',
  SpliceClosure: 'legacy-ceo',
  CTO: 'legacy-cdoe',
  Fiber: 'legacy-fiber-cable',
  DistributionCable: 'legacy-fiber-cable',
  BackboneCable: 'legacy-fiber-cable',
  DropCable: 'legacy-drop-cable',
};

const isGeometryKind = (value: unknown): value is ResourceGeometryKind =>
  value === 'POINT' || value === 'LINE' || value === 'POLYGON';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * Índice `sourceId` → geometria extraído da publicação vigente do Studio GEO. Cobre os dois
 * formatos: v2 declara `visualConfig.geometryKind` por nó ENTITY; v1 só tem `layers[].shape`, cuja
 * distinção útil é `resource-points` × `resource-lines` — o `matcher` vira o identificador legado.
 *
 * Um `sourceId` que apareça com geometrias divergentes é removido do índice: divergência é ausência
 * de evidência, não empate a ser desfeito por ordem de leitura.
 */
export const studioGeoGeometryIndex = (snapshot: unknown): Map<string, ResourceGeometryKind> => {
  const index = new Map<string, ResourceGeometryKind>();
  const conflicting = new Set<string>();
  const record = asRecord(snapshot);
  if (!record) return index;

  const remember = (sourceId: unknown, geometryKind: ResourceGeometryKind): void => {
    if (typeof sourceId !== 'string' || !sourceId.trim()) return;
    const key = sourceId.trim();
    if (conflicting.has(key)) return;
    const known = index.get(key);
    if (known && known !== geometryKind) {
      index.delete(key);
      conflicting.add(key);
      return;
    }
    index.set(key, geometryKind);
  };

  // Snapshot v2 — a geometria é declarada na union discriminada de `visualConfig`.
  const nodes = Array.isArray(record.nodes) ? record.nodes : [];
  for (const entry of nodes) {
    const node = asRecord(entry);
    if (!node || node.kind !== 'ENTITY') continue;
    const entity = asRecord(node.entity);
    if (!entity || entity.sourceType !== 'RESOURCE_TYPE') continue;
    const geometryKind = asRecord(node.visualConfig)?.geometryKind;
    if (!isGeometryKind(geometryKind)) continue;
    remember(entity.sourceId, geometryKind);
  }

  // Snapshot v1 — sem `visualConfig`; a única informação geométrica é o `shape` da camada.
  const layers = Array.isArray(record.layers) ? record.layers : [];
  for (const entry of layers) {
    const layer = asRecord(entry);
    if (!layer) continue;
    const geometryKind =
      layer.shape === 'resource-points' ? 'POINT' : layer.shape === 'resource-lines' ? 'LINE' : undefined;
    if (!geometryKind) continue;
    if (typeof layer.matcher !== 'string') continue;
    remember(`legacy-${layer.matcher}`, geometryKind);
  }

  return index;
};

/**
 * Algumas bases carregadas por `migrate-resource-catalog.ts` gravaram em `ResourceType.code` o
 * `nodeCode` do catálogo (`category:<categoria>:type:<tipo>` ou com `:layer:<layer>:` no meio) em
 * vez do código nu do tipo. O catálogo legado sempre indexa pelo nome nu — normaliza extraindo o
 * segmento após o último `:type:` antes de procurar, sem alterar o dado persistido.
 */
const bareTypeCode = (typeCode: string): string => {
  const marker = ':type:';
  const index = typeCode.lastIndexOf(marker);
  return index === -1 ? typeCode : typeCode.slice(index + marker.length);
};

/** Geometria legada de um tipo, resolvida pelo seu `code`. Códigos desconhecidos não têm evidência. */
export const legacyGeometryForTypeCode = (typeCode: string | null | undefined): ResourceGeometryKind | undefined => {
  if (!typeCode) return undefined;
  const sourceId = LEGACY_TYPE_CODE_SOURCE_ID[bareTypeCode(typeCode.trim())];
  return sourceId ? LEGACY_SOURCE_ID_GEOMETRY[sourceId] : undefined;
};

/**
 * Inferência a partir das instâncias: só vale com consenso total. Uma única `GeographicLocation`
 * de tipo divergente — ou nenhuma instância — invalida a inferência.
 */
export const geometryFromLocationTypes = (
  geometryTypes: readonly (string | null | undefined)[],
): ResourceGeometryKind | undefined => {
  const kinds = new Set<ResourceGeometryKind>();
  for (const geometryType of geometryTypes) {
    switch (geometryType) {
      case 'Point':
        kinds.add('POINT');
        break;
      case 'LineString':
        kinds.add('LINE');
        break;
      case 'Polygon':
        kinds.add('POLYGON');
        break;
      default:
        // Tipo geométrico fora do domínio operacional (MultiPolygon, GeometryCollection, nulo):
        // a inferência perde o consenso e o tipo passa a exigir decisão humana.
        return undefined;
    }
  }
  return kinds.size === 1 ? [...kinds][0] : undefined;
};

export type ResourceTypeGeometryCandidate = {
  id: string;
  code: string;
  /** `geometry_type` de cada GeographicLocation não terminada ligada a instâncias do tipo. */
  locationGeometryTypes: readonly (string | null | undefined)[];
};

/**
 * Aplica a cascata de evidências a um tipo. O índice do Studio GEO é consultado por `id` e por
 * `code` porque `StudioGeoEntityReference.sourceId` carrega o `code` no catálogo publicado e o
 * `id` em drafts autorais mais recentes.
 */
export const resolveResourceTypeGeometry = (
  candidate: ResourceTypeGeometryCandidate,
  studioGeoIndex: ReadonlyMap<string, ResourceGeometryKind>,
): GeometryEvidence | undefined => {
  const published = studioGeoIndex.get(candidate.id) ?? studioGeoIndex.get(candidate.code);
  if (published) return { geometryKind: published, source: 'studio-geo' };

  const legacy = legacyGeometryForTypeCode(candidate.code);
  if (legacy) return { geometryKind: legacy, source: 'legacy-catalog' };

  const inferred = geometryFromLocationTypes(candidate.locationGeometryTypes);
  if (inferred) return { geometryKind: inferred, source: 'instance-geometry' };

  return undefined;
};
