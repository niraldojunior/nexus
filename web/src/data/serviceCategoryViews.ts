import type { ServiceCategory, ServiceSpecification, ServiceState } from '../services/serviceApi';
import { SERVICE_CATEGORY_DEFAULTS } from './serviceCatalogDefaults';

/**
 * Navegação do Módulo de Serviços organizada por categoria — espelha `resourceCategoryViews.ts`.
 *
 * Cada ServiceCategory vira um item de submenu; a distinção Inventário × Catálogo é uma sub-aba
 * dentro da própria página (ver `SERVICE_VIEWS`). A camada CFS × RFS não é navegação: é filtro de
 * coluna dentro do Inventário.
 */

export type ServiceView = 'inventory' | 'catalog';

export const SERVICE_VIEWS: Array<{ id: ServiceView; label: string }> = [
  { id: 'inventory', label: 'Inventário' },
  { id: 'catalog', label: 'Catálogo' },
];

/** Categorias ativas, na ordem canônica da spec. */
export function listServiceCategories(categories: ServiceCategory[]): ServiceCategory[] {
  const order = new Map(SERVICE_CATEGORY_DEFAULTS.map((category, index) => [category.code, index]));
  return [...categories].sort((left, right) => {
    const leftIndex = order.get(left.code) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.code) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.name.localeCompare(right.name);
  });
}

/** Rótulo a exibir no submenu lateral para uma categoria. */
export function sidebarCategoryLabel(category: ServiceCategory): string {
  return category.name;
}

/** Categoria padrão ao abrir o módulo. */
export const DEFAULT_SERVICE_CATEGORY_CODE = SERVICE_CATEGORY_DEFAULTS[0]?.code ?? 'Access';

/**
 * Resolve a categoria de um serviço: `service.category` quando presente, senão via a spec que ele
 * referencia (`spec.category`). Serviços sem categoria resolvível não aparecem em nenhum submenu.
 */
export function serviceCategoryCode(
  service: { category?: string; serviceSpecificationId: string },
  specificationsById: Map<string, ServiceSpecification>,
): string | undefined {
  if (service.category?.trim()) return service.category;
  return specificationsById.get(service.serviceSpecificationId)?.category;
}

/** Rótulos PT-BR do ciclo de vida TMF638 (§10.3). "Suspenso" não é estado canônico. */
export const SERVICE_STATE_LABELS: Record<ServiceState, string> = {
  feasibilityChecked: 'Viabilidade verificada',
  designed: 'Desenhado',
  reserved: 'Reservado',
  inactive: 'Inativo',
  active: 'Ativo',
  terminated: 'Encerrado',
};

export const SERVICE_STATE_ORDER: ServiceState[] = [
  'feasibilityChecked',
  'designed',
  'reserved',
  'inactive',
  'active',
  'terminated',
];
