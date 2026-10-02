import { useMemo } from 'react';
import type { ResourceComponentConnection, ResourceComponentNode } from '../../../services/resourceApi';
import { dedupeComponentConnections } from '../../../utils/resourceConnections';

export type InternalGraphNode = ResourceComponentNode & { children: InternalGraphNode[] };

export function splitGraphChildren(children: InternalGraphNode[]) {
  return {
    leaves: children.filter((node) => node.children.length === 0),
    containers: children.filter((node) => node.children.length > 0),
  };
}

function portIndex(node: InternalGraphNode): number | undefined {
  return node.portInfo?.index;
}

function compareNodes(left: InternalGraphNode, right: InternalGraphNode): number {
  const leftPortIndex = portIndex(left);
  const rightPortIndex = portIndex(right);
  if (leftPortIndex !== undefined && rightPortIndex !== undefined) return leftPortIndex - rightPortIndex;
  if (left.portInfo?.role === 'FO.I' && right.portInfo?.role !== 'FO.I') return -1;
  if (right.portInfo?.role === 'FO.I' && left.portInfo?.role !== 'FO.I') return 1;
  return left.name.localeCompare(right.name, 'pt-BR', { numeric: true });
}

export function useInternalResourceGraph(
  components: ResourceComponentNode[],
  connections: ResourceComponentConnection[],
): { rootChildren: InternalGraphNode[]; nodesById: Map<string, InternalGraphNode>; edges: ResourceComponentConnection[] } {
  return useMemo(() => {
    const nodesById = new Map<string, InternalGraphNode>();
    for (const component of components) nodesById.set(component.id, { ...component, children: [] });

    const rootChildren: InternalGraphNode[] = [];
    for (const node of nodesById.values()) {
      const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else rootChildren.push(node);
    }
    for (const node of nodesById.values()) node.children.sort(compareNodes);
    rootChildren.sort(compareNodes);

    const edges = dedupeComponentConnections(connections).filter(
      (connection) => nodesById.has(connection.fromId) && nodesById.has(connection.toId),
    );
    return { rootChildren, nodesById, edges };
  }, [components, connections]);
}
