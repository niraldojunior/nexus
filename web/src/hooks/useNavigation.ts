import { useEffect, useState } from 'react';
import type { NavigationParams } from '../utils/navigation';
import { parseNavigationParams, clearNavigationParams } from '../utils/navigation';

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

  const goToGeo = (siteId?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'geo');
    if (siteId) {
      url.searchParams.set('siteId', siteId);
    }
    window.history.pushState({}, '', url.toString());
    setNavParams({ page: 'geo', siteId });
  };

  const goToResource = (resourceId?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'resource');
    if (resourceId) {
      url.searchParams.set('resourceId', resourceId);
    }
    window.history.pushState({}, '', url.toString());
    setNavParams({ page: 'resource', resourceId });
  };

  const goToService = (serviceId?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'service');
    if (serviceId) {
      url.searchParams.set('resourceId', serviceId);
    }
    window.history.pushState({}, '', url.toString());
    setNavParams({ page: 'service', resourceId: serviceId });
  };

  const clearNav = () => {
    clearNavigationParams();
    setNavParams(null);
  };

  return { navParams, goToGeo, goToResource, goToService, clearNav };
}
