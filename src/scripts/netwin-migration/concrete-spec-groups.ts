import { normalizeTypeKey } from './concrete-specs.js';
import { deterministicUuid, NEXUS_NETWIN_NAMESPACE } from './identity.js';

/**
 * Agrupamento semântico (v2) das specifications concretas do Netwin.
 *
 * Linhas de catálogo da origem que descrevem o mesmo modelo colapsam em UMA
 * ResourceSpecification. A chave é semântica (tipo resolvido + modelo + fabricante...), nunca a
 * chave técnica do catálogo; as chaves de origem viram aliases. Módulo puro: sem I/O.
 */

export type ConcreteSpecKind = 'equipment' | 'splitter' | 'rack' | 'shelf';

export type ConcreteSpecSourceId = string | number;

/** Id de origem composto de um modelo de equipamento (`ISP_CAT_MODELO_EQUIP`). */
export const equipmentModelSourceId = (tipoNe: number, tipoEquip: number): string =>
  `${tipoNe}:${tipoEquip}`;

/** Id canônico v2 de uma spec concreta; depende só da chave semântica normalizada. */
export const canonicalSpecIdV2 = (kind: ConcreteSpecKind, semanticKey: string): string =>
  deterministicUuid(
    NEXUS_NETWIN_NAMESPACE,
    `RESOURCE_SPEC:V2:${kind.toUpperCase()}:${semanticKey}`,
  );

/** Compara ids de origem de forma estável: segmentos (`:`) numéricos por valor, demais por texto. */
export function compareSourceIds(a: ConcreteSpecSourceId, b: ConcreteSpecSourceId): number {
  const left = String(a).split(':');
  const right = String(b).split(':');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i]!;
    const y = right[i]!;
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
      const diff = BigInt(x) - BigInt(y);
      if (diff !== 0n) return diff < 0n ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return left.length - right.length;
}

export interface ConcreteSpecGroup<T> {
  kind: ConcreteSpecKind;
  /** UUID v2 determinístico derivado de `semanticKey`. */
  canonicalId: string;
  semanticKey: string;
  /** Linha representativa: a de menor id de origem (estável, independe da ordem da entrada). */
  representative: T;
  representativeSourceId: string;
  /** Todas as linhas do grupo, ordenadas por id de origem. */
  members: T[];
  /** Ids de origem de todas as linhas, ordenados (representante primeiro). */
  sourceIds: string[];
  /** Ids de origem que NÃO são o representante. */
  aliasSourceIds: string[];
  /** Aliases `ENTIDADE:id` de todas as linhas, na ordem de `sourceIds`. */
  originAliases: string[];
}

export interface ConcreteSpecIndex<T> {
  kind: ConcreteSpecKind;
  /** Grupos ordenados pelo id de origem do representante. */
  groups: ConcreteSpecGroup<T>[];
  byCanonicalId: Map<string, ConcreteSpecGroup<T>>;
  /** id de origem (string) -> id canônico v2. */
  canonicalIdBySourceId: Map<string, string>;
  /** id de origem (string) -> id de origem do representante do seu grupo. */
  representativeBySourceId: Map<string, string>;
}

export interface ConcreteSpecGroupingOptions<T> {
  kind: ConcreteSpecKind;
  /** Entidade de origem usada nos aliases (ex.: `ISP_CAT_MODELO_EQUIP`). */
  originEntity: string;
  sourceIdOf: (item: T) => ConcreteSpecSourceId;
  /** Chave semântica já normalizada. */
  semanticKeyOf: (item: T) => string;
}

/** Normalização de texto de catálogo (modelo, sigla, fabricante): sem acento, caixa ou pontuação. */
export const normalizeSpecText = (value: string | null | undefined): string =>
  normalizeTypeKey(value);

const normalizeTypeCode = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();

export function groupConcreteSpecs<T>(
  items: readonly T[],
  options: ConcreteSpecGroupingOptions<T>,
): ConcreteSpecIndex<T> {
  const buckets = new Map<string, Map<string, T>>();
  for (const item of items) {
    const sourceId = String(options.sourceIdOf(item));
    const key = options.semanticKeyOf(item);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = new Map()));
    // Repetições do mesmo id de origem não criam membros extras.
    if (!bucket.has(sourceId)) bucket.set(sourceId, item);
  }

  const groups: ConcreteSpecGroup<T>[] = [];
  for (const [semanticKey, bucket] of buckets) {
    const sorted = [...bucket.entries()].sort(([a], [b]) => compareSourceIds(a, b));
    const sourceIds = sorted.map(([id]) => id);
    groups.push({
      kind: options.kind,
      canonicalId: canonicalSpecIdV2(options.kind, semanticKey),
      semanticKey,
      representative: sorted[0]![1],
      representativeSourceId: sourceIds[0]!,
      members: sorted.map(([, item]) => item),
      sourceIds,
      aliasSourceIds: sourceIds.slice(1),
      originAliases: sourceIds.map((id) => `${options.originEntity}:${id}`),
    });
  }
  groups.sort((a, b) => compareSourceIds(a.representativeSourceId, b.representativeSourceId));

  const byCanonicalId = new Map<string, ConcreteSpecGroup<T>>();
  const canonicalIdBySourceId = new Map<string, string>();
  const representativeBySourceId = new Map<string, string>();
  for (const group of groups) {
    byCanonicalId.set(group.canonicalId, group);
    for (const id of group.sourceIds) {
      canonicalIdBySourceId.set(id, group.canonicalId);
      representativeBySourceId.set(id, group.representativeSourceId);
    }
  }
  return {
    kind: options.kind,
    groups,
    byCanonicalId,
    canonicalIdBySourceId,
    representativeBySourceId,
  };
}

