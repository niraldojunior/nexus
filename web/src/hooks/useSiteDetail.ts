// Estado do painel unificado de Local (REQ-MOD01-016): carrega Site + Endereço + Localização
// + Origem numa passada só. As quatro chamadas rodam em paralelo (Promise.all) mas o hook
// inteiro é deduplicado por siteId — o backend de dev atende requisições em série e o
// React.StrictMode monta duas vezes (AGENTS.md §3), então trocar de aba ou reabrir o mesmo
// local não pode disparar a mesma leva de chamadas em dobro.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSiteOrigin,
  getJson,
  type GeoAddress,
  type GeoLocation,
  type GeoSite,
  type SiteOrigin,
} from '../services/geoApi';

export type SiteDetailState = {
  site: GeoSite | null;
  address: GeoAddress | null;
  location: GeoLocation | null;
  origin: SiteOrigin | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

type SiteDetailBundle = {
  site: GeoSite;
  address: GeoAddress | null;
  location: GeoLocation | null;
  origin: SiteOrigin | null;
};

const inFlight = new Map<string, Promise<SiteDetailBundle>>();

async function fetchSiteDetail(siteId: string): Promise<SiteDetailBundle> {
  const site = await getJson<GeoSite>(`/v1/geo/sites/${siteId}`);
  const [address, location, origin] = await Promise.all([
    site.address?.id ? getJson<GeoAddress>(`/v1/geo/addresses/${site.address.id}`) : null,
    site.place?.id ? getJson<GeoLocation>(`/v1/geo/locations/${site.place.id}`) : null,
    fetchSiteOrigin(siteId).catch(() => null),
  ]);
  return { site, address, location, origin };
}

export function useSiteDetail(siteId: string | null): SiteDetailState {
  const [site, setSite] = useState<GeoSite | null>(null);
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [origin, setOrigin] = useState<SiteOrigin | null>(null);
  const [loading, setLoading] = useState(Boolean(siteId));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!siteId) {
      setSite(null);
      setAddress(null);
      setLocation(null);
      setOrigin(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let pending = inFlight.get(siteId);
      if (!pending) {
        pending = fetchSiteDetail(siteId);
        inFlight.set(siteId, pending);
      }
      const bundle = await pending;
      if (!mountedRef.current) return;
      setSite(bundle.site);
      setAddress(bundle.address);
      setLocation(bundle.location);
      setOrigin(bundle.origin);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o local.');
      }
    } finally {
      inFlight.delete(siteId);
      if (mountedRef.current) setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return { site, address, location, origin, loading, error, reload };
}
