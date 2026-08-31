import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResourcePorts } from './useResourcePorts';
import type { GeoTreeNode } from '../services/geoTreeApi';

const mocks = vi.hoisted(() => ({ fetchTreeChildren: vi.fn() }));

vi.mock('../services/geoTreeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geoTreeApi')>();
  return { ...actual, fetchTreeChildren: mocks.fetchTreeChildren };
});

const ctoNode: GeoTreeNode = {
  id: 'resource:cto-1',
  refId: 'cto-1',
  kind: 'resource',
  label: 'CDOE-6746',
  resourceType: 'CTO',
  hasChildren: true,
};

function node(id: string, resourceType: string, label = id): GeoTreeNode {
  return { id, refId: id, kind: 'resource', label, resourceType, hasChildren: false };
}

afterEach(() => {
  vi.restoreAllMocks();
  mocks.fetchTreeChildren.mockReset();
});

describe('useResourcePorts', () => {
  it('busca splitters da CTO e portas de cada splitter, ordenando FO.I antes de FO.O.1..N', async () => {
    const splitter = node('resource:splitter-1', 'Splitter', 'CDOE-6746 · Splitter');
    mocks.fetchTreeChildren.mockImplementation(async (nodeId: string) => {
      if (nodeId === ctoNode.id) {
        return { nodes: [splitter, node('resource:rack-1', 'Rack')], total: 2 };
      }
      if (nodeId === splitter.id) {
        return {
          nodes: [
            node('resource:p2', 'Port', 'CDOE-6746 · Splitter · FO.O.2'),
            node('resource:p1', 'Port', 'CDOE-6746 · Splitter · FO.I'),
            node('resource:p3', 'Port', 'CDOE-6746 · Splitter · FO.O.1'),
          ],
          total: 3,
        };
      }
      throw new Error(`unexpected nodeId ${nodeId}`);
    });

    const { result } = renderHook(() => useResourcePorts(ctoNode));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].splitter.id).toBe(splitter.id);
    expect(result.current.groups[0].ports.map((p) => p.label)).toEqual([
      'CDOE-6746 · Splitter · FO.I',
      'CDOE-6746 · Splitter · FO.O.1',
      'CDOE-6746 · Splitter · FO.O.2',
    ]);
  });

  it('devolve grupo vazio e para de carregar quando a CTO não tem splitter', async () => {
    mocks.fetchTreeChildren.mockResolvedValue({ nodes: [], total: 0 });
    const { result } = renderHook(() => useResourcePorts(ctoNode));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
  });

  it('encerra o carregamento mesmo quando a busca falha', async () => {
    mocks.fetchTreeChildren.mockRejectedValue(new Error('falhou'));
    const { result } = renderHook(() => useResourcePorts(ctoNode));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
  });
});