/** Linha de catálogo de modelo de equipamento, no formato mínimo que o agrupamento exige. */
export interface EquipmentSpecCandidate {
  /** Ver `equipmentModelSourceId`. */
  sourceId: ConcreteSpecSourceId;
  /** ResourceType já resolvido (`resolveEquipmentTypeCode`). */
  resourceTypeCode: string;
  model: string | null | undefined;
  /** Sigla/código do modelo (`MODELO_SIGLA`); variantes com sigla distinta não colapsam. */
  modelCode?: string | null;
  manufacturer?: string | null;
  /** Código de material SAP (`COD_MATERIAL_SAP`); SAP distinto permanece distinto. */
  sapMaterialCode?: string | null;
}

/**
 * Equipamentos: tipo resolvido + modelo + sigla + fabricante + SAP, todos normalizados. Fabricante,
 * sigla ou SAP distintos permanecem distintos (mesmo NOME pode ser variante legítima). Linha sem
 * modelo não colapsa com nenhuma outra (a chave inclui a origem).
 */
export const equipmentSpecKey = (item: EquipmentSpecCandidate): string => {
  const model = normalizeSpecText(item.model);
  const base = [
    normalizeTypeCode(item.resourceTypeCode),
    model,
    normalizeSpecText(item.modelCode),
    normalizeSpecText(item.manufacturer),
    normalizeSpecText(item.sapMaterialCode),
  ];
  return (model ? base : [...base, `source=${String(item.sourceId)}`]).join('|');
};

export const groupEquipmentSpecs = <T extends EquipmentSpecCandidate>(
  items: readonly T[],
  originEntity = 'ISP_CAT_MODELO_EQUIP',
): ConcreteSpecIndex<T> =>
  groupConcreteSpecs(items, {
    kind: 'equipment',
    originEntity,
    sourceIdOf: (item) => item.sourceId,
    semanticKeyOf: equipmentSpecKey,
  });

/** Linha de catálogo de carta/splitter, no formato mínimo que o agrupamento exige. */
export interface SplitterSpecCandidate {
  sourceId: ConcreteSpecSourceId;
  /** Nome/modelo (`NOME_CARTA`). */
  model: string | null | undefined;
  /** Código/sigla do modelo (`SIGLA_CARTA`). */
  modelCode?: string | null;
  manufacturer?: string | null;
  /** Código de material SAP (`COD_MATERIAL_SAP`). */
  sapMaterialCode?: string | null;
  /** Razão 1:N (`parseSplitterRatioStrict`). */
  ratio: number | null;
}

/** Splitters: nome/modelo + sigla + fabricante + SAP normalizados + razão. */
export const splitterSpecKey = (item: SplitterSpecCandidate): string => {
  const model = normalizeSpecText(item.model);
  const base = [
    model,
    normalizeSpecText(item.modelCode),
    normalizeSpecText(item.manufacturer),
    normalizeSpecText(item.sapMaterialCode),
    item.ratio === null ? 'ratio=none' : `1x${item.ratio}`,
  ];
  return (model ? base : [...base, `source=${String(item.sourceId)}`]).join('|');
};

export const groupSplitterSpecs = <T extends SplitterSpecCandidate>(
  items: readonly T[],
  originEntity = 'ISP_CAT_CARTA',
): ConcreteSpecIndex<T> =>
  groupConcreteSpecs(items, {
    kind: 'splitter',
    originEntity,
    sourceIdOf: (item) => item.sourceId,
    semanticKeyOf: splitterSpecKey,
  });

export type RackSpecKind = 'rack' | 'shelf';

/** Linha de catálogo de bastidor/subbastidor, no formato mínimo que o agrupamento exige. */
export interface RackSpecCandidate {
  sourceId: ConcreteSpecSourceId;
  kind: RackSpecKind;
  /** `NOME_BASTIDOR` / `NOME_SUBBASTIDOR`. */
  model: string | null | undefined;
  /** `SIGLA_BASTIDOR` / `SIGLA_SUBBASTIDOR`. */
  modelCode?: string | null;
  manufacturer?: string | null;
  sapMaterialCode?: string | null;
  /** Dimensões físicas (mm); dimensão distinta é produto distinto. */
  height?: number | null;
  width?: number | null;
  depth?: number | null;
}

const dim = (value: number | null | undefined): string =>
  value === null || value === undefined ? '-' : String(value);

/**
 * Bastidor/subbastidor: tipo + nome + sigla + fabricante + SAP + altura/largura/profundidade.
 * Tecnologia, status de suspensão e vínculo a modelo de equipamento são metadados, não identidade.
 */
export const rackSpecKey = (item: RackSpecCandidate): string => {
  const model = normalizeSpecText(item.model);
  const base = [
    item.kind,
    model,
    normalizeSpecText(item.modelCode),
    normalizeSpecText(item.manufacturer),
    normalizeSpecText(item.sapMaterialCode),
    `${dim(item.height)}x${dim(item.width)}x${dim(item.depth)}`,
  ];
  return (model ? base : [...base, `source=${String(item.sourceId)}`]).join('|');
};

export const groupRackSpecs = <T extends RackSpecCandidate>(
  items: readonly T[],
  originEntity: string,
  kind: RackSpecKind,
): ConcreteSpecIndex<T> =>
  groupConcreteSpecs(items, {
    kind: kind === 'rack' ? 'rack' : 'shelf',
    originEntity,
    sourceIdOf: (item) => item.sourceId,
    semanticKeyOf: rackSpecKey,
  });
