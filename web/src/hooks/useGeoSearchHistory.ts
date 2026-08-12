import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearSearchHistory,
  fetchSearchHistory,
  recordAddressVisit,
  recordNodeVisit,
  removeSearchHistoryEntry,
  type GeoSearchHistoryEntry,
} from '../services/geoSearchHistoryApi';
import type { GeoTreeNode } from '../services/geoTreeApi';
import type { DraftAddress } from '../utils/googleMaps';

const HISTORY_LIMIT = 8;

// Dedupe da carga inicial: o backend serializa requisições e o StrictMode monta o componente
// duas vezes (ver AGENTS.md §3 e useGeoDirectory). A promise em voo compartilhada em nível de
// módulo garante uma única chamada.
let inFlight: Promise<GeoSearchHistoryEntry[]> | null = null;

export type UseGeoSearchHistoryResult = {
  history: GeoSearchHistoryEntry[];
  recordNode: (node: GeoTreeNode) => void;
  recordAddress: (address: DraftAddress) => void;
  remove: (entryKey: string) => void;
  clear: () => void;
};

/**
 * Histórico da barra de pesquisa Geo, por usuário. Carrega uma vez ao montar e reordena após
 * cada gravação (o ranking por nº de visitas pode mudar). Remoção/limpeza são otimistas: a UI
 * atualiza na hora e o servidor confirma em segundo plano.
 */
export function useGeoSearchHistory(): UseGeoSearchHistoryResult {
  const [history, setHistory] = useState<GeoSearchHistoryEntry[]>([]);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!inFlight) inFlight = fetchSearchHistory(HISTORY_LIMIT);
    try {
      const entries = await inFlight;
      if (mountedRef.current) setHistory(entries);
    } finally {
      inFlight = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  const recordNode = useCallback(
    (node: GeoTreeNode) => {
      void recordNodeVisit(node).then(() => reload());
    },
    [reload],
  );

  const recordAddress = useCallback(
    (address: DraftAddress) => {
      void recordAddressVisit(address).then(() => reload());
    },
    [reload],
  );

  const remove = useCallback((entryKey: string) => {
    setHistory((current) => current.filter((entry) => entry.entryKey !== entryKey));
    void removeSearchHistoryEntry(entryKey);
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    void clearSearchHistory();
  }, []);

  return { history, recordNode, recordAddress, remove, clear };
}
