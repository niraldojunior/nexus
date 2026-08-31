import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResourcePorts } from './useResourcePorts';
import type { GeoTreeNode } from '../services/geoTreeApi';

const mocks = vi.hoisted(() => ({ fetchResourcePorts: vi.fn() }));

vi.mock('../services/resourceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/resourceApi')>();
  return { ...actual, fetchResourcePorts: mocks.fetchResourcePorts };
});

const ctoNode: GeoTreeNode = {
  id: 'resource:cto-1', refId: 'cto-1', kind: 'resource', label: 'CDOE-6746', resourceType: 'CTO', hasChildren: true,
};

const port = (id: string, role: string, index?: number) => ({
  '@type': 'ResourcePortDetail' as const,
  resource: {
    '@type': 'PhysicalResource' as const, id, href: `/resource/${id}`, name: role === 'FO.O' ? `FO.O.${index}` : role,
    resourceSpecificationId: 'spec-port', resourceSpecification: { id: 'spec-port', '@referredType': 'ResourceSpecification' as const },
    resourceType: 'Port', status: 'active' as const, administrativeState: 'unlocked' as const,
    operationalState: 'enabled' as const, usageState: 'idle' as const, characteristic: [],
  },
  role, ...(index !== undefined ? { index } : {}), derivedUsageState: 'idle' as const, hasActiveService: false, drops: [],
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.fetchResourcePorts.mockReset();
});

describe('useResourcePorts', () => {
  it('consome a projeção única da CTO e ordena FO.I antes de FO.O por índice estruturado', async () => {
    mocks.fetchResourcePorts.mockResolvedValue({
      '@type': 'ResourcePortsView', ctoId: 'cto-1', groups: [{
        splitter: { id: 'splitter-1', name: 'CDOE-6746 · Splitter', '@referredType': 'PhysicalResource', resourceType: 'Splitter' },
        ports: [port('p2', 'FO.O', 2), port('p1', 'FO.I'), port('p3', 'FO.O', 1)],
      }],
    });
    const { result } = renderHook(() => useResourcePorts(ctoNode));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocks.fetchResourcePorts).toHaveBeenCalledWith('cto-1');
    expect(result.current.groups[0].ports.map((item) => item.resource.name)).toEqual(['FO.I', 'FO.O.1', 'FO.O.2']);
  });

  it('expõe erro de carregamento sem confundir com estado vazio', async () => {
    mocks.fetchResourcePorts.mockRejectedValue(new Error('falhou'));
    const { result } = renderHook(() => useResourcePorts(ctoNode));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBe('falhou');
  });
});
