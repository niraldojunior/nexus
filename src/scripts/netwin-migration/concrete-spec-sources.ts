import oracledb, { type Connection } from 'oracledb';
import {
  equipmentModelSourceId,
  groupEquipmentSpecs,
  groupRackSpecs,
  groupSplitterSpecs,
  type RackSpecCandidate,
  type RackSpecKind,
  normalizeSpecText,
  type ConcreteSpecGroup,
  type ConcreteSpecIndex,
  type EquipmentSpecCandidate,
  type SplitterSpecCandidate,
} from './concrete-spec-groups.js';
import { normalizeTypeKey, parseSplitterRatioStrict } from './concrete-specs.js';

/**
 * Fonte compartilhada das specifications concretas semânticas (Fase 1.D e Fases 2.B/2.C).
 *
 * A Fase 1 grava UMA specification por grupo semântico; as Fases 2 resolvem o id de origem de cada
 * instância (`ID_BD_TIPO_NE:ID_BD_TIPO_EQUIP`, `ID_BD_TIPO_CARTA`) para o mesmo id canônico. Para
 * isso as duas fases precisam montar exatamente o mesmo índice a partir das mesmas consultas — por
 * isso as consultas, o filtro de splitter e a resolução de fabricante vivem aqui, em um só lugar.
 */

const FETCH = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;

const text = (value: string | null | undefined): string | null => value?.trim() || null;

// ---------------------------------------------------------------------------------------------
// Fabricantes
// ---------------------------------------------------------------------------------------------

export interface ResolvedManufacturer {
  id: number;
  name: string;
}

/** Fabricantes por nome/sigla normalizados; chave ambígua (2+ fabricantes) não é adivinhada. */
export type ManufacturerResolver = (
  siglaFabricante: string | null | undefined,
) => ResolvedManufacturer | null;

export async function loadManufacturerResolver(source: Connection): Promise<ManufacturerResolver> {
  const rows = await source.execute<{ ID: number; NAME: string | null; ACRONYM: string | null }>(
    `SELECT ID, NAME, ACRONYM FROM NETWIN.MANUFACTURER`,
    [],
    FETCH,
  );
  const byKey = new Map<string, ResolvedManufacturer | null>();
  for (const m of rows.rows ?? []) {
    const name = text(m.NAME);
    if (!name) continue;
    for (const key of new Set([normalizeTypeKey(name), normalizeTypeKey(m.ACRONYM)])) {
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, { id: m.ID, name });
        continue;
      }
      const known = byKey.get(key);
      if (known && known.id !== m.ID) byKey.set(key, null);
    }
  }
  return (sigla) => {
    const key = normalizeTypeKey(sigla);
    return key ? (byKey.get(key) ?? null) : null;
  };
}

/** Fabricante da chave semântica: nome resolvido; sem correspondência única, a sigla bruta. */
const manufacturerLabel = (
  sigla: string | null | undefined,
  resolved: ResolvedManufacturer | null,
): string | null => resolved?.name ?? text(sigla);

// ---------------------------------------------------------------------------------------------
// ResourceType existente (vocabulário) — mesma regra na Fase 1 e na Fase 2
// ---------------------------------------------------------------------------------------------

/** Vocabulário existente indexado por nome/código normalizado; tipos `netwin-*` dinâmicos ficam fora. */
export function buildExistingTypeIndex(
  canonicalTypes: ReadonlyArray<{ code: string; name: string }>,
  targetTypeCodes: Iterable<string>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const rt of canonicalTypes) {
    index.set(normalizeTypeKey(rt.code), rt.code);
    index.set(normalizeTypeKey(rt.name), rt.code);
  }
  for (const code of targetTypeCodes) {
    if (!code.startsWith('netwin-')) index.set(normalizeTypeKey(code), code);
  }
  return index;
}

// ---------------------------------------------------------------------------------------------
// Equipamentos (ISP_CAT_MODELO_EQUIP)
// ---------------------------------------------------------------------------------------------

