import type { PageId } from '../types';
import { RESOURCE_CATEGORY_DEFAULTS } from '../data/resourceCatalogDefaults';
import { SERVICE_CATEGORY_DEFAULTS } from '../data/serviceCatalogDefaults';
import { DEFAULT_RESOURCE_CATEGORY_CODE } from '../data/resourceCategoryViews';
import { DEFAULT_SERVICE_CATEGORY_CODE } from '../data/serviceCategoryViews';

/**
 * Mapa único entre a URL (caminho) e o estado de navegação da aplicação.
 *
 * O SPA fallback já existe nos três ambientes (vercel.json, Caddyfile e o dev server do Vite),
 * então caminhos aninhados como `/resources/equipment-access` funcionam sem mudança de infra: o
 * servidor sempre devolve `index.html` e a aplicação resolve a rota no cliente.
 *
 * Escopo do que a URL carrega: nível de página (página + categoria ativa + sessão aberta). Estado
 * interno de tela (seleção no mapa, filtros de coluna, aba do painel) não é serializado.
 */
export type AppRoute = {
  page: PageId;
  /** Sessão de pesquisa aberta (rota `/c/<id>`), quando a página é `research`. */
  sessionId?: string;
  /** Conversa mock legada (`/c/conversation-*`), quando a página é `conversation`. */
  conversationId?: string;
  /** Categoria ativa do módulo de Recursos, quando a página é `resource`. */
  resourceCategory?: string;
  /** Categoria ativa do módulo de Serviços, quando a página é `service`. */
  serviceCategory?: string;
};

/** `Equipment.Access` → `equipment-access`; `Access` → `access`. */
export function categorySlug(code: string): string {
  return code.replace(/\./g, '-').toLowerCase();
}

/** Resolve um slug de categoria de recurso para o código canônico (fallback: categoria padrão). */
export function resolveResourceCategorySlug(slug: string): string {
  const match = RESOURCE_CATEGORY_DEFAULTS.find(
    (category) => categorySlug(category.code) === slug.toLowerCase(),
  );
  return match?.code ?? DEFAULT_RESOURCE_CATEGORY_CODE;
}

/** Resolve um slug de categoria de serviço para o código canônico (fallback: categoria padrão). */
export function resolveServiceCategorySlug(slug: string): string {
  const match = SERVICE_CATEGORY_DEFAULTS.find(
    (category) => categorySlug(category.code) === slug.toLowerCase(),
  );
  return match?.code ?? DEFAULT_SERVICE_CATEGORY_CODE;
}

/** Página inicial quando a URL é `/`: no celular abre Locais; no desktop, Nova conversa. */
function deviceDefaultRoute(isMobile: boolean): AppRoute {
  return isMobile ? { page: 'geo' } : { page: 'research' };
}

/**
 * Interpreta o caminho da URL como estado de navegação. Caminhos desconhecidos caem no padrão do
 * dispositivo — o mesmo que `/`.
 */
export function parseAppRoute(pathname: string, options: { isMobile: boolean }): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/') return deviceDefaultRoute(options.isMobile);

  // Sessões e conversas legadas: `/c/<id>`. IDs `conversation-*` são conversas mock do copiloto;
  // qualquer outro id é uma sessão de pesquisa (ver App.tsx).
  const conversationMatch = path.match(/^\/c\/([^/]+)$/);
  if (conversationMatch) {
    const id = decodeURIComponent(conversationMatch[1]);
    if (id.startsWith('conversation-')) return { page: 'conversation', conversationId: id };
    return { page: 'research', sessionId: id };
  }

  const [, head, tail] = path.match(/^\/([^/]+)(?:\/([^/]+))?$/) ?? [];

  switch (head) {
    case 'geo':
      return { page: 'geo' };
    case 'resources':
      return {
        page: 'resource',
        resourceCategory: tail ? resolveResourceCategorySlug(tail) : DEFAULT_RESOURCE_CATEGORY_CODE,
      };
    case 'services':
      return {
        page: 'service',
        serviceCategory: tail ? resolveServiceCategorySlug(tail) : DEFAULT_SERVICE_CATEGORY_CODE,
      };
    case 'orders':
      return { page: 'order' };
    case 'conversations':
      return { page: 'conversas' };
    case 'new-conversation':
      return { page: 'research' };
    case 'assistant':
      return { page: 'assistant' };
    default:
      return deviceDefaultRoute(options.isMobile);
  }
}

/** Caminho canônico de uma rota — inverso de `parseAppRoute`. */
export function appRoutePath(route: AppRoute): string {
  switch (route.page) {
    case 'geo':
      return '/geo';
    case 'resource':
      return `/resources/${categorySlug(route.resourceCategory ?? DEFAULT_RESOURCE_CATEGORY_CODE)}`;
    case 'service':
      return `/services/${categorySlug(route.serviceCategory ?? DEFAULT_SERVICE_CATEGORY_CODE)}`;
    case 'order':
      return '/orders';
    case 'conversas':
      return '/conversations';
    case 'assistant':
      return '/assistant';
    case 'conversation':
      return route.conversationId ? `/c/${encodeURIComponent(route.conversationId)}` : '/';
    case 'research':
      return route.sessionId ? `/c/${encodeURIComponent(route.sessionId)}` : '/new-conversation';
    default:
      return '/';
  }
}
