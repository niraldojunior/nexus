/**
 * Mapeadores do domínio Óleo e Gás (ANP GISHUB + dutos IBGE).
 *
 * Funções puras, sem rede nem banco. Ponto ANP → Location → Site → Resource (igual à estação
 * ferroviária); campo e bloco são polígonos → Location → Resource; oleoduto reaproveita a camada de
 * dutos do IBGE já consumida pelo domínio Gás (`classifyDuct === 'oil'`).
 */

import {
  ANP_GEO_ORIGIN_SYSTEM,
  GAS_PIPELINE_ATTRIBUTES,
  IBGE_BC250_ORIGIN_SYSTEM,
  classifyDuct,
  demoId,
  knownText,
  mapIbgeLines,
  originCharacteristics,
  originId,
  resolveUf,
  substationInScope,
  toGeoJsonPoint,
  toGeoJsonPolygons,
  ufCharacteristic,
  ufsContaining,
  type Characteristic,
  type MappedLine,
  type MappedPointSite,
  type MappedPolygon,
  type SigelFeature,
} from './mapper.js';

export const OIL_LIQUID_TERMINAL_SITE_SPEC_CODE = 'OIL_LIQUID_TERMINAL';
export const OIL_LNG_TERMINAL_SITE_SPEC_CODE = 'OIL_LNG_TERMINAL';
export const OIL_REFINERY_SITE_SPEC_CODE = 'OIL_REFINERY';
export const OIL_GAS_PROCESSING_SITE_SPEC_CODE = 'OIL_GAS_PROCESSING';
export const OIL_WELL_SITE_SPEC_CODE = 'OIL_WELL';

export const OIL_LIQUID_TERMINAL_RESOURCE_TYPE_CODE = 'OilLiquidTerminal';
export const OIL_LNG_TERMINAL_RESOURCE_TYPE_CODE = 'OilLngTerminal';
export const OIL_REFINERY_RESOURCE_TYPE_CODE = 'OilRefinery';
export const OIL_GAS_PROCESSING_RESOURCE_TYPE_CODE = 'OilGasProcessingUnit';
export const OIL_WELL_RESOURCE_TYPE_CODE = 'OilWell';
export const OIL_PIPELINE_RESOURCE_TYPE_CODE = 'OilPipeline';
export const OIL_FIELD_RESOURCE_TYPE_CODE = 'OilField';
export const OIL_BLOCK_RESOURCE_TYPE_CODE = 'OilBlock';

const OIL_LIQUID_TERMINAL_ENTITY = 'OIL_LIQUID_TERMINAL';
const OIL_LNG_TERMINAL_ENTITY = 'OIL_LNG_TERMINAL';
const OIL_REFINERY_ENTITY = 'OIL_REFINERY';
const OIL_GAS_PROCESSING_ENTITY = 'OIL_GAS_PROCESSING';
const OIL_WELL_ENTITY = 'OIL_WELL';
const OIL_PIPELINE_ENTITY = 'OIL_PIPELINE';
const OIL_FIELD_ENTITY = 'OIL_FIELD';
const OIL_BLOCK_ENTITY = 'OIL_BLOCK';

/** `[propriedade ANP, characteristic]`. Número mantém o tipo; texto passa por `knownText`. */
type Attribute = readonly [string, string];

const attributesOf = (
  properties: Record<string, unknown>,
  attributes: readonly Attribute[],
): Characteristic[] =>
  attributes.flatMap(([key, name]) => {
    const value = properties[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return [{ name, value, valueType: 'number' } as Characteristic];
    }
    const text = knownText(value);
    return text === undefined ? [] : [{ name, value: text, valueType: 'string' } as Characteristic];
  });

const keyOf = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : knownText(value);

export type AnpPointSpec = {
  entity: string;
  /** Propriedade estável e única na camada (nunca o `id` do GeoServer, que muda a cada consulta). */
  keyField: string;
  nameField: string;
  /** Propriedade com a UF declarada; ausente → UF pela caixa envolvente. */
  ufField?: string;
  fallbackName: string;
  attributes: readonly Attribute[];
};

