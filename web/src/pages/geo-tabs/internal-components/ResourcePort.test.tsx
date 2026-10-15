import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourcePort } from './ResourcePort';

afterEach(cleanup);

vi.mock('../../../components/ResourceIcon', () => ({
  ResourceIcon: ({ resource, size }: { resource: { resourceType?: string }; size?: number }) => (
    <span data-testid={`resource-icon-${resource.resourceType ?? 'unknown'}`} data-size={size} />
  ),
}));

const port = {
  '@type': 'ResourceComponentNode' as const,
  id: 'port-01',
  name: 'FO.O.1',
  resourceType: 'Port',
  status: 'active',
  kind: 'PhysicalResource' as const,
  parentId: 'cdoe-01',
  depth: 1,
  children: [],
};

describe('ResourcePort', () => {
  it('shows the resource icon with its label beside it in detailed mode', () => {
    render(<ResourcePort node={port} selected={false} onSelect={vi.fn()} />);

    const tile = screen.getByRole('button', { name: 'FO.O.1, Disponível' });
    expect(tile).toHaveClass('bg-status-green-soft', 'border-status-green/60');
    expect(tile).toContainElement(screen.getByTestId('resource-icon-Port'));
    expect(screen.getByTestId('resource-icon-Port')).toHaveAttribute('data-size', '13');
    expect(screen.getByTestId('resource-icon-Port').parentElement).toHaveClass('bg-status-green');
    expect(screen.getByText('FO.O.1')).toHaveClass('break-words');
    expect(tile.parentElement).toHaveClass('items-center', 'gap-1.5');
  });

  it('shrinks to a bordered status tile with no visible label in simplified mode', () => {
    render(<ResourcePort node={port} selected={false} onSelect={vi.fn()} viewMode="simplified" />);

    const tile = screen.getByRole('button', { name: 'FO.O.1, Disponível' });
    expect(tile).toHaveClass('border-app-ink', 'bg-status-green', 'h-[18px]', 'w-[18px]');
    expect(tile).toContainElement(screen.getByTestId('resource-icon-Port'));
    expect(screen.queryByText('FO.O.1')).not.toBeInTheDocument();
  });
});
