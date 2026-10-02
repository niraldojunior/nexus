import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { splitGraphChildren, useInternalResourceGraph } from './useInternalResourceGraph';

const node = (id: string, parentId: string | null, depth: number, resourceType = 'Port') => ({
  '@type': 'ResourceComponentNode' as const,
  id,
  name: id,
  resourceType,
  kind: 'PhysicalResource' as const,
  parentId,
  depth,
});

describe('useInternalResourceGraph', () => {
  it('builds arbitrary containment depth and retains only edges with known endpoints', () => {
    const { result } = renderHook(() =>
      useInternalResourceGraph(
        [node('port-01', 'root', 1), node('splitter', 'root', 1, 'Splitter'), node('input', 'splitter', 2), node('out', 'splitter', 2)],
        [
          { '@type': 'ResourceComponentConnection', fromId: 'out', toId: 'port-01', relationshipType: 'connectedTo' },
          { '@type': 'ResourceComponentConnection', fromId: 'input', toId: 'external', relationshipType: 'connectedTo' },
        ],
      ),
    );

    expect(result.current.rootChildren.map((item) => item.id)).toEqual(['port-01', 'splitter']);
    expect(result.current.nodesById.get('splitter')?.children.map((item) => item.id)).toEqual(['input', 'out']);
    expect(result.current.edges).toEqual([
      { '@type': 'ResourceComponentConnection', fromId: 'out', toId: 'port-01', relationshipType: 'connectedTo' },
    ]);

    const { leaves, containers } = splitGraphChildren(result.current.rootChildren);
    expect(leaves.map((item) => item.id)).toEqual(['port-01']);
    expect(containers.map((item) => item.id)).toEqual(['splitter']);
  });
});
