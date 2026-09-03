import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteOverviewTab } from './SiteOverviewTab';
import type { GeoAddress, GeoSite, GeoSpec } from '../../services/geoApi';

afterEach(() => {
  cleanup();
});

const spec = (overrides: Partial<GeoSpec> = {}): GeoSpec => ({
  '@type': 'GeographicSiteSpecification',
  id: 'spec-room',
  href: '/spec/spec-room',
  name: 'Room',
  code: 'ROOM',
  category: 'SubSite',
  siteRole: 'network',
  lifecycleStatus: 'Active',
  allowedParentSpecIds: ['spec-co'],
  allowedChildSpecIds: [],
  ...overrides,
});

const coSpec: GeoSpec = {
  '@type': 'GeographicSiteSpecification',
  id: 'spec-co',
  href: '/spec/spec-co',
  name: 'Central Office',
  code: 'CO',
  category: 'Site',
  siteRole: 'network',
  lifecycleStatus: 'Active',
  allowedParentSpecIds: [],
  allowedChildSpecIds: ['spec-room'],
};

const site = (overrides: Partial<GeoSite> = {}): GeoSite => ({
  '@type': 'GeographicSite',
  id: 'site-1',
  href: '/site/site-1',
  name: 'Sala Técnica',
  status: 'Active',
  siteSpecificationId: 'spec-room',
  siteSpecification: { id: 'spec-room', '@referredType': 'GeographicSiteSpecification' },
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
  ...overrides,
});

const coSite: GeoSite = {
  '@type': 'GeographicSite',
  id: 'site-co',
  href: '/site/site-co',
  name: 'Estação Icaraí Central',
  status: 'Active',
  siteSpecificationId: 'spec-co',
  siteSpecification: { id: 'spec-co', '@referredType': 'GeographicSiteSpecification' },
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
};

const specById = new Map([
  ['spec-room', spec()],
  ['spec-co', coSpec],
]);

const renderTab = (overrides: Partial<Parameters<typeof SiteOverviewTab>[0]> = {}) => {
  const props = {
    site: site(),
    canEdit: true,
    address: null as GeoAddress | null,
    origin: null,
    sites: [site(), coSite],
    specById,
    onPatchSite: vi.fn().mockResolvedValue(undefined),
    onEditAddress: vi.fn(),
    ...overrides,
  };
  render(<SiteOverviewTab {...props} />);
  return props;
};

describe('SiteOverviewTab', () => {
  it('Local Pai: clicar num candidato compatível grava parentSiteId via onPatchSite', async () => {
    const props = renderTab();
    fireEvent.click(screen.getByLabelText('Editar Local Pai'));
    fireEvent.change(screen.getByLabelText('Buscar local pai'), {
      target: { value: 'Icaraí' },
    });
    fireEvent.click(await screen.findByText('Estação Icaraí Central'));

    expect(props.onPatchSite).toHaveBeenCalledWith({ parentSiteId: 'site-co' });
  });

  it('Local Pai: digitar sem selecionar um candidato não grava nada', () => {
    const props = renderTab();
    fireEvent.click(screen.getByLabelText('Editar Local Pai'));
    fireEvent.change(screen.getByLabelText('Buscar local pai'), {
      target: { value: 'texto qualquer sem selecionar' },
    });
    fireEvent.keyDown(screen.getByLabelText('Buscar local pai'), { key: 'Escape' });

    expect(props.onPatchSite).not.toHaveBeenCalled();
  });

  it('Endereço mostra a base entre parênteses quando a fonte está preenchida', () => {
    renderTab({
      address: {
        '@type': 'GeographicAddress',
        id: 'addr-1',
        href: '/address/addr-1',
        street: 'Rua Cinco de Julho',
        streetNr: '237',
        city: 'Niterói',
        stateOrProvince: 'RJ',
        postcode: '24220110',
        sourceSystem: 'GEONET',
      },
    });
    expect(
      screen.getByText('Rua Cinco de Julho, 237, Niterói, RJ, 24220110 (geonet)'),
    ).toBeInTheDocument();
  });

  it('Origem mostra as três formas possíveis', () => {
    const { rerender } = render(
      <SiteOverviewTab
        site={site()}
        canEdit
        address={null}
        origin={{ kind: 'import', system: 'Netwin' }}
        sites={[site()]}
        specById={specById}
        onPatchSite={vi.fn()}
        onEditAddress={vi.fn()}
      />,
    );
    expect(screen.getByText('Importação Sistema Netwin')).toBeInTheDocument();

    rerender(
      <SiteOverviewTab
        site={site()}
        canEdit
        address={null}
        origin={{ kind: 'project', projectId: 'prj-1', projectName: 'Expansão Icaraí' }}
        sites={[site()]}
        specById={specById}
        onPatchSite={vi.fn()}
        onEditAddress={vi.fn()}
      />,
    );
    expect(screen.getByText('Projeto Expansão Icaraí')).toBeInTheDocument();

    rerender(
      <SiteOverviewTab
        site={site()}
        canEdit
        address={null}
        origin={{ kind: 'manual', actorSub: 'niraldo.junior', createdAt: '2026-08-01T00:00:00Z' }}
        sites={[site()]}
        specById={specById}
        onPatchSite={vi.fn()}
        onEditAddress={vi.fn()}
      />,
    );
    expect(screen.getByText('Cadastro Livre usuário niraldo.junior')).toBeInTheDocument();
  });

  it('Observação grava no blur, e não a cada tecla', () => {
    const props = renderTab();
    const note = screen.getByLabelText('Observação do local');
    fireEvent.change(note, { target: { value: 'nova observação de campo' } });
    expect(props.onPatchSite).not.toHaveBeenCalled();
    fireEvent.blur(note);
    expect(props.onPatchSite).toHaveBeenCalledWith({ note: 'nova observação de campo' });
  });

  it('clicar em Endereço chama onEditAddress', () => {
    const props = renderTab();
    fireEvent.click(screen.getByText('Sem endereço — clique para adicionar'));
    expect(props.onEditAddress).toHaveBeenCalledTimes(1);
  });
});
