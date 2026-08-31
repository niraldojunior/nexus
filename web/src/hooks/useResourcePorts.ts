import { useEffect, useState } from 'react';
import { fetchTreeChildren, type GeoTreeNode } from '../services/geoTreeApi';

export type ResourcePortGroup = {
  splitter: GeoTreeNode;
  ports: GeoTreeNode[];
};

// Ordena FO.I antes de FO.O.1..N; dentro de FO.O, por índice numérico. Sublabel/label
// não carregam o `role`/`index` estruturado — a ordenação lê do próprio nome
// (`<splitter> · FO.I` / `<splitter> · FO.O.<n>`), gravado assim por load-cto-ports.mjs.
function comparePorts(a: GeoTreeNode, b: GeoTreeNode): number {
  const aIn = a.label.endsWith('FO.I');
  const bIn = b.label.endsWith('FO.I');
  if (aIn !== bIn) return aIn ? -1 : 1;
  const aIndex = Number(a.label.match(/FO\.O\.(\d+)$/)?.[1] ?? 0);
  const bIndex = Number(b.label.match(/FO\.O\.(\d+)$/)?.[1] ?? 0);
  return aIndex - bIndex;
}

/**
 * Portas de uma CTO (issue #171 Fase 3): busca os splitters contidos na CTO e, para
 * cada um, as portas contidas nele — dois níveis de `fetchTreeChildren`, sempre com
 * `scope: 'all'` (Splitter e Port são itens internos, escondidos em `scope: 'tree'`).
 * Splitter tipicamente é 1 por CTO — sem paginação.
 */
export function useResourcePorts(ctoNode: GeoTreeNode): {
  groups: ResourcePortGroup[];
  loading: boolean;
} {
  const [groups, setGroups] = useState<ResourcePortGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setGroups([]);
    setLoading(true);

    void (async () => {
      try {
        const childrenPage = await fetchTreeChildren(ctoNode.id, { scope: 'all' });
        const splitters = childrenPage.nodes.filter((n) => n.resourceType === 'Splitter');
        const results = await Promise.all(
          splitters.map(async (splitter) => {
            const portsPage = await fetchTreeChildren(splitter.id, { scope: 'all' });
            const ports = portsPage.nodes
              .filter((n) => n.resourceType === 'Port')
              .sort(comparePorts);
            return { splitter, ports };
          }),
        );
        if (!cancelled) {
          setGroups(results);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctoNode.id]);

  return { groups, loading };
}