export type EquipmentCatalogRow = {
  ID_BD_TIPO_NE: number;
  ID_BD_TIPO_EQUIP: number;
  TIPO_NOME: string | null;
  TIPO_SIGLA: string | null;
  MODELO_NOME: string | null;
  MODELO_SIGLA: string | null;
  MODELO_ALIAS: string | null;
  SIGLA_FABRICANTE: string | null;
  SIGLA_TECNOLOGIA: string | null;
  COD_MATERIAL_SAP: string | null;
};

/** Modelos de equipamento EM USO (com instância em ISP_INS_EQUIPAMENTO). */
export async function loadEquipmentCatalogRows(source: Connection): Promise<EquipmentCatalogRow[]> {
  const result = await source.execute<EquipmentCatalogRow>(
    `SELECT k.ID_BD_TIPO_NE, k.ID_BD_TIPO_EQUIP,
            ne.NOME AS TIPO_NOME, ne.SIGLA AS TIPO_SIGLA,
            me.NOME_EQUIP AS MODELO_NOME, me.SIGLA_EQUIP AS MODELO_SIGLA,
            me.OUTRO_NOME_EQUIP AS MODELO_ALIAS, me.SIGLA_FABRICANTE,
            me.SIGLA_TECNOLOGIA, me.COD_MATERIAL_SAP
       FROM (
         SELECT DISTINCT e.ID_BD_TIPO_NE, e.ID_BD_TIPO_EQUIP
           FROM NETWIN.ISP_INS_EQUIPAMENTO e
          WHERE e.ID_BD_TIPO_NE IS NOT NULL
            AND e.ID_BD_TIPO_EQUIP IS NOT NULL
       ) k
       JOIN NETWIN.ISP_CAT_MODELO_EQUIP me ON me.ID_BD_TIPO_EQUIP = k.ID_BD_TIPO_EQUIP
       LEFT JOIN NETWIN.ISP_CAT_TIPO_EQUIPAMENTO ne ON ne.ID_BD_TIPO_EQUIPAMENTO = k.ID_BD_TIPO_NE
      ORDER BY k.ID_BD_TIPO_NE, k.ID_BD_TIPO_EQUIP`,
    [],
    FETCH,
  );
  return result.rows ?? [];
}

export interface EquipmentSpecRow extends EquipmentSpecCandidate {
  row: EquipmentCatalogRow;
  manufacturer: string | null;
  resolvedManufacturer: ResolvedManufacturer | null;
}

export type EquipmentSpecIndex = ConcreteSpecIndex<EquipmentSpecRow>;

/** Agrupa os modelos de equipamento (linhas sem nome de modelo ficam de fora, como antes). */
export function buildEquipmentSpecIndex(
  rows: readonly EquipmentCatalogRow[],
  typeCodeOf: (row: EquipmentCatalogRow) => string,
  resolveManufacturer: ManufacturerResolver,
): EquipmentSpecIndex {
  const candidates: EquipmentSpecRow[] = [];
  for (const row of rows) {
    const model = text(row.MODELO_NOME);
    if (!model) continue;
    const resolved = resolveManufacturer(row.SIGLA_FABRICANTE);
    candidates.push({
      row,
      sourceId: equipmentModelSourceId(row.ID_BD_TIPO_NE, row.ID_BD_TIPO_EQUIP),
      resourceTypeCode: typeCodeOf(row),
      model,
      modelCode: text(row.MODELO_SIGLA),
      manufacturer: manufacturerLabel(row.SIGLA_FABRICANTE, resolved),
      resolvedManufacturer: resolved,
      sapMaterialCode: text(row.COD_MATERIAL_SAP),
    });
  }
  return groupEquipmentSpecs(candidates);
}

/** Id canônico v2 do modelo de equipamento da origem, ou `null` se o modelo não está no índice. */
export const canonicalEquipmentSpecId = (
  index: EquipmentSpecIndex,
  tipoNe: number,
  tipoEquip: number,
): string | null =>
  index.canonicalIdBySourceId.get(equipmentModelSourceId(tipoNe, tipoEquip)) ?? null;

// ---------------------------------------------------------------------------------------------
// Splitters (ISP_CAT_CARTA)
// ---------------------------------------------------------------------------------------------

