import { deterministicUuid, NEXUS_NETWIN_NAMESPACE } from './identity.js';

/**
 * Identidade e resolução das ResourceSpecifications concretas do Netwin.
 *
 * O ResourceType segue canônico (`category:CDOE`, `Splitter`, `Port`...). A specification
 * concreta nasce de um catálogo comprovado da origem e usa a chave desse catálogo no UUID
 * determinístico; as specs genéricas (`Netwin CDOE`, `Netwin Port`...) continuam como fallback
 * quando o catálogo não pode ser resolvido.
 */

/** Tipos de equipamento ISP que representam CDO — chaves de `ISP_CAT_TIPO_EQUIPAMENTO`. */
export const CDO_TYPE_TO_SPEC = new Map<number, { typeCode: string; specName: string }>([
  [270, { typeCode: 'category:CDOI', specName: 'Netwin CDOI' }],
  [271, { typeCode: 'category:CDOE', specName: 'Netwin CDOE' }],
  [272, { typeCode: 'category:CDOI', specName: 'Netwin CDOI' }],
]);

/**
 * ResourceType de um tipo de equipamento Netwin. CDO/CDOI mantêm o tipo canônico; os demais
 * (modem, bateria, antena...) recebem um código derivado da chave do catálogo, sem inferir
 * semântica de domínio (OLT/DIO etc. dependem de decisão do usuário).
 */

export const PORT_CATALOG_TYPES = ['ADAPTER', 'FO.I', 'FO.O'] as const;

export const SPLITTER_RATIOS = [2, 4, 8, 16, 32, 64] as const;

export const genericSpecId = (name: string): string =>
  deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:${name}`);

export const equipmentModelSpecId = (tipoNe: number, tipoEquip: number): string =>
  deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:EQUIPMENT_MODEL:${tipoNe}:${tipoEquip}`);

/** Spec "de tipo": cobre o tipo interno Netwin que não tem modelo (`ID_BD_TIPO_EQUIP`) cadastrado. */
export const equipmentTypeSpecId = (tipoNe: number): string =>
  deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:EQUIPMENT_TYPE:${tipoNe}`);

/** Tipos de célula de rádio (`Célula 2G`, `Célula 3G`...) — recebem os atributos de rádio. */
export const isRadioCellTypeName = (name: string | null | undefined): boolean =>
  /^celula(\d+g|lte|nr)$/.test(normalizeTypeKey(name));

export const cardTypeSpecId = (tipoCarta: number): string =>
  deterministicUuid(NEXUS_NETWIN_NAMESPACE, `RESOURCE_SPEC:CARD_TYPE:${tipoCarta}`);

/**
 * O catálogo de porta física tem dezenas de milhares de linhas que só diferem por chave; o que
 * distingue o modelo é tipo + direcionalidade. A spec é identificada por essa combinação.
 */
export const portTypeSpecId = (tipo: string, direcionalidade: string | null | undefined): string =>
  deterministicUuid(
    NEXUS_NETWIN_NAMESPACE,
    `RESOURCE_SPEC:PORT_TYPE:${tipo.trim().toUpperCase()}:${(direcionalidade ?? '').trim().toUpperCase()}`,
  );

/** Razão 1:N reconhecida no catálogo, ou `null` quando o catálogo não a declara. */
export function parseSplitterRatioStrict(
  tipoNome: string | null | undefined,
  tipoSigla: string | null | undefined,
  cardNome: string | null | undefined,
): number | null {
  const combined = `${tipoNome ?? ''} ${tipoSigla ?? ''} ${cardNome ?? ''}`.toUpperCase();
  const match = combined.match(/1\s*[:xX/]\s*(\d+)/);
  if (match?.[1]) {
    const ratio = parseInt(match[1], 10);
    if ((SPLITTER_RATIOS as readonly number[]).includes(ratio)) return ratio;
  }
  return null;
}

/** Nomes de specification únicos: o 2º homônimo recebe o sufixo de chave do catálogo. */
export function uniqueSpecNames<T>(
  items: T[],
  baseName: (item: T) => string,
  keyOf: (item: T) => number,
): Map<number, string> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = baseName(item);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const result = new Map<number, string>();
  for (const item of items) {
    const name = baseName(item);
    result.set(keyOf(item), (counts.get(name) ?? 0) > 1 ? `${name} #${keyOf(item)}` : name);
  }
  return result;
}

export type SpecCoverageKind = 'concrete' | 'genericFallback' | 'unmapped';

