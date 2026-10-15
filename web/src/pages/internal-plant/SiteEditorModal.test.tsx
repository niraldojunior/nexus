import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteEditorModal } from './SiteEditorModal';
import type { GeoSpec } from '../../services/geoApi';

const mockSpecs: GeoSpec[] = [
  {
    '@type': 'GeographicSiteSpecification',
    id: 'spec-co',
    href: '/v1/geo/site-specifications/spec-co',
    code: 'CENTRAL_OFFICE',
    name: 'Estação Central',
    category: 'Site',
    siteRole: 'network',
    lifecycleStatus: 'Active',
    allowedParentSpecIds: [],
    allowedChildSpecIds: [],
    visualIdentity: { kind: 'system', iconCode: 'CENTRAL_OFFICE' },
  },
  {
    '@type': 'GeographicSiteSpecification',
    id: 'spec-dc',
    href: '/v1/geo/site-specifications/spec-dc',
    code: 'DATA_CENTER',
    name: 'Data Center',
    category: 'Site',
    siteRole: 'network',
    lifecycleStatus: 'Active',
    allowedParentSpecIds: [],
    allowedChildSpecIds: [],
  },
];

vi.mock('../../services/geoApi', () => ({
  listGeoSiteSpecifications: vi.fn(async () => mockSpecs),
}));

vi.mock('../../services/partyApi', () => ({
  listParties: vi.fn(async () => []),
}));

vi.mock('../../services/siteEditorApi', () => ({
  loadAdministrativeCities: vi.fn(async () => [
    {
      id: 'city-1',
      countryCode: 'BR',
      stateCode: 'RJ',
      cityName: 'Niterói',
      ibgeCode: '3303302',
    },
  ]),
  fetchSiteEditor: vi.fn(async (id: string) => ({
    site: {
      id,
      name: 'Estação Icaraí',
      siteSpecificationId: 'spec-co',
      status: 'Planned',
      note: '',
      characteristic: [],
      relatedParty: [],
    },
    address: {
      id: 'addr-1',
      street: 'Rua Miguel de Frias',
      streetNr: '100',
      postcode: '24220-008',
    },
    administrativeCity: {
      id: 'city-1',
      countryCode: 'BR',
      stateCode: 'RJ',
      cityName: 'Niterói',
      ibgeCode: '3303302',
    },
  })),
  saveSiteEditor: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SiteEditorModal', () => {
  it('exibe apenas o tipo do local no canto superior esquerdo com estilo de título destacado e ícone aumentado', async () => {
    render(<SiteEditorModal siteId="site-1" onClose={vi.fn()} onChanged={vi.fn()} />);

    // Aguarda carregar dados do editor
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Local' });
    expect(nav).toBeInTheDocument();

    // Box do ícone com destaque visual aumentado (size-11 / 44px)
    const iconContainer = nav.querySelector('span.size-11');
    expect(iconContainer).not.toBeNull();

    // No nav (canto superior esquerdo), deve exibir apenas o tipo "Estação Central"
    const typeLabel = nav.querySelector('span.font-semibold.text-app-text');
    expect(typeLabel).not.toBeNull();
    expect(typeLabel?.textContent).toBe('Estação Central');
    expect(typeLabel).toHaveClass('truncate', 'text-[1.15rem]', 'font-semibold', 'text-app-text');

    // O nome do local ("Estação Icaraí") NÃO deve aparecer dentro do nav lateral
    expect(nav.textContent).not.toContain('Estação Icaraí');
    expect(nav.textContent).not.toContain('Novo local');

    // O nome do local deve aparecer no cabeçalho principal do modal
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Estação Icaraí');
  });

  it('atualiza dinamicamente o tipo e ícone ao selecionar outra especificação no modo de criação', async () => {
    const user = userEvent.setup();
    render(<SiteEditorModal onClose={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Local' });
    expect(nav.querySelector('span.font-semibold.text-app-text')?.textContent).toBe('Sem tipo');

    // Altera a especificação no select de tipo
    const specSelect = screen.getByLabelText(/Tipo de local/i);
    await user.selectOptions(specSelect, 'spec-dc');

    // O rótulo no nav deve atualizar imediatamente para "Data Center"
    expect(nav.querySelector('span.font-semibold.text-app-text')?.textContent).toBe('Data Center');
  });
});
