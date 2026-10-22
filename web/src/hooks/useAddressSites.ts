import { useEffect, useState } from 'react';
import { fetchSitesByAddress, type GeoTreeNode } from '../services/geoTreeApi';
import type { DraftAddress } from '../utils/googleMaps';

export type AddressSitesState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; sites: GeoTreeNode[] };

/**
 * Locais cadastrados para o endereço consultado. A consulta exige rua e número: sem eles o
 * backend recusaria (e rua isolada não identifica um Local), então o estado é `unavailable`.
 */
export function useAddressSites(address: DraftAddress): AddressSitesState {
  const { street, streetNr, city, stateOrProvince, postcode, country } = address;
  const [state, setState] = useState<AddressSitesState>({ status: 'loading' });

  useEffect(() => {
    if (!street?.trim() || !streetNr?.trim()) {
      setState({ status: 'unavailable' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchSitesByAddress(
      { street, streetNr, city, stateOrProvince, postcode, country },
      { signal: controller.signal },
    )
      .then((sites) => {
        if (!controller.signal.aborted) setState({ status: 'ready', sites });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [street, streetNr, city, stateOrProvince, postcode, country]);

  return state;
}
