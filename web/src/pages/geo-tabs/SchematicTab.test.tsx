import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { GeoSchematicPath } from '../../services/geoTreeApi';
import type {
  ResourceSchematicStatus,
  UseResourceSchematicResult,
} from '../../hooks/useResourceSchematic';

const useResourceSchematic = vi.fn<() => UseResourceSchematicResult>();

vi.mock('../../hooks/useResourceSchematic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useResourceSchematic')>();
  return { ...actual, useResourceSchematic: () => useResourceSchematic() };
});

const { SchematicTab } = await import('./SchematicTab');

const equipmentNode = (
  id: string,
  label: string,
  resourceType: string,
  status: string,
  line: [number, number][],
): GeoTreeNode => ({
  id: `resource:${id}`,
  kind: 'resource',
  label,
  resourceType,
  status,
  hasChildren: false,
  geometry: line.length ? { type: 'LineString', coordinates: line } : { type: 'Point', coordinates: line[0] ?? [0, 0] },
});

const cableNode = (id: string, label: string, line: [number, number][]): GeoTreeNode => ({
  id: `resource:${id}`,
  kind: 'resource',
  label,
  resourceType: 'DistributionCable',
  status: 'active',
  hasChildren: false,
  geometry: { type: 'LineString', coordinates: line },
});

const siteNode = (id: string, label: string): GeoTreeNode => ({
  id: `site:${id}`,
  kind: 'site',
  label,
  status: 'active',
  hasChildren: false,
});

const state = (
  status: ResourceSchematicStatus,
  path: GeoSchematicPath | null,
  error: string | null = null,
): UseResourceSchematicResult => ({ status, path, error });

beforeEach(() => {
  useResourceSchematic.mockReset();
});

afterEach(cleanup);