export const ANP_LIQUID_TERMINAL_SPEC: AnpPointSpec = {
  entity: OIL_LIQUID_TERMINAL_ENTITY,
  keyField: 'SIMP',
  nameField: 'NOME',
  ufField: 'UF',
  fallbackName: 'Terminal',
  attributes: [
    ['RAZAO_SOCI', 'operador'],
    ['SITUACAO_A', 'situacao'],
    ['AUTORIZACA', 'autorizacao'],
    ['MUNICIPIO', 'municipio'],
  ],
};

export const ANP_LNG_TERMINAL_SPEC: AnpPointSpec = {
  entity: OIL_LNG_TERMINAL_ENTITY,
  keyField: 'NOME',
  nameField: 'NOME',
  ufField: 'UF',
  fallbackName: 'Terminal de GNL',
  attributes: [
    ['RAZAO_SOCI', 'operador'],
    ['SITUACAO_A', 'situacao'],
    ['AUTORIZACA', 'autorizacao'],
    ['MUNICIPIO', 'municipio'],
    ['CAPACIDADE', 'capacidade'],
  ],
};

export const ANP_REFINERY_SPEC: AnpPointSpec = {
  entity: OIL_REFINERY_ENTITY,
  keyField: 'SIGLA',
  nameField: 'NOME',
  ufField: 'UF',
  fallbackName: 'Refinaria',
  attributes: [
    ['EMPRESA', 'operador'],
    ['AUT_OP', 'autorizacao'],
    ['MUNICIPIO', 'municipio'],
    ['CAPAC_BPD', 'capacidadeBpd'],
    ['CAPAC_M3', 'capacidadeM3'],
  ],
};

export const ANP_GAS_PROCESSING_SPEC: AnpPointSpec = {
  entity: OIL_GAS_PROCESSING_ENTITY,
  keyField: 'NOME',
  nameField: 'NOME',
  ufField: 'ESTADO',
  fallbackName: 'UPGN',
  attributes: [
    ['TIPO', 'tipoInstalacao'],
    ['TITULARIDA', 'autorizacao'],
    ['MUNICIPIO', 'municipio'],
  ],
};

export const ANP_WELL_SPEC: AnpPointSpec = {
  entity: OIL_WELL_ENTITY,
  keyField: 'CADASTRO',
  nameField: 'POCO',
  ufField: 'ESTADO',
  fallbackName: 'Poço',
  attributes: [
    ['OPERADOR', 'operador'],
    ['BACIA', 'bacia'],
    ['CAMPO', 'campo'],
    ['BLOCO', 'bloco'],
    ['TERRA_MAR', 'ambiente'],
    ['TIPO', 'tipoPoco'],
    ['CATEGORIA', 'categoria'],
    ['SITUACAO', 'situacao'],
    ['PROF_SOND', 'profundidadeSondadorM'],
  ],
};

/** Ponto ANP → Location → Site → Resource. `undefined` = fora do escopo ou sem chave/geometria. */
export function mapAnpPointSite(
  feature: SigelFeature,
  states: readonly string[],
  spec: AnpPointSpec,
): MappedPointSite | undefined {
  const sourceId = keyOf(feature.properties[spec.keyField]);
  if (!sourceId) return undefined;

  const point = toGeoJsonPoint((feature.geometry as { coordinates?: unknown })?.coordinates);
  if (!point) return undefined;

  const [lon, lat] = point.coordinates;
  if (!substationInScope(states, lon, lat)) return undefined;

  const system = ANP_GEO_ORIGIN_SYSTEM;
  const name = knownText(feature.properties[spec.nameField]) ?? `${spec.fallbackName} ${sourceId}`;
  const declaredUf = spec.ufField ? knownText(feature.properties[spec.ufField]) : undefined;
  const uf = declaredUf ?? (ufsContaining(states, lon, lat).join('/') || undefined);

  return {
    sourceId,
    locationId: demoId(spec.entity, sourceId, undefined, system),
    siteId: demoId(`${spec.entity}:SITE`, sourceId, undefined, system),
    resourceId: demoId(`${spec.entity}:RESOURCE`, sourceId, undefined, system),
    name,
    point,
    uf,
    originSystem: system,
    characteristics: [
      ...attributesOf(feature.properties, spec.attributes),
      ...ufCharacteristic(uf),
      ...originCharacteristics(spec.entity, sourceId, undefined, system),
    ],
  };
}

