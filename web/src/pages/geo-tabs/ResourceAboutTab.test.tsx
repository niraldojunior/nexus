import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceAboutTab } from './ResourceAboutTab';
import type { PhysicalResourceDetail } from '../../services/resourceApi';

const mocks = vi.hoisted(() => ({
  getResourceTypeCatalogContext: vi.fn(),
}));

vi.mock('../../services/resourceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/resourceApi')>();
  return {
    ...actual,
    getResourceTypeCatalogContext: mocks.getResourceTypeCatalogContext,
  };
});

const CATALOG_CONTEXT = {
  resourceType: { id: 'type-cto', code: 'CTO', name: 'CTO' },
  catalogPaths: [
    {
      catalog: { id: 'catalog-1', code: 'default', name: 'Catálogo padrão' },
      nodes: [{ id: 'node-1', code: 'CTO', name: 'CTO', kind: 'RESOURCE_TYPE' as const }],
    },
  ],
};

beforeEach(() => {
  mocks.getResourceTypeCatalogContext.mockResolvedValue(CATALOG_CONTEXT);
});

afterEach(() => {
  cleanup();
  mocks.getResourceTypeCatalogContext.mockReset();
});

const detail = (overrides: Partial<PhysicalResourceDetail> = {}): PhysicalResourceDetail => ({
  '@type': 'PhysicalResourceDetail',
  resource: {
    '@type': 'PhysicalResource',
    id: 'cto-1',
    name: 'CDOE-6746',
    resourceSpecificationId: 'spec-cto',
    resourceType: 'CTO',
    status: 'active',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
    characteristic: [{ name: '_origin.system', value: 'Netwin', group: '_origin' }],
  },
  specification: {
    '@type': 'ResourceSpecification',
    id: 'spec-cto',
    name: 'CTO 8 portas',
    category: 'Outside Plant',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceTypeName: 'CTO',
    resourceSpecificationCharacteristic: [{ name: 'ports', value: 8 }],
    relatedParty: [],
  },
  childCount: 8,
  ...overrides,
});

describe('ResourceAboutTab', () => {
  it('mostra as características de nível especificação, somente leitura', () => {
    render(<ResourceAboutTab detail={detail()} canEdit={true} onPatch={vi.fn()} />);

    expect(screen.getByText('CTO 8 portas')).toBeInTheDocument();
    expect(screen.getByText('ports')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    // Nível especificação nunca ganha alvo de edição aqui — quem edita é o Studio.
    expect(screen.queryByLabelText('Editar ports')).not.toBeInTheDocument();
  });

  it('exibe e edita características de instância preservando _origin e notes (issue #273)', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    mocks.getResourceTypeCatalogContext.mockResolvedValueOnce({
      ...CATALOG_CONTEXT,
      resourceType: {
        ...CATALOG_CONTEXT.resourceType,
        resourceTypeCharacteristic: [
          { name: 'ports', valueType: 'integer', characteristicLevel: 'specification' },
          {
            name: 'mac_address',
            valueType: 'string',
            characteristicLevel: 'instance',
            value: '00:00:00:00:00:00',
          },
        ],
      },
    });

    render(
      <ResourceAboutTab
        detail={detail({
          resource: {
            ...detail().resource,
            characteristic: [
              { name: '_origin.system', value: 'Netwin', group: '_origin' },
              { name: 'notes', value: 'observação existente' },
              { name: 'mac_address', value: '00:11:22:33:44:55' },
            ],
          },
        })}
        canEdit={true}
        onPatch={onPatch}
      />,
    );

    expect(screen.getByText('CTO 8 portas')).toBeInTheDocument();
    expect(await screen.findByText('Deste recurso')).toBeInTheDocument();
    expect(screen.getByText('mac_address')).toBeInTheDocument();
    expect(screen.getByText('00:11:22:33:44:55')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Editar mac_address'));
    const input = screen.getByLabelText('mac_address');
    fireEvent.change(input, { target: { value: 'AA:BB:CC:DD:EE:FF' } });
    fireEvent.blur(input);

    // O PATCH deve conter o array completo (incluindo _origin e notes) — nunca um array parcial.
    expect(onPatch).toHaveBeenCalledWith({
      characteristic: [
        { name: '_origin.system', value: 'Netwin', group: '_origin' },
        { name: 'notes', value: 'observação existente' },
        { name: 'mac_address', value: 'AA:BB:CC:DD:EE:FF', valueType: 'string' },
      ],
    });
  });

  it('em modo somente leitura (canEdit=false), exibe valor de instância sem botão de edição', async () => {
    mocks.getResourceTypeCatalogContext.mockResolvedValueOnce({
      ...CATALOG_CONTEXT,
      resourceType: {
        ...CATALOG_CONTEXT.resourceType,
        resourceTypeCharacteristic: [
          { name: 'mac_address', valueType: 'string', characteristicLevel: 'instance' },
        ],
      },
    });

    render(
      <ResourceAboutTab
        detail={detail({
          resource: {
            ...detail().resource,
            characteristic: [{ name: 'mac_address', value: '00:11:22:33:44:55' }],
          },
        })}
        canEdit={false}
        onPatch={vi.fn()}
      />,
    );

    expect(await screen.findByText('mac_address')).toBeInTheDocument();
    expect(screen.getByText('00:11:22:33:44:55')).toBeInTheDocument();
    expect(screen.queryByLabelText('Editar mac_address')).not.toBeInTheDocument();
  });

  it('oculta o agrupamento de instância quando o tipo não possui características desse nível', async () => {
    mocks.getResourceTypeCatalogContext.mockResolvedValueOnce({
      ...CATALOG_CONTEXT,
      resourceType: {
        ...CATALOG_CONTEXT.resourceType,
        resourceTypeCharacteristic: [
          { name: 'ports', valueType: 'integer', characteristicLevel: 'specification' },
        ],
      },
    });

    render(<ResourceAboutTab detail={detail()} canEdit={true} onPatch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText('Deste recurso')).not.toBeInTheDocument();
    });
  });

  it('sem nenhuma característica em nenhum dos níveis, mostra o estado vazio', () => {
    render(
      <ResourceAboutTab
        detail={detail({
          specification: { ...detail().specification, resourceSpecificationCharacteristic: [] },
        })}
        canEdit={true}
        onPatch={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Este recurso não possui características cadastradas.'),
    ).toBeInTheDocument();
  });
});
