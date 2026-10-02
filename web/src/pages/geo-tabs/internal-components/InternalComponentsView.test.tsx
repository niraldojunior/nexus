import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalComponentsView } from './InternalComponentsView';

vi.mock('./ResourceContainer', () => ({
  ResourceContainer: ({ node, viewMode }: { node: { id: string }; viewMode?: string }) => (
    <div data-testid={`component-${node.id}`} data-view-mode={viewMode} />
  ),
}));

vi.mock('./ResourceConnectionsLayer', () => ({
  ResourceConnectionsLayer: () => null,
}));

vi.mock('../../../components/ResourceIcon', () => ({
  ResourceIcon: ({ resource }: { resource: { resourceType?: string } }) => (
    <span data-testid={`resource-icon-${resource.resourceType ?? 'unknown'}`} />
  ),
}));

vi.mock('./useInternalGraphGeometry', () => ({
  useInternalGraphGeometry: () => ({
    rects: new Map(),
    contentSize: { width: 320, height: 120 },
  }),
}));

const component = (id: string, parentId: string, resourceType = 'Port') => ({
  '@type': 'ResourceComponentNode' as const,
  id,
  name: id,
  resourceType,
  kind: 'PhysicalResource' as const,
  parentId,
  depth: 1,
});

afterEach(cleanup);

describe('InternalComponentsView', () => {
  it('agrupa folhas raiz em uma região flexível separada dos containers', () => {
    render(
      <InternalComponentsView
        components={[
          component('port-01', 'cdoe'),
          component('port-02', 'cdoe'),
          component('splitter', 'cdoe', 'Splitter'),
          { ...component('splitter-port', 'splitter'), depth: 2 },
        ]}
        connections={[]}
        rootResource={{
          name: 'CDOE-01',
          resourceType: 'CDOE',
          specificationName: 'CDOE 1:8 NC-NC',
          status: 'active',
          componentCount: 3,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Detalhada' }));

    const leaves = screen.getByTestId('root-component-leaves');
    const containers = screen.getByTestId('root-component-containers');

    expect(screen.getByText('CDOE-01')).toBeInTheDocument();
    expect(screen.getByTestId('resource-icon-CDOE')).toBeInTheDocument();
    expect(screen.getByText('CDOE 1:8 NC-NC')).toBeInTheDocument();
    expect(screen.queryByText('CDOE · 3 componentes')).not.toBeInTheDocument();
    const root = screen.getByText('CDOE-01').closest('section');
    expect(root).toHaveClass('bg-[var(--surface-muted-hover)]', 'border-[var(--border-strong)]');
    expect(root?.querySelector('[class*="bg-[var(--surface-subtle)]"]')).not.toBeNull();
    expect(root?.querySelector('.bg-status-green')).not.toBeNull();
    const contentArea = root?.querySelector('.bg-white');
    expect(contentArea).not.toBeNull();
    expect(contentArea).not.toHaveStyle({ height: '120px' });
    expect(leaves).toHaveClass('flex', 'flex-wrap');
    expect(leaves).toContainElement(screen.getByTestId('component-port-01'));
    expect(leaves).toContainElement(screen.getByTestId('component-port-02'));
    expect(containers).toHaveClass('grid');
    expect(containers).toContainElement(screen.getByTestId('component-splitter'));
  });

  it('abre por padrão na visão simplificada e repassa o viewMode aos containers', () => {
    render(
      <InternalComponentsView
        components={[component('port-01', 'cdoe'), component('splitter', 'cdoe', 'Splitter')]}
        connections={[]}
        rootResource={{
          name: 'CDOE-01',
          resourceType: 'CDOE',
          specificationName: 'CDOE 1:8 NC-NC',
          status: 'active',
          componentCount: 2,
        }}
      />,
    );

    const simplificada = screen.getByRole('button', { name: 'Simplificada' });
    const detalhada = screen.getByRole('button', { name: 'Detalhada' });
    expect(simplificada).toHaveAttribute('aria-pressed', 'true');
    expect(detalhada).toHaveAttribute('aria-pressed', 'false');
    const header = screen.getByTestId('resource-graph-header');
    expect(header).toHaveAttribute('data-view-mode', 'simplified');
    expect(header.textContent?.replace(/\s+/g, ' ').trim()).toBe('CDOE-01 (CDOE 1:8 NC-NC)');
    expect(screen.getByTestId('component-port-01')).toHaveAttribute('data-view-mode', 'simplified');
    expect(screen.getByTestId('component-splitter')).toHaveAttribute('data-view-mode', 'simplified');

    fireEvent.click(detalhada);

    expect(detalhada).toHaveAttribute('aria-pressed', 'true');
    expect(simplificada).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('CDOE-01')).toBeInTheDocument();
    expect(screen.getByText('CDOE 1:8 NC-NC')).toBeInTheDocument();
    expect(screen.getByTestId('component-port-01')).toHaveAttribute('data-view-mode', 'detailed');
    expect(screen.getByTestId('component-splitter')).toHaveAttribute('data-view-mode', 'detailed');
  });
});
