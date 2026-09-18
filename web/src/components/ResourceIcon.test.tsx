import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceIcon } from './ResourceIcon';
import { resetResourceTypeVisualIdentitiesForTests } from '../hooks/useResourceTypeVisualIdentities';
import * as resourceCatalogApi from '../services/resourceCatalogApi';

vi.mock('../services/resourceCatalogApi', () => ({
  listModeledResourceTypes: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  resetResourceTypeVisualIdentitiesForTests();
  vi.resetAllMocks();
  vi.mocked(resourceCatalogApi.listModeledResourceTypes).mockResolvedValue([]);
});

describe('ResourceIcon', () => {
  it('prioriza a identidade canônica do ResourceType como glifo sem fundo', async () => {
    vi.mocked(resourceCatalogApi.listModeledResourceTypes).mockResolvedValue([
      {
        '@type': 'ResourceType',
        id: 'rt-cto',
        href: '/v1/resource-types/rt-cto',
        code: 'CTO',
        name: 'CTO',
        categoryCode: 'passive',
        status: 'active',
        visualIdentity: { kind: 'system', iconCode: 'Pole' },
      },
    ]);

    const { container } = render(<ResourceIcon resource={{ resourceType: 'CTO' }} size={26} />);

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const image = container.querySelector('img')!;
    expect(image).toHaveStyle({ width: '26px', height: '26px' });
    expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain('M12 2v20');
    expect(container.querySelector('span')).toBeNull();
  });

  it('usa o fallback físico da Modelagem quando o tipo não possui identidade configurada', async () => {
    vi.mocked(resourceCatalogApi.listModeledResourceTypes).mockResolvedValue([
      {
        '@type': 'ResourceType',
        id: 'rt-splitter',
        href: '/v1/resource-types/rt-splitter',
        code: 'Splitter',
        name: 'Splitter',
        categoryCode: 'passive',
        status: 'active',
        nature: 'PhysicalResource',
      },
    ]);

    const { container } = render(<ResourceIcon resource={{ resourceType: 'Splitter' }} size={26} />);

    await waitFor(() => expect(resourceCatalogApi.listModeledResourceTypes).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute(
      'data-resource-type-fallback',
      'physical',
    );
  });

  it('usa o fallback lógico da Modelagem quando o tipo não possui identidade configurada', async () => {
    vi.mocked(resourceCatalogApi.listModeledResourceTypes).mockResolvedValue([
      {
        '@type': 'ResourceType',
        id: 'rt-logical',
        href: '/v1/resource-types/rt-logical',
        code: 'LogicalThing',
        name: 'Logical Thing',
        categoryCode: 'logical',
        status: 'active',
        nature: 'LogicalResource',
      },
    ]);

    const { container } = render(
      <ResourceIcon resource={{ resourceType: 'LogicalThing' }} size={26} />,
    );

    await waitFor(() => expect(resourceCatalogApi.listModeledResourceTypes).toHaveBeenCalled());
    expect(container.querySelector('svg')).toHaveAttribute(
      'data-resource-type-fallback',
      'logical',
    );
  });

  it('preserva a apresentação histórica somente para um tipo não modelado', async () => {
    const { container } = render(<ResourceIcon resource={{ resourceType: 'CTO' }} size={26} />);

    await waitFor(() => expect(resourceCatalogApi.listModeledResourceTypes).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
  });
});
