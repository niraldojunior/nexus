import { useEffect, useState, useCallback } from 'react';
import {
  listGeoSites,
  listGeoAddresses,
  listGeoLocations,
  listGeoSiteSpecifications,
  type GeoSite,
  type GeoAddress,
  type GeoLocation,
  type GeoSpec,
} from '../services/geoApi';
import {
  buildGeoDirectory,
  listPlaceOptions,
  type GeoDirectory,
  type PlaceOption,
} from '../utils/placeLabel';

export type UseGeoDirectoryResult = {
  directory: GeoDirectory | null;
  options: PlaceOption[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Hook compartilhado que carrega o diretório Geo completo (sites, endereços,
 * locais, especificações) uma vez e o mantém em cache. Usado por GeoPage,
 * ResourcePage, ServicePage para resolução de rótulos amigáveis de locais.
 *
 * Recarrega automaticamente ao montar; chamar `reload()` para atualizar.
 */
export function useGeoDirectory(): UseGeoDirectoryResult {
  const [directory, setDirectory] = useState<GeoDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sites, addresses, locations, specs] = await Promise.all([
        listGeoSites(),
        listGeoAddresses(),
        listGeoLocations(),
        listGeoSiteSpecifications(),
      ]);
      const dir = buildGeoDirectory(sites, addresses, locations, specs);
      setDirectory(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar locais');
      setDirectory(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const options = directory ? listPlaceOptions(directory) : [];

  return { directory, options, loading, error, reload: load };
}