describe('SchematicTab', () => {
  it('lista os saltos numerados, do equipamento até a Estação', () => {
    const path: GeoSchematicPath = {
      nodeId: 'resource:cdoe-1',
      reachedSite: true,
      truncated: false,
      hops: [
        {
          index: 1,
          role: 'equipment',
          node: equipmentNode('cdoe-1', 'CDOE-7539', 'CTO', 'active', [[-43.1, -22.9]]),
        },
        {
          index: 2,
          role: 'cable',
          node: cableNode('cable-1', 'Cabo 1', [
            [-43.1, -22.9],
            [-43.101, -22.901],
          ]),
          spans: { types: ['AerialSpan'], count: 2 },
        },
        {
          index: 3,
          role: 'equipment',
          node: equipmentNode('ceo-1', 'CEO-1', 'SpliceClosure', 'active', [[-43.101, -22.901]]),
        },
        { index: 4, role: 'site', node: siteNode('estacao-1', 'Estação Icaraí') },
      ],
    };
    useResourceSchematic.mockReturnValue(state('ready', path));

    render(<SchematicTab nodeId="resource:cdoe-1" onSimulate={vi.fn()} onPreview={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('CDOE-7539');
    expect(items[3]).toHaveTextContent('Estação Icaraí');
    // Detalhe do lance aparece na linha do cabo, não como salto próprio.
    expect(items[1]).toHaveTextContent('2 lances');
    // Extensão do próprio cabo (não a soma dos lances) — ~140 m entre os dois pontos.
    expect(items[1]).toHaveTextContent(/1\d\d m/);
  });

  it('mostra o tipo de Local (não o fallback de recurso) e o mesmo ícone do mapa no salto da Estação', () => {
    const path: GeoSchematicPath = {
      nodeId: 'resource:cdoe-5',
      reachedSite: true,
      truncated: false,
      hops: [
        {
          index: 1,
          role: 'equipment',
          node: equipmentNode('cdoe-5', 'CDOE-5', 'CTO', 'active', [[-43.1, -22.9]]),
        },
        { index: 2, role: 'site', node: siteNode('estacao-3', 'Estação Icaraí (ICI)') },
      ],
    };
    useResourceSchematic.mockReturnValue(state('ready', path));

    render(<SchematicTab nodeId="resource:cdoe-5" onSimulate={vi.fn()} onPreview={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    // Não deve cair no fallback de tipo de recurso ("Outro") por faltar resourceType.
    expect(items[1]).not.toHaveTextContent('Outro');
  });

  it('clicar num salto pede o preview (balão) daquele item no mapa', async () => {
    const cdoeNode = equipmentNode('cdoe-6', 'CDOE-6', 'CTO', 'active', [[-43.1, -22.9]]);
    const path: GeoSchematicPath = {
      nodeId: 'resource:cdoe-6',
      reachedSite: true,
      truncated: false,
      hops: [
        { index: 1, role: 'equipment', node: cdoeNode },
        { index: 2, role: 'site', node: siteNode('estacao-4', 'Estação') },
      ],
    };
    useResourceSchematic.mockReturnValue(state('ready', path));
    const onPreview = vi.fn();

    render(<SchematicTab nodeId="resource:cdoe-6" onSimulate={vi.fn()} onPreview={onPreview} />);

    await userEvent.click(screen.getByRole('button', { name: /CDOE-6/ }));
    expect(onPreview).toHaveBeenCalledWith(cdoeNode);
  });

  it('avisa quando a cadeia não chegou a uma Estação', () => {
    const path: GeoSchematicPath = {
      nodeId: 'resource:cdoe-2',
      reachedSite: false,
      truncated: false,
      hops: [
        {
          index: 1,
          role: 'equipment',
          node: equipmentNode('cdoe-2', 'CDOE-2', 'CTO', 'active', [[-43.1, -22.9]]),
        },
      ],
    };
    useResourceSchematic.mockReturnValue(state('ready', path));

    render(<SchematicTab nodeId="resource:cdoe-2" onSimulate={vi.fn()} onPreview={vi.fn()} />);

    expect(screen.getByText(/não chegou a uma Estação/)).toBeInTheDocument();
  });

  it('devolve a simulação com o traçado costurado dos cabos, na ordem dos saltos', async () => {
    const path: GeoSchematicPath = {
      nodeId: 'resource:cdoe-3',
      reachedSite: true,
      truncated: false,
      hops: [
        {
          index: 1,
          role: 'equipment',
          node: equipmentNode('cdoe-3', 'CDOE-3', 'CTO', 'active', [[-43.1, -22.9]]),
        },
        {
          index: 2,
          role: 'cable',
          node: cableNode('cable-2', 'Cabo 2', [
            [-43.1, -22.9],
            [-43.101, -22.901],
          ]),
        },
        {
          index: 3,
          role: 'cable',
          node: cableNode('cable-3', 'Cabo 3', [
            [-43.102, -22.902],
            [-43.101, -22.901],
          ]),
        },
        { index: 4, role: 'site', node: siteNode('estacao-2', 'Estação') },
      ],
    };
    useResourceSchematic.mockReturnValue(state('ready', path));
    const onSimulate = vi.fn();

    render(<SchematicTab nodeId="resource:cdoe-3" onSimulate={onSimulate} onPreview={vi.fn()} />);

    await waitFor(() => expect(onSimulate).toHaveBeenCalled());
    const calls = onSimulate.mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.path).toEqual([
      [-43.1, -22.9],
      [-43.101, -22.901],
      [-43.102, -22.902],
    ]);
    expect(call.approximate).toBe(false);
  });

  it('mostra o estado vazio quando o recurso não tem caminho a montante', () => {
    useResourceSchematic.mockReturnValue(
      state('ready', { nodeId: 'resource:x', reachedSite: false, truncated: false, hops: [] }),
    );
    render(<SchematicTab nodeId="resource:x" onSimulate={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByText(/não tem caminho a montante/)).toBeInTheDocument();
  });

  it('apaga o traçado do mapa ao se desmontar', () => {
    const path: GeoSchematicPath = {
      nodeId: 'resource:cdoe-4',
      reachedSite: true,
      truncated: false,
      hops: [
        {
          index: 1,
          role: 'equipment',
          node: equipmentNode('cdoe-4', 'CDOE-4', 'CTO', 'active', [[-43.1, -22.9]]),
        },
      ],
    };
    useResourceSchematic.mockReturnValue(state('ready', path));
    const onSimulate = vi.fn();
    const { unmount } = render(<SchematicTab nodeId="resource:cdoe-4" onSimulate={onSimulate} onPreview={vi.fn()} />);
    unmount();
    expect(onSimulate).toHaveBeenCalledWith(null);
  });
});