export type SplitterCatalogRow = {
  ID_BD_TIPO_CARTA: number;
  NOME_CARTA: string | null;
  SIGLA_CARTA: string | null;
  OUTRO_NOME_CARTA: string | null;
  SIGLA_FABRICANTE: string | null;
  COD_MATERIAL_SAP: string | null;
};

/** Tipos de carta EM USO (com instância em ISP_INS_CARTA). */
export async function loadSplitterCatalogRows(source: Connection): Promise<SplitterCatalogRow[]> {
  const result = await source.execute<SplitterCatalogRow>(
    `SELECT c.ID_BD_TIPO_CARTA, c.NOME_CARTA, c.SIGLA_CARTA, c.OUTRO_NOME_CARTA,
            c.SIGLA_FABRICANTE, c.COD_MATERIAL_SAP
       FROM NETWIN.ISP_CAT_CARTA c
      WHERE EXISTS (SELECT 1 FROM NETWIN.ISP_INS_CARTA i
                     WHERE i.ID_BD_TIPO_CARTA = c.ID_BD_TIPO_CARTA)
      ORDER BY c.ID_BD_TIPO_CARTA`,
    [],
    FETCH,
  );
  return result.rows ?? [];
}

/**
 * Só cartas declaradamente splitter: `1X2M`/`1/4` também casam a razão em placas de transmissão
 * (STM1/4/16, 21X2M...), que não são divisores ópticos.
 */
export const isSplitterCatalogRow = (
  row: Pick<SplitterCatalogRow, 'NOME_CARTA' | 'SIGLA_CARTA'>,
): boolean =>
  Boolean(text(row.NOME_CARTA)) &&
  /SPLIT/i.test(`${row.NOME_CARTA} ${row.SIGLA_CARTA ?? ''}`) &&
  parseSplitterRatioStrict(row.NOME_CARTA, row.SIGLA_CARTA, null) !== null;

export interface SplitterSpecRow extends SplitterSpecCandidate {
  row: SplitterCatalogRow;
  manufacturer: string | null;
  resolvedManufacturer: ResolvedManufacturer | null;
  ratio: number;
}

export type SplitterSpecIndex = ConcreteSpecIndex<SplitterSpecRow>;

/**
 * Fabricante, sigla e SAP vêm das colunas explícitas de `ISP_CAT_CARTA`; nada é extraído do nome
 * (que pode conter parênteses ou `//` por convenção de digitação).
 */
export function buildSplitterSpecIndex(
  rows: readonly SplitterCatalogRow[],
  resolveManufacturer: ManufacturerResolver,
): SplitterSpecIndex {
  const candidates: SplitterSpecRow[] = [];
  for (const row of rows) {
    if (!isSplitterCatalogRow(row)) continue;
    const resolved = resolveManufacturer(row.SIGLA_FABRICANTE);
    candidates.push({
      row,
      sourceId: row.ID_BD_TIPO_CARTA,
      model: text(row.NOME_CARTA),
      modelCode: text(row.SIGLA_CARTA),
      manufacturer: manufacturerLabel(row.SIGLA_FABRICANTE, resolved),
      resolvedManufacturer: resolved,
      sapMaterialCode: text(row.COD_MATERIAL_SAP),
      ratio: parseSplitterRatioStrict(row.NOME_CARTA, row.SIGLA_CARTA, null)!,
    });
  }
  return groupSplitterSpecs(candidates);
}

// ---------------------------------------------------------------------------------------------
// Bastidores e subbastidores (ISP_CAT_BASTIDOR / ISP_CAT_SUBBASTIDOR)
// ---------------------------------------------------------------------------------------------

export interface RackCatalogDefinition {
  kind: RackSpecKind;
  typeCode: 'Rack' | 'Shelf';
  label: string;
  catalogTable: string;
  instanceTable: string;
  idColumn: string;
  nameColumn: string;
  siglaColumn: string;
}

