import { useEffect, useState } from 'react';
import {
  fetchInternalPlantResources,
  type InternalPlantResourceFilter,
  type InternalPlantResourcePage,
} from '../services/internalPlantApi';

export const INTERNAL_PLANT_PAGE_SIZE = 25;

export type InternalPlantResourcesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: InternalPlantResourcePage };

/**
 * Consulta paginada de recursos. Só busca com um filtro confirmado; cancela a requisição anterior
 * e descarta respostas obsoletas. `retryToken` força nova tentativa após erro.
 */
export function useInternalPlantResources(
  filter: InternalPlantResourceFilter | null,
  offset: number,
  retryToken: number,
): InternalPlantResourcesState {
  const [state, setState] = useState<InternalPlantResourcesState>({ status: 'idle' });
  const filterKey = filter ? JSON.stringify(filter) : '';

  useEffect(() => {
    if (!filter) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchInternalPlantResources(
      filter,
      { limit: INTERNAL_PLANT_PAGE_SIZE, offset },
      controller.signal,
    )
      .then((page) => {
        if (!controller.signal.aborted) setState({ status: 'ready', page });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao consultar recursos.',
        });
      });
    return () => controller.abort();
  }, [filterKey, offset, retryToken]);

  return state;
}
