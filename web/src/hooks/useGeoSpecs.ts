import { useEffect, useState, useCallback } from 'react';
import { listGeoSiteSpecifications, type GeoSpec } from '../services/geoApi';

// Catálogo de site-specifications: dezenas de linhas, não milhares — ao contrário de
// sites/addresses/locations, carregar tudo de uma vez é seguro aqui (ver useGeoDirectory.ts
// e issue #56 para o histórico do que NÃO deve ser carregado assim).
let sharedSpecs: GeoSpec[] | null = null;
let inFlight: Promise<GeoSpec[]> | null = null;

export function useGeoSpecs(): { specs: GeoSpec[] | null; loading: boolean } {
  const [specs, setSpecs] = useState<GeoSpec[] | null>(sharedSpecs);
  const [loading, setLoading] = useState(!sharedSpecs);

  const load = useCallback(async () => {
    if (sharedSpecs) {
      setSpecs(sharedSpecs);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (!inFlight) inFlight = listGeoSiteSpecifications();
      const result = await inFlight;
      sharedSpecs = result;
      setSpecs(result);
    } finally {
      inFlight = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { specs, loading };
}
