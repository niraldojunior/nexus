import { useEffect, useState } from 'react';
import type { NavigationParams } from '../utils/navigation';
import { parseNavigationParams, clearNavigationParams } from '../utils/navigation';
import { appRoutePath } from '../utils/appRoute';

/**
 * Hook para gerenciar navegação entre páginas com parâmetros.
 * Permite navegar com contexto (ex: "ir para Geo com Site X selecionado").
 */
export function useNavigation() {
  const [navParams, setNavParams] = useState<NavigationParams | null>(null);

  useEffect(() => {
    const params = parseNavigationParams();
    setNavParams(params);
  }, []);

  // Empurra o caminho canônico (para o F5 cair na página certa) preservando os query params que o
  // GeoPage ainda lê (`page`, `siteId`, `resourceId` via parseNavigationParams). Depois do pushState,
  // dispara `popstate` para o App reagir e trocar de página.
  const navigate = (path: string, params: NavigationParams) => {
    const url = new URL(window.location.href);
    url.pathname = path;
    url.searchParams.set('page', params.page);
    if (params.siteId) url.searchParams.set('siteId', params.siteId);
    if (params.resourceId) url.searchParams.set('resourceId', params.resourceId);
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    setNavParams(params);
  };

  const goToGeo = (siteId?: string) => {
    navigate(appRoutePath({ page: 'geo' }), { page: 'geo', siteId });
  };

  const goToResource = (resourceId?: string) => {
    navigate(appRoutePath({ page: 'resource' }), { page: 'resource', resourceId });
  };

  const goToService = (serviceId?: string) => {
    navigate(appRoutePath({ page: 'service' }), { page: 'service', resourceId: serviceId });
  };

  const clearNav = () => {
    clearNavigationParams();
    setNavParams(null);
  };

  return { navParams, goToGeo, goToResource, goToService, clearNav };
}
