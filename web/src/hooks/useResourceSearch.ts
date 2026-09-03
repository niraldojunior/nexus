import { useEffect, useRef, useState } from 'react';
import { listResources, type ResourceEntity } from '../services/resourceApi';

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;

// Autocomplete de recurso para o editor de "Recurso Pai" (issue #186) — busca no backend por
// nome, nunca filtra o inventário inteiro no cliente. Mesmo padrão de debounce/token de
// usePlaceSearch.ts. `excludeId` tira o próprio recurso da lista (não pode ser pai de si mesmo);
// o backend não valida ciclos mais profundos — fora de escopo desta edição.
export function useResourceSearch(
  query: string,
  excludeId?: string,
): { options: ResourceEntity[]; searching: boolean } {
  const [options, setOptions] = useState<ResourceEntity[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    if (!term) {
      setOptions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(() => {
      const token = ++requestTokenRef.current;
      void listResources({ kind: 'PhysicalResource', limit: RESULT_LIMIT, offset: 0, name: term })
        .then((results) => {
          if (requestTokenRef.current !== token) return;
          setOptions(excludeId ? results.filter((item) => item.id !== excludeId) : results);
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
  }, [query, excludeId]);

  return { options, searching };
}
