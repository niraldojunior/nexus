/**
 * Utilitários para navegação entre páginas com parâmetros.
 * Permite navegar entre Recursos/Serviços e Locais.
 */

export type NavigationParams = {
  page: 'geo' | 'resource' | 'service';
  siteId?: string;
  resourceId?: string;
};

/**
 * Construir URL com parâmetros de navegação.
 * Ex: /app?page=geo&siteId=abc123
 */
export function buildNavigationUrl(params: NavigationParams): string {
  const url = new URL(window.location.href);
  url.searchParams.set('page', params.page);
  if (params.siteId) url.searchParams.set('siteId', params.siteId);
  if (params.resourceId) url.searchParams.set('resourceId', params.resourceId);
  return url.toString();
}

/**
 * Extrair parâmetros de navegação da URL.
 */
export function parseNavigationParams(): NavigationParams | null {
  const url = new URL(window.location.href);
  const page = url.searchParams.get('page') as NavigationParams['page'] | null;
  if (!page) return null;
  return {
    page,
    siteId: url.searchParams.get('siteId') ?? undefined,
    resourceId: url.searchParams.get('resourceId') ?? undefined,
  };
}

/**
 * Limpar parâmetros de navegação da URL.
 */
export function clearNavigationParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('page');
  url.searchParams.delete('siteId');
  url.searchParams.delete('resourceId');
  window.history.replaceState({}, '', url.toString());
}
