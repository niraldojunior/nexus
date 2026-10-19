import { useEffect, useState } from 'react';
import { fetchInternalPlantSites, type InternalPlantSitePage } from '../services/internalPlantApi';

export const INTERNAL_PLANT_SITES_PAGE_SIZE = 25;

export type InternalPlantSitesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: InternalPlantSitePage };

/**
 * Busca paginada de Locais por nome. Só consulta com um termo confirmado; cancela a requisição
 * anterior e descarta respostas obsoletas. `retryToken` força nova tentativa (ou recarga).
 */
export function useInternalPlantSites(
  query: string | null,
  offset: number,
  retryToken: number,
): InternalPlantSitesState {
  const [state, setState] = useState<InternalPlantSitesState>({ status: 'idle' });

  useEffect(() => {
    if (!query) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchInternalPlantSites(
      query,
      { limit: INTERNAL_PLANT_SITES_PAGE_SIZE, offset },
      controller.signal,
    )
      .then((page) => {
        if (!controller.signal.aborted) setState({ status: 'ready', page });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao consultar locais.',
        });
      });
    return () => controller.abort();
  }, [query, offset, retryToken]);

  return state;
}
