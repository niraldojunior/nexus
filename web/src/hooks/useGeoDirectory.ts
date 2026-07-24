import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  listGeoSites,
  listGeoAddresses,
  listGeoLocations,
  listGeoSiteSpecifications,
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

// Compartilhado entre todos os componentes que chamam o hook — sem isso, ResourcePage e
// ServicePage montando juntos disparavam as mesmas 4 chamadas (sites, endereços, locais,
// especificações — endereços e locais somam ~10 mil linhas cada) de forma independente, inclusive
// duplicadas pelo double-mount do StrictMode. `inFlight` deduplica montagens concorrentes;
// `sharedDirectory` evita refazer o fetch a cada remontagem dentro da mesma sessão.
let sharedDirectory: GeoDirectory | null = null;
let inFlight: Promise<GeoDirectory> | null = null;

const fetchDirectory = async (): Promise<GeoDirectory> => {
  const [sites, addresses, locations, specs] = await Promise.all([
    listGeoSites(),
    listGeoAddresses(),
    listGeoLocations(),
    listGeoSiteSpecifications(),
  ]);
  return buildGeoDirectory(sites, addresses, locations, specs);
};

/**
 * Hook compartilhado que carrega o diretório Geo (sites, endereços, locais, especificações) e o
 * mantém em cache de módulo. Usado por ResourcePage e ServicePage para resolução de rótulos
 * amigáveis de locais (PlaceLabel/PlacePicker).
 *
 * Recarrega automaticamente ao montar (usando o cache se já existir); chamar `reload()` força
 * um refetch, útil após criar/editar um local em outra tela.
 */
export function useGeoDirectory(): UseGeoDirectoryResult {
  const [directory, setDirectory] = useState<GeoDirectory | null>(sharedDirectory);
  const [loading, setLoading] = useState(!sharedDirectory);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (!force && sharedDirectory) {
      setDirectory(sharedDirectory);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!inFlight) inFlight = fetchDirectory();
      const dir = await inFlight;
      sharedDirectory = dir;
      setDirectory(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar locais');
      setDirectory(null);
    } finally {
      inFlight = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const options = useMemo(() => (directory ? listPlaceOptions(directory) : []), [directory]);

  return { directory, options, loading, error, reload: () => load(true) };
}