/** Contadores de cobertura por etapa; evitam que o fallback genérico passe despercebido. */
export class SpecCoverage {
  private readonly counts = new Map<SpecCoverageKind, number>();
  private readonly samples = new Map<string, number>();

  record(kind: SpecCoverageKind, sample?: string | number | null): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1);
    if (kind === 'unmapped' && sample !== undefined && sample !== null) {
      const key = String(sample);
      this.samples.set(key, (this.samples.get(key) ?? 0) + 1);
    }
  }

  get(kind: SpecCoverageKind): number {
    return this.counts.get(kind) ?? 0;
  }

  format(label: string): string {
    const unmapped = [...this.samples.entries()]
      .slice(0, 10)
      .map(([key, n]) => `${key}×${n}`)
      .join(', ');
    return `[Cobertura] ${label}: concretas=${this.get('concrete')}; fallbackGenerico=${this.get('genericFallback')}; naoMapeadas=${this.get('unmapped')}${unmapped ? ` (${unmapped})` : ''}.`;
  }
}

/** Usa a specification concreta somente se ela existir no destino; caso contrário, a genérica. */
export function pickSpecification(
  concreteId: string | null,
  available: ReadonlySet<string>,
  genericId: string,
  coverage: SpecCoverage,
): string {
  if (concreteId && available.has(concreteId)) {
    coverage.record('concrete');
    return concreteId;
  }
  coverage.record('genericFallback');
  return genericId;
}

/** Chave de comparação de nomes de tipo: sem acento, caixa ou pontuação. */
export const normalizeTypeKey = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * Resolve o ResourceType de um tipo de equipamento Netwin sem duplicar vocabulário:
 * 1. CDO/CDOI -> tipos canônicos já fixados;
 * 2. nome ou sigla do catálogo igual (normalizado) a um tipo existente -> reutiliza esse tipo;
 * 3. caso contrário, um tipo dinâmico por NOME normalizado (tipos Netwin homônimos colapsam
 *    em um só), ou pela chave do catálogo quando não há nome.
 * Só há correspondência exata; nada é inferido por semelhança.
 */
export function resolveEquipmentTypeCode(
  tipoNe: number,
  nome: string | null | undefined,
  sigla: string | null | undefined,
  existingTypes: ReadonlyMap<string, string>,
): { code: string; existing: boolean } {
  const cdo = CDO_TYPE_TO_SPEC.get(tipoNe);
  if (cdo) return { code: cdo.typeCode, existing: true };
  for (const candidate of [nome, sigla]) {
    const key = normalizeTypeKey(candidate);
    const hit = key ? existingTypes.get(key) : undefined;
    if (hit) return { code: hit, existing: true };
  }
  const slug = normalizeTypeKey(nome ?? sigla);
  return {
    code: slug ? `netwin-${slug}`.slice(0, 120) : `netwin-equipment-${tipoNe}`,
    existing: false,
  };
}

/**
 * Pastas do Studio para tipos de equipamento Netwin: os mesmos grupos que o Netwin usa
 * internamente (`ISP_CAT_TECNOLOGIA`). Um tipo vai para a tecnologia predominante entre as suas
 * instâncias; sem tecnologia, cai em "Outros equipamentos".
 */
export const NETWIN_OTHER_EQUIPMENT_FOLDER = {
  code: 'grp-netwin-outros',
  name: 'Outros equipamentos',
} as const;

export interface NetwinTechnologyUsage {
  sigla: string | null;
  nome: string | null;
  count: number;
}

export const netwinTechnologyFolder = (
  sigla: string | null | undefined,
  nome: string | null | undefined,
): { code: string; name: string } => {
  const key = normalizeTypeKey(sigla ?? nome);
  if (!key) return NETWIN_OTHER_EQUIPMENT_FOLDER;
  return { code: `grp-netwin-tec-${key}`.slice(0, 120), name: (nome ?? sigla ?? '').trim() };
};

/** Tecnologia predominante (por nº de instâncias); empate resolvido pela sigla, de forma estável. */
export function netwinEquipmentFolder(usages: readonly NetwinTechnologyUsage[]): {
  code: string;
  name: string;
} {
  const best = [...usages]
    .filter((u) => normalizeTypeKey(u.sigla ?? u.nome))
    .sort((a, b) => b.count - a.count || (a.sigla ?? '').localeCompare(b.sigla ?? ''))[0];
  return best ? netwinTechnologyFolder(best.sigla, best.nome) : NETWIN_OTHER_EQUIPMENT_FOLDER;
}