export const RACK_CATALOGS: readonly RackCatalogDefinition[] = [
  {
    kind: 'rack',
    typeCode: 'Rack',
    label: 'bastidor',
    catalogTable: 'ISP_CAT_BASTIDOR',
    instanceTable: 'ISP_INS_BASTIDOR',
    idColumn: 'ID_BD_TIPO_BASTIDOR',
    nameColumn: 'NOME_BASTIDOR',
    siglaColumn: 'SIGLA_BASTIDOR',
  },
  {
    kind: 'shelf',
    typeCode: 'Shelf',
    label: 'subbastidor',
    catalogTable: 'ISP_CAT_SUBBASTIDOR',
    instanceTable: 'ISP_INS_SUBBASTIDOR',
    idColumn: 'ID_BD_TIPO_SUBBASTIDOR',
    nameColumn: 'NOME_SUBBASTIDOR',
    siglaColumn: 'SIGLA_SUBBASTIDOR',
  },
];

export const rackCatalogOf = (kind: RackSpecKind): RackCatalogDefinition =>
  RACK_CATALOGS.find((catalog) => catalog.kind === kind)!;

export type RackCatalogRow = {
  TIPO_ID: number;
  NOME: string | null;
  SIGLA: string | null;
  SIGLA_FABRICANTE: string | null;
  COD_MATERIAL_SAP: string | null;
  ALTURA: number | null;
  LARGURA: number | null;
  PROFUNDIDADE: number | null;
  SIGLA_TECNOLOGIA: string | null;
};

/** Modelos de bastidor/subbastidor EM USO (com instância na tabela de instâncias). */
export async function loadRackCatalogRows(
  source: Connection,
  catalog: RackCatalogDefinition,
): Promise<RackCatalogRow[]> {
  const result = await source.execute<RackCatalogRow>(
    `SELECT c.${catalog.idColumn} AS TIPO_ID, c.${catalog.nameColumn} AS NOME,
            c.${catalog.siglaColumn} AS SIGLA, c.SIGLA_FABRICANTE, c.COD_MATERIAL_SAP,
            c.ALTURA, c.LARGURA, c.PROFUNDIDADE, c.SIGLA_TECNOLOGIA
       FROM NETWIN.${catalog.catalogTable} c
      WHERE EXISTS (SELECT 1 FROM NETWIN.${catalog.instanceTable} i
                     WHERE i.${catalog.idColumn} = c.${catalog.idColumn})
      ORDER BY c.${catalog.idColumn}`,
    [],
    FETCH,
  );
  return result.rows ?? [];
}

export interface RackSpecRow extends RackSpecCandidate {
  row: RackCatalogRow;
  manufacturer: string | null;
  resolvedManufacturer: ResolvedManufacturer | null;
}

export type RackSpecIndex = ConcreteSpecIndex<RackSpecRow>;

export function buildRackSpecIndex(
  catalog: RackCatalogDefinition,
  rows: readonly RackCatalogRow[],
  resolveManufacturer: ManufacturerResolver,
): RackSpecIndex {
  const candidates: RackSpecRow[] = rows.map((row) => {
    const resolved = resolveManufacturer(row.SIGLA_FABRICANTE);
    return {
      row,
      kind: catalog.kind,
      sourceId: row.TIPO_ID,
      model: text(row.NOME) ?? text(row.SIGLA),
      modelCode: text(row.SIGLA),
      manufacturer: manufacturerLabel(row.SIGLA_FABRICANTE, resolved),
      resolvedManufacturer: resolved,
      sapMaterialCode: text(row.COD_MATERIAL_SAP),
      height: row.ALTURA,
      width: row.LARGURA,
      depth: row.PROFUNDIDADE,
    };
  });
  return groupRackSpecs(candidates, catalog.catalogTable, catalog.kind);
}

const dimensionsLabel = (row: RackCatalogRow): string | null =>
  row.ALTURA || row.LARGURA || row.PROFUNDIDADE
    ? `${row.ALTURA ?? '-'}×${row.LARGURA ?? '-'}×${row.PROFUNDIDADE ?? '-'} mm`
    : null;

export const rackGroupNames = (
  catalog: RackCatalogDefinition,
  index: RackSpecIndex,
): Map<string, string> =>
  distinctGroupNames(
    index.groups,
    (g) => g.representative.model ?? `${catalog.typeCode} ${g.representativeSourceId}`,
    [
      (g) => text(g.representative.row.SIGLA),
      (g) => g.representative.manufacturer ?? null,
      (g) => sapLabel(g.representative.sapMaterialCode),
      (g) => dimensionsLabel(g.representative.row),
    ],
    (g) => dimensionsLabel(g.representative.row) ?? 'variante de catálogo',
  );

