import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteOverviewTab } from './SiteOverviewTab';
import type { GeoSite, GeoSpec } from '../../services/geoApi';

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

const renderTab = (overrides: Partial<Parameters<typeof SiteOverviewTab>[0]> = {}) =>
  render(
    <SiteOverviewTab
      site={site()}
      address={null}
      origin={null}
      sites={[site(), coSite]}
      specById={specById}
      {...overrides}
    />,
  );

describe('SiteOverviewTab (somente leitura)', () => {
  it('não expõe nenhum controle de edição', () => {
    renderTab({ site: site({ parentSite: { id: 'site-co', '@referredType': 'GeographicSite' } }) });
    expect(screen.queryByLabelText('Editar Local Pai')).toBeNull();
    expect(screen.queryByLabelText('Observação do local')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Estação Icaraí Central')).toBeInTheDocument();
  });

  it('mostra a observação e "Sem endereço" como texto', () => {
    renderTab({ site: site({ note: 'nova observação de campo' }) });
    expect(screen.getByText('nova observação de campo')).toBeInTheDocument();
    expect(screen.getByText('Sem endereço')).toBeInTheDocument();
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
    const { rerender } = renderTab({ origin: { kind: 'import', system: 'Netwin' } });
    expect(screen.getByText('Importação Sistema Netwin')).toBeInTheDocument();

    rerender(
      <SiteOverviewTab
        site={site()}
        address={null}
        origin={{ kind: 'project', projectId: 'prj-1', projectName: 'Expansão Icaraí' }}
        sites={[site()]}
        specById={specById}
      />,
    );
    expect(screen.getByText('Projeto Expansão Icaraí')).toBeInTheDocument();

    rerender(
      <SiteOverviewTab
        site={site()}
        address={null}
        origin={{ kind: 'manual', actorSub: 'niraldo.junior', createdAt: '2026-08-01T00:00:00Z' }}
        sites={[site()]}
        specById={specById}
      />,
    );
    expect(screen.getByText('Cadastro Livre usuário niraldo.junior')).toBeInTheDocument();
  });
});