export type AnpPolygonSpec = {
  entity: string;
  keyField: string;
  nameField: string;
  fallbackName: string;
  attributes: readonly Attribute[];
};

export const ANP_FIELD_SPEC: AnpPolygonSpec = {
  entity: OIL_FIELD_ENTITY,
  keyField: 'COD_CAMPO',
  nameField: 'NOM_CAMPO',
  fallbackName: 'Campo',
  attributes: [
    ['OPERADOR_C', 'operador'],
    ['NOM_BACIA', 'bacia'],
    ['ETAPA', 'etapa'],
    ['FLUIDO_PRI', 'fluidoPrincipal'],
    ['AMBIENTE', 'ambiente'],
    ['NUM_RODADA', 'rodada'],
    ['AREA', 'areaKm2'],
  ],
};

export const ANP_BLOCK_SPEC: AnpPolygonSpec = {
  entity: OIL_BLOCK_ENTITY,
  keyField: 'COD_BLOCO',
  nameField: 'NOM_BLOCO',
  fallbackName: 'Bloco',
  attributes: [
    ['OPERADOR_C', 'operador'],
    ['NOM_BACIA', 'bacia'],
    ['RODADA', 'rodada'],
    ['AMBIENTE', 'ambiente'],
    ['COD_FASE_C', 'fase'],
    ['NOM_FANTAS', 'nomeFantasia'],
    ['AREA_TOTAL', 'areaKm2'],
  ],
};

/**
 * Polígono ANP (campo/bloco). Uma `MultiPolygon` vira N registros (`:part`), porque a Location só
 * aceita `Polygon`. Entra no escopo se o anel externo de alguma parte tocar uma das UFs.
 */
export function mapAnpPolygons(
  feature: SigelFeature,
  states: readonly string[],
  spec: AnpPolygonSpec,
): MappedPolygon[] {
  const sourceId = keyOf(feature.properties[spec.keyField]);
  if (!sourceId) return [];

  const polygons = toGeoJsonPolygons(feature.geometry);
  if (polygons.length === 0) return [];

  const inScope = polygons.some((polygon) =>
    (polygon.coordinates[0] ?? []).some(([lon, lat]) => ufsContaining(states, lon, lat).length > 0),
  );
  if (!inScope) return [];

  const system = ANP_GEO_ORIGIN_SYSTEM;
  const name = knownText(feature.properties[spec.nameField]) ?? `${spec.fallbackName} ${sourceId}`;
  const attributes = attributesOf(feature.properties, spec.attributes);
  const multipart = polygons.length > 1;

  return polygons.map((polygon, index) => {
    const part = multipart ? index + 1 : undefined;
    const uf = resolveUf(undefined, states, polygon.coordinates[0] ?? []);
    return {
      sourceId,
      originId: originId(sourceId, part),
      locationId: demoId(spec.entity, sourceId, part, system),
      resourceId: demoId(`${spec.entity}:RESOURCE`, sourceId, part, system),
      name: multipart ? `${name} (parte ${index + 1})` : name,
      polygon,
      uf,
      originSystem: system,
      characteristics: [
        ...attributes,
        ...ufCharacteristic(uf),
        ...originCharacteristics(spec.entity, originId(sourceId, part), undefined, system),
      ],
    };
  });
}

/** Trecho de duto IBGE classificado como óleo/poliduto → recurso linear. */
export const mapOilPipeline = (feature: SigelFeature, states: readonly string[]): MappedLine[] =>
  classifyDuct(feature.properties) !== 'oil'
    ? []
    : mapIbgeLines(feature, states, {
        entity: OIL_PIPELINE_ENTITY,
        system: IBGE_BC250_ORIGIN_SYSTEM,
        attributes: GAS_PIPELINE_ATTRIBUTES,
        fallbackName: 'Oleoduto',
      });