// ---------------------------------------------------------------------------------------------
// Nomes e origem
// ---------------------------------------------------------------------------------------------

/**
 * Nomes de specification sem sufixo de chave de catálogo. Homônimos recebem os atributos que de
 * fato os distinguem (sigla, fabricante, SAP...), em parênteses; o que for igual em todo o conjunto
 * de homônimos não é repetido. `lastResort` só entra se ainda restar colisão e descreve o
 * discriminador funcional — nunca uma chave técnica da origem.
 */
export function distinctGroupNames<T>(
  groups: readonly ConcreteSpecGroup<T>[],
  baseName: (group: ConcreteSpecGroup<T>) => string,
  qualifiers: ReadonlyArray<(group: ConcreteSpecGroup<T>) => string | null>,
  lastResort: (group: ConcreteSpecGroup<T>) => string,
): Map<string, string> {
  const names = new Map<string, string>();
  const bySharedBase = new Map<string, Array<ConcreteSpecGroup<T>>>();
  for (const group of groups) {
    const base = baseName(group);
    names.set(group.canonicalId, base);
    const key = normalizeSpecText(base);
    bySharedBase.set(key, [...(bySharedBase.get(key) ?? []), group]);
  }
  for (const set of bySharedBase.values()) {
    if (set.length < 2) continue;
    const varying = qualifiers.filter((qualifier) => {
      const values = set.map((group) => normalizeSpecText(qualifier(group))).filter(Boolean);
      return new Set(values).size > 1;
    });
    for (const group of set) {
      const parts = varying
        .map((qualifier) => qualifier(group))
        .filter((part): part is string => !!part);
      if (parts.length > 0) {
        names.set(group.canonicalId, `${baseName(group)} (${parts.join(' · ')})`);
      }
    }
  }
  const byFinalName = new Map<string, Array<ConcreteSpecGroup<T>>>();
  for (const group of groups) {
    const key = normalizeSpecText(names.get(group.canonicalId));
    byFinalName.set(key, [...(byFinalName.get(key) ?? []), group]);
  }
  for (const set of byFinalName.values()) {
    if (set.length < 2) continue;
    for (const group of set) {
      names.set(group.canonicalId, `${names.get(group.canonicalId)} (${lastResort(group)})`);
    }
  }
  return names;
}

const sapLabel = (value: string | null | undefined): string | null =>
  text(value) ? `SAP ${text(value)}` : null;

export const equipmentGroupName = (group: ConcreteSpecGroup<EquipmentSpecRow>): string =>
  `${text(group.representative.row.TIPO_SIGLA) ?? text(group.representative.row.TIPO_NOME) ?? 'Equipamento'} ${group.representative.model}`;

export const equipmentGroupNames = (index: EquipmentSpecIndex): Map<string, string> =>
  distinctGroupNames(
    index.groups,
    equipmentGroupName,
    [
      (g) => g.representative.modelCode ?? null,
      (g) => g.representative.manufacturer ?? null,
      (g) => sapLabel(g.representative.sapMaterialCode),
    ],
    (g) =>
      [
        g.representative.modelCode,
        g.representative.manufacturer,
        sapLabel(g.representative.sapMaterialCode),
      ]
        .filter((value): value is string => !!value)
        .join(' · ') || 'variante de catálogo',
  );

export const splitterGroupNames = (index: SplitterSpecIndex): Map<string, string> =>
  distinctGroupNames(
    index.groups,
    (g) => g.representative.model ?? 'Splitter',
    [
      (g) => `1:${g.representative.ratio}`,
      (g) => g.representative.modelCode ?? null,
      (g) => g.representative.manufacturer ?? null,
      (g) => sapLabel(g.representative.sapMaterialCode),
    ],
    (g) => `ratio 1:${g.representative.ratio}`,
  );

/** `extra` do grupo `_origin`: todos os ids de catálogo da origem que colapsaram nesta spec. */
export const specOriginExtra = (group: {
  originAliases: readonly string[];
}): Record<string, unknown> => ({ aliases: [...group.originAliases] });
