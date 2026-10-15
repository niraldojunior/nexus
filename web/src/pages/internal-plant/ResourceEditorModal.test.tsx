import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceEditorModal } from './ResourceEditorModal';
import type { ResourceType } from '../../services/resourceApi';

const mockTypes: ResourceType[] = [
  {
    '@type': 'ResourceType',
    id: 'rt-olt',
    href: '/v1/resource-types/rt-olt',
    code: 'OLT',
    name: 'OLT',
    categoryCode: 'active',
    status: 'active',
    nature: 'PhysicalResource',
    visualIdentity: { kind: 'system', iconCode: 'OLT' },
  },
  {
    '@type': 'ResourceType',
    id: 'rt-cto',
    href: '/v1/resource-types/rt-cto',
    code: 'CTO',
    name: 'Caixa de Terminação Óptica',
    categoryCode: 'passive',
    status: 'active',
    nature: 'PhysicalResource',
    visualIdentity: { kind: 'system', iconCode: 'CTO' },
  },
];

vi.mock('../../services/internalPlantApi', () => ({
  fetchResourceEditor: vi.fn(async (id: string) => ({
    resource: {
      id,
      name: 'OLT-ICARAI-01',
      '@type': 'PhysicalResource',
      resourceSpecificationId: 'spec-1',
      characteristic: [],
    },
    resourceType: {
      id: 'rt-olt',
      code: 'OLT',
      name: 'OLT',
      resourceTypeCharacteristic: [],
    },
    specification: {
      id: 'spec-1',
      name: 'Huawei MA5800-X17',
      relatedParty: [
        {
          id: 'manufacturer-1',
          '@referredType': 'Organization',
          role: 'manufacturer',
          name: 'Huawei',
        },
      ],
    },
    components: [],
    relationships: [],
    siteRelationships: [],
    places: [],
  })),
  fetchResourceHistory: vi.fn(async () => []),
  saveResourceAggregate: vi.fn(),
}));

vi.mock('../../services/internalPlantCatalogCache', () => ({
  loadResourceTypesCached: vi.fn(async () => mockTypes),
  loadRelationshipTypesCached: vi.fn(async () => []),
  loadSpecificationsCached: vi.fn(async () => [
    {
      id: 'spec-1',
      name: 'Huawei MA5800-X17',
      resourceTypeId: 'rt-olt',
      relatedParty: [
        {
          id: 'manufacturer-1',
          '@referredType': 'Organization',
          role: 'manufacturer',
          name: 'Huawei',
        },
      ],
    },
    {
      id: 'spec-2',
      name: 'OLT sem fabricante',
      resourceTypeId: 'rt-olt',
      relatedParty: [],
    },
  ]),
  loadSiteSpecificationsCached: vi.fn(async () => []),
  loadDefaultCatalogTree: vi.fn(async () => []),
}));

vi.mock('../../services/resourceApi', () => ({
  listResourceStatusCatalog: vi.fn(async () => []),
  listResourceTypeRelationshipRules: vi.fn(async () => []),
  listResources: vi.fn(async () => []),
}));

vi.mock('../../services/partyApi', () => ({
  listPartyRoles: vi.fn(async () => [
    {
      partyId: 'vendor-1',
      name: 'vendor',
      status: 'active',
      party: { id: 'vendor-1', '@referredType': 'Organization', name: 'Fornecedor Óptico' },
    },
  ]),
}));

vi.mock('../../services/geoApi', () => ({
  listGeoSites: vi.fn(async () => []),
  getGeoSite: vi.fn(async () => undefined),
  getGeoLocation: vi.fn(async () => undefined),
  getGeoAddress: vi.fn(async () => undefined),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResourceEditorModal', () => {
  it('exibe apenas o tipo do recurso no canto superior esquerdo com estilo de título destacado e ícone aumentado', async () => {
    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Recurso' });
    expect(nav).toBeInTheDocument();

    // Box do ícone com destaque visual aumentado (size-11 / 44px)
    const iconContainer = nav.querySelector('span.size-11');
    expect(iconContainer).not.toBeNull();

    // No nav (canto superior esquerdo), aguarda carregar e deve exibir apenas o tipo "OLT"
    await waitFor(() => {
      const typeLabel = nav.querySelector('span.font-semibold.text-app-text');
      expect(typeLabel?.textContent).toBe('OLT');
      expect(typeLabel).toHaveClass('truncate', 'text-[1.15rem]', 'font-semibold', 'text-app-text');
    });

    // O nome do recurso ("OLT-ICARAI-01") NÃO deve aparecer dentro do nav lateral
    expect(nav.textContent).not.toContain('OLT-ICARAI-01');
    expect(nav.textContent).not.toContain('Recurso');
    expect(nav.textContent).not.toContain('Novo recurso');

    // O nome do recurso deve aparecer no cabeçalho principal do modal
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('OLT-ICARAI-01');
  });

  it('organiza a aba Geral sem Part number, preservando a aba Locais', async () => {
    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByLabelText('Número de série')).toBeInTheDocument();
    expect(screen.getByText('Fabricante')).toBeInTheDocument();
    expect(screen.getByText('Huawei')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fornecedor')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Código ERP')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Part number/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Localização e observações')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Locais' })).not.toHaveLength(0);
  });

  it('atualiza o Fabricante conforme a especificação selecionada', async () => {
    render(<ResourceEditorModal resourceId="res-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText('Huawei')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Especificação'), { target: { value: 'spec-2' } });

    expect(screen.getByText('Não informado')).toBeInTheDocument();
    expect(screen.queryByText('Huawei')).not.toBeInTheDocument();
  });

  it('exibe "Sem tipo" no canto superior esquerdo quando nenhum tipo foi selecionado', async () => {
    render(<ResourceEditorModal onClose={vi.fn()} onSaved={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Recurso' });
    expect(nav).toBeInTheDocument();

    const typeLabel = nav.querySelector('span.font-semibold.text-app-text');
    expect(typeLabel?.textContent).toBe('Sem tipo');
    expect(typeLabel).toHaveClass('truncate', 'text-[1.15rem]', 'font-semibold', 'text-app-text');
    expect(nav.textContent).not.toContain('Novo recurso');
  });
});
