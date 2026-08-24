import { useEffect, useRef, useState } from 'react';
import { listGeoAddresses, listGeoSites } from '../services/geoApi';
import { buildGeoDirectory, listPlaceOptions, type PlaceOption } from '../utils/placeLabel';
import { useGeoSpecs } from './useGeoSpecs';

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;

// Autocomplete de local para PlacePicker: busca no backend (sites por nome + endereços por
// texto livre) em vez de filtrar o catálogo inteiro no cliente — ver issue #56. Mesmo padrão
// de debounce/token de GeoSearchBar.tsx.
export function usePlaceSearch(query: string): { options: PlaceOption[]; searching: boolean } {
  const { specs } = useGeoSpecs();
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    if (!term || !specs) {
      setOptions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(() => {
      const token = ++requestTokenRef.current;
      void Promise.all([
        listGeoSites({ name: term, limit: RESULT_LIMIT }),
        listGeoAddresses({ q: term, limit: RESULT_LIMIT }),
      ])
        .then(([sites, addresses]) => {
          if (requestTokenRef.current !== token) return;
          const directory = buildGeoDirectory(sites, addresses, [], specs);
          setOptions(listPlaceOptions(directory));
          setSearching(false);
        })
        .catch(() => {
          // Falha na busca (rede) não pode virar unhandled rejection — o autocomplete só
          // fica sem resultados, o usuário pode tentar de novo.
          if (requestTokenRef.current === token) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== undefined) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
      requestTokenRef.current += 1;
    };
  }, [query, specs]);

  return { options, searching };
}
