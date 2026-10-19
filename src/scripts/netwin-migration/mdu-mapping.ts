import type { GeographicSubAddress, GeographicSubAddressType } from '../../modules/geo/domain.js';

/**
 * Transformações puras do contrato MDU do Netwin (issue #310). O complemento estruturado vive nos
 * ATTRs do `NETWIN.ADDRESS` (cat 115); o código de cada slot aponta para
 * `NETWINOI.OSP_TP_ADDR_COMPLEMENTOS`. Nada aqui lê texto livre do endereço.
 */

export type ComplementCatalogEntry = { id: number; name: string; abbreviation: string };
export type ComplementCatalog = Map<number, ComplementCatalogEntry>;

/** Slots de complemento do `ADDRESS`: código (FK-like) e argumento(s). */
export type ComplementAttrs = {
  ATTR31: string | null;
  ATTR32: string | null;
  ATTR39: string | null;
  ATTR40: string | null;
  ATTR43: string | null;
  ATTR44: string | null;
  ATTR45: string | null;
  ATTR48: string | null;
  ATTR49: string | null;
};

export const COMPLEMENT_ATTR_COLUMNS = [
  'ATTR31',
  'ATTR32',
  'ATTR39',
  'ATTR40',
  'ATTR43',
  'ATTR44',
  'ATTR45',
  'ATTR48',
  'ATTR49',
] as const;

export type SubAddressResult = {
  subAddress: GeographicSubAddress[];
  /** Códigos sem tipo TMF conhecido (ex.: "Acampamento"): ficam em characteristic, não no subAddress. */
  unmapped: string[];
};

const NOT_APPLICABLE_ID = 117;

const norm = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/gu, '').trim().toLowerCase();

/** Tipo TMF673 pelo nome do complemento no catálogo; `null` quando não há equivalente. */
export function subAddressTypeOf(entry: ComplementCatalogEntry): GeographicSubAddressType | null {
  const name = norm(entry.name);
  if (name === 'bloco') return 'block';
  if (name === 'torre') return 'tower';
  if (name === 'edificio' || name === 'predio') return 'building';
  if (name === 'andar' || name === 'pavimento') return 'floor';
  if (
    ['apartamento', 'sala', 'loja', 'casa', 'conjunto', 'cobertura', 'box', 'garagem'].includes(
      name,
    )
  )
    return 'unit';
  return null;
}

const RANK: Record<GeographicSubAddressType, number> = {
  building: 0,
  tower: 1,
  block: 2,
  floor: 3,
  unit: 4,
};

const clean = (value: string | null | undefined): string | undefined => {
  const text = (value ?? '').trim();
  return text ? text : undefined;
};

type Slot = { code: string | null; args: Array<string | null> };

export function complementsToSubAddress(
  attrs: ComplementAttrs,
  catalog: ComplementCatalog,
): SubAddressResult {
  const slots: Slot[] = [
    { code: attrs.ATTR31, args: [attrs.ATTR32] },
    { code: attrs.ATTR39, args: [attrs.ATTR40] },
    { code: attrs.ATTR43, args: [attrs.ATTR44, attrs.ATTR45] },
    { code: attrs.ATTR48, args: [attrs.ATTR49] },
  ];
  const items: GeographicSubAddress[] = [];
  const unmapped: string[] = [];
  for (const slot of slots) {
    const codeText = clean(slot.code);
    if (!codeText) continue;
    const id = Number(codeText);
    if (!Number.isFinite(id) || id === NOT_APPLICABLE_ID || id < 0) continue;
    const entry = catalog.get(id);
    if (!entry) {
      unmapped.push(`código ${codeText}`);
      continue;
    }
    const type = subAddressTypeOf(entry);
    if (!type) {
      unmapped.push(entry.name);
      continue;
    }
    // O andar usa o argumento "real" (slot 4); os demais, o primeiro argumento.
    const arg = clean(slot.args[0]);
    if (!arg) continue;
    const item: GeographicSubAddress = { '@type': 'GeographicSubAddress', type };
    if (type === 'floor') item.levelNumber = arg;
    else if (type === 'unit') {
      item.subUnitNumber = arg;
      item.name = `${entry.name} ${arg}`;
    } else item.name = arg;
    items.push(item);
  }
  items.sort((a, b) => RANK[a.type] - RANK[b.type]);
  return { subAddress: items, unmapped };
}

/** Só a parte do prédio (bloco/torre/edifício) — o que o endereço do survey carrega. */
export function buildingSubAddress(result: SubAddressResult): GeographicSubAddress[] {
  return result.subAddress.filter((item) => RANK[item.type] <= RANK.block);
}

/**
 * Spec do Site do survey. 2+ UCs é MDU: BLOCK quando agrupado em condomínio, senão BUILDING.
 * Survey de 0/1 UC é a unidade atendida (casa) — CUSTOMER_SITE.
 */
export function surveySpecCode(unitCount: number, hasCondominium: boolean): string {
  if (unitCount >= 2) return hasCondominium ? 'BLOCK' : 'BUILDING';
  return 'CUSTOMER_SITE';
}

/** Chave de agrupamento do condomínio; `null` sem base de endereço ou fachada. */
export function condominiumKey(
  baseAddressId: number | null,
  fachada: string | null,
): string | null {
  const facade = clean(fachada);
  if (baseAddressId === null || baseAddressId === undefined || !facade) return null;
  return `${baseAddressId}:${facade}`;
}
