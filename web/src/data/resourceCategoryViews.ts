import type { ResourceCategory } from '../services/resourceApi';
import { RESOURCE_CATEGORY_DEFAULTS } from './resourceCatalogDefaults';

/**
 * Navegação do Módulo de Recursos organizada por categoria.
 *
 * As páginas deixaram de ser por entidade TMF (Físico / Lógico / Catálogo) e passaram a ser
 * por categoria de recurso. Cada categoria vira um item de menu; a distinção Inventário × Catálogo
 * é uma sub-aba dentro da própria página (ver `RESOURCE_VIEWS`).
 */

export type ResourceView = 'inventory' | 'catalog';

export const RESOURCE_VIEWS: Array<{ id: ResourceView; label: string }> = [
  { id: 'inventory', label: 'Inventário' },
  { id: 'catalog', label: 'Catálogo' },
];

/** Rótulos PT-BR das famílias de categoria, na ordem em que aparecem no menu. */
export const RESOURCE_CATEGORY_GROUPS: Array<{ key: string; label: string }> = [
  { key: 'Equipment', label: 'Equipamentos' },
  { key: 'Infrastructure', label: 'Infraestrutura' },
  { key: 'Cable', label: 'Cabos' },
  { key: 'Logical', label: 'Lógicos' },
];

/** Primeiro segmento do código canônico (`Equipment.Access` → `Equipment`). */
export function resourceCategoryGroupKey(categoryCode: string): string {
  const [head] = categoryCode.split('.');
  return head ?? categoryCode;
}

/**
 * Rótulos enxutos usados apenas no item do submenu lateral. A página aberta ao selecionar a
 * categoria continua exibindo o nome completo (`ResourceCategory.name`).
 */
const SIDEBAR_CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  'Equipment.Access': 'Acesso',
  'Equipment.CustomerPremises': 'Cliente',
  'Equipment.Transport': 'Transporte',
};

/** Rótulo a exibir no submenu lateral para uma categoria (nome completo se não houver override). */
export function sidebarCategoryLabel(category: ResourceCategory): string {
  return SIDEBAR_CATEGORY_LABEL_OVERRIDES[category.code] ?? category.name;
}

export type ResourceCategoryGroup = {
  key: string;
  label: string;
  categories: ResourceCategory[];
};

/**
 * Agrupa as categorias ativas por família, preservando a ordem de `RESOURCE_CATEGORY_GROUPS`.
 * Famílias sem rótulo conhecido caem num grupo "Outros" ao final.
 */
export function groupResourceCategories(categories: ResourceCategory[]): ResourceCategoryGroup[] {
  const active = categories.filter((category) => category.status === 'active');
  const byKey = new Map<string, ResourceCategory[]>();
  for (const category of active) {
    const key = resourceCategoryGroupKey(category.code);
    const bucket = byKey.get(key) ?? [];
    bucket.push(category);
    byKey.set(key, bucket);
  }

  const groups: ResourceCategoryGroup[] = [];
  for (const { key, label } of RESOURCE_CATEGORY_GROUPS) {
    const bucket = byKey.get(key);
    if (!bucket?.length) continue;
    groups.push({ key, label, categories: sortByName(bucket) });
    byKey.delete(key);
  }

  const leftovers = [...byKey.entries()].flatMap(([, bucket]) => bucket);
  if (leftovers.length) {
    groups.push({ key: 'Other', label: 'Outros', categories: sortByName(leftovers) });
  }

  return groups;
}

function sortByName(categories: ResourceCategory[]): ResourceCategory[] {
  return [...categories].sort((left, right) => left.name.localeCompare(right.name));
}

/** Categoria padrão ao abrir o módulo (primeira família, primeira categoria). */
export const DEFAULT_RESOURCE_CATEGORY_CODE =
  groupResourceCategories(RESOURCE_CATEGORY_DEFAULTS)[0]?.categories[0]?.code ?? 'Equipment.Access';

/**
 * Ponto de extensão para especialização futura por categoria.
 *
 * Hoje todas as categorias usam o comportamento padrão (tabela/modais genéricos). Quando uma
 * categoria precisar de colunas ou campos próprios, registre aqui `code → { ... }` e consuma no
 * `ResourcePage`. Manter vazio significa "comportamento padrão para todas".
 */
export type ResourceCategorySpecialization = {
  /** Colunas extras a exibir na tabela de inventário desta categoria (reservado para uso futuro). */
  extraColumns?: Array<{ key: string; label: string }>;
};

export const RESOURCE_CATEGORY_SPECIALIZATIONS: Record<string, ResourceCategorySpecialization> = {};
