// Filhos diretos (recursos + sub-locais) de um Site, cacheados e deduplicados em nível de
// módulo — mesmo padrão de `useResourceComponents.ts`, o único hook que já tinha `inFlight`
// *e* `cached` em nível de módulo (não só a requisição em voo).
//
// Motivo: `SiteResourcesTab` e `SiteSubSitesTab` pedem, cada um por conta própria, a mesma
// `fetchTreeChildren('site:'+id, {scope:'all'})` ao abrir o painel de Local — um filtra
// `kind === 'resource'`, o outro `kind === 'site'`. Sem cache compartilhado, abrir o painel
// dispara a chamada duas vezes; com StrictMode (double-invoke), quatro.

import { useCallback, useEffect, useState } from 'react';
import { fetchTreeChildren, type GeoTreeNode } from '../services/geoTreeApi';

const inFlight = new Map<string, Promise<GeoTreeNode[]>>();
const cached = new Map<string, GeoTreeNode[]>();

const cacheKeyOf = (siteId: string): string => `site:${siteId}`;

const loadSiteChildren = (
  siteId: string,
  options?: { bypassCache?: boolean },
): Promise<GeoTreeNode[]> => {
  const cacheKey = cacheKeyOf(siteId);
  if (!options?.bypassCache) {
    const cachedNodes = cached.get(cacheKey);
    if (cachedNodes) return Promise.resolve(cachedNodes);
  }
  const current = inFlight.get(cacheKey);
  if (current) return current;
  const request = fetchTreeChildren(`site:${siteId}`, { scope: 'all' })
    .then((page) => {
      cached.set(cacheKey, page.nodes);
      return page.nodes;
    })
    .finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, request);
  return request;
};

/** Invalida os filhos cacheados do Site após vincular/desvincular recurso ou criar/excluir sub-local. */
export function invalidateSiteChildren(siteId: string): void {
  cached.delete(cacheKeyOf(siteId));
}

/**
 * Carrega os filhos diretos (`scope: 'all'`) de um Site, deduplicado e cacheado em nível de
 * módulo. O chamador filtra por `kind` ('resource' | 'site') — este hook devolve a lista
 * crua, igual ao que `fetchTreeChildren` já devolvia antes.
 */
export function useSiteChildren(siteId: string): {
  nodes: GeoTreeNode[];
  loading: boolean;
  reload: () => void;
} {
  const [nodes, setNodes] = useState<GeoTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => {
    invalidateSiteChildren(siteId);
    setRevision((current) => current + 1);
  }, [siteId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadSiteChildren(siteId, { bypassCache: revision > 0 })
      .then((result) => {
        if (!cancelled) setNodes(result);
      })
      .catch(() => {
        if (!cancelled) setNodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, revision]);

  return { nodes, loading, reload };
}
