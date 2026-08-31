import { useEffect, useState } from 'react';
import { fetchTreeChildren, type GeoTreeNode } from '../services/geoTreeApi';

/**
 * Filhos diretos de um recurso (ex.: portas de uma placa, fibras de um cabo, ou o
 * splitter de uma CDOE). Sempre busca com `scope: 'all'` — `node.hasChildren` reflete
 * o escopo de árvore (com pass-through sobre item interno), então uma CDOE cujo único
 * filho é um splitter chega aqui com `hasChildren: false` mesmo tendo o que mostrar.
 */
export function useResourceChildren(node: GeoTreeNode): { children: GeoTreeNode[]; loading: boolean } {
  const [nodes, setNodes] = useState<GeoTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setNodes([]);
    setLoading(true);
    void fetchTreeChildren(node.id, { scope: 'all' })
      .then((page) => {
        if (cancelled) return;
        setNodes(page.nodes);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  return { children: nodes, loading };
}
