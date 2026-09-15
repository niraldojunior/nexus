import { useEffect, useState } from 'react';
import { getPublishedMapLayerCatalog, type StudioGeoCatalog } from '../services/studioGeoApi';

const EMPTY_PENDING_CATALOG: StudioGeoCatalog = {
  schemaVersion: 2,
  nodes: [],
  configured: false,
  environmentId: 'pending',
  fallback: false,
};

// Ambiente usado quando a busca do catálogo falha (erro de rede, backend fora do ar, 5xx sob
// carga — o backend de dev atende requisições em série, ver AGENTS.md §3, e este endpoint
// compete com todo o resto disparado na abertura da página). Sem isto, `loading` vira `false`
// mas `catalog.environmentId` continuaria `'pending'` — um valor que GeoPage passaria adiante
// como se fosse um ambiente resolvido de verdade, fazendo useGeoViewState ler/gravar
// preferências de mapa (viewport, camadas) sob a chave `nexus.geo.viewState::pending`, que não
// bate com a chave real do ambiente usada em qualquer outra sessão bem-sucedida — o usuário
// perde a posição salva mesmo com a URL intacta (ver resolveInitialViewState). `'legacy'` é o
// mesmo valor estável que EnvironmentProfileRepository.get() já usa como fallback do lado do
// servidor, então pelo menos falhas repetidas convergem para a mesma chave em vez de uma
// sentinela que nunca deveria sair do estado "carregando".
const FAILED_CATALOG_ENVIRONMENT_ID = 'legacy';

export type UseMapLayerCatalog = {
  catalog: StudioGeoCatalog;
  loading: boolean;
  error: string | null;
};

/**
 * The catalog is only available after the operational endpoint responds. The service owns a
 * module-level in-flight promise, so StrictMode does not duplicate the request against the serial
 * local backend.
 */
export function useMapLayerCatalog(): UseMapLayerCatalog {
  const [catalog, setCatalog] = useState<StudioGeoCatalog>(EMPTY_PENDING_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPublishedMapLayerCatalog()
      .then((published) => {
        if (cancelled) return;
        setCatalog(published);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'Falha ao carregar catálogo de camadas.');
        setCatalog((prev) => ({ ...prev, environmentId: FAILED_CATALOG_ENVIRONMENT_ID }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, loading, error };
}
