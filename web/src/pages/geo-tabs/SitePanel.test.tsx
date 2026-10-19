import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SitePanel } from './SitePanel';
import type { GeoSite, GeoSpec, SiteOrigin } from '../../services/geoApi';
import type { GeoProject } from '../../services/geoProjectApi';
import type { SiteDetailState } from '../../hooks/useSiteDetail';

const mocks = vi.hoisted(() => ({
  useSiteDetail: vi.fn(),
  patchJson: vi.fn(),
  postJson: vi.fn(),
  fetchGeonetCandidates: vi.fn(),
  fetchGeonetDetail: vi.fn(),
}));

vi.mock('../../hooks/useSiteDetail', () => ({ useSiteDetail: mocks.useSiteDetail }));

vi.mock('../../services/geoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geoApi')>();
  return { ...actual, patchJson: mocks.patchJson, postJson: mocks.postJson };
});

vi.mock('../../services/geonetAddressApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geonetAddressApi')>();
  return {
    ...actual,
    fetchGeonetCandidates: mocks.fetchGeonetCandidates,
    fetchGeonetDetail: mocks.fetchGeonetDetail,
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

const spec = (overrides: Partial<GeoSpec> = {}): GeoSpec => ({
  '@type': 'GeographicSiteSpecification',
  id: 'spec-pi',
  href: '/spec/spec-pi',
  name: 'Installation Point',
  code: 'INSTALLATION_POINT',
  category: 'Site',
  siteRole: 'service',
  lifecycleStatus: 'Active',
  allowedParentSpecIds: [],
  allowedChildSpecIds: [],
  ...overrides,
});

const site = (overrides: Partial<GeoSite> = {}): GeoSite => ({
  '@type': 'GeographicSite',
  id: 'site-1',
  href: '/site/site-1',
  name: 'CDO Rua Miguel de Frias, 380',
  status: 'Active',
  siteSpecificationId: 'spec-pi',
  siteSpecification: { id: 'spec-pi', '@referredType': 'GeographicSiteSpecification' },
  relatedSite: [],
  relatedParty: [],
  characteristic: [],
  ...overrides,
});

const project = (overrides: Partial<GeoProject> = {}): GeoProject => ({
  id: 'prj-1',
  tenantId: 'default',
  name: 'Expansão Icaraí',
  description: null,
  iconDataUrl: null,
  status: 'planned',
  createdBy: null,
  siteCount: 1,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

const detailState = (overrides: Partial<SiteDetailState> = {}): SiteDetailState => ({
  site: site(),
  address: null,
  location: null,
  origin: null as SiteOrigin | null,
  loading: false,
  error: null,
  reload: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const renderPanel = (
  overrides: Partial<Parameters<typeof SitePanel>[0]> = {},
  detailOverrides: Partial<SiteDetailState> = {},
) => {
  mocks.useSiteDetail.mockReturnValue(detailState(detailOverrides));
  const props = {
    isMobile: false,
    canEdit: true,
    mode: 'view' as const,
    siteId: 'site-1',
    specs: [spec()],
    sites: [site()],
    pickedAddress: null,
    pickingOnMap: false,
    onTogglePickOnMap: vi.fn(),
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onChanged: vi.fn(),
    onOpenResource: vi.fn(),
    ...overrides,
  };
  render(<SitePanel {...props} />);
  return props;
};

vi.mock('../internal-plant/SiteEditorModal', () => ({
  SiteEditorModal: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>editor-fechar</button>
  ),
}));
vi.mock('../../components/inventory/RemoveSiteDialog', () => ({
  RemoveSiteDialog: ({ onRemoved }: { onRemoved: () => void }) => (
    <button onClick={onRemoved}>dialogo-remover</button>
  ),
}));

describe('SitePanel', () => {
  it('modo consulta: mostra nome somente leitura e as 4 abas do painel unificado', () => {
    renderPanel();
    expect(screen.getByText('CDO Rua Miguel de Frias, 380')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do local')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Geral' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sub-locais' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recursos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Histórico' })).toBeInTheDocument();
  });

  it('Editar/Remover aparecem só com canEdit', () => {
    renderPanel({ canEdit: false, onRemoved: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
    cleanup();
    renderPanel({});
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });

  it('Editar abre o modal compartilhado e, ao fechar, recarrega o painel', () => {
    const props = renderPanel({ onRemoved: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByText('editor-fechar'));
    expect(props.onChanged).toHaveBeenCalled();
    expect(screen.queryByText('editor-fechar')).not.toBeInTheDocument();
  });

  it('Remover abre a confirmação e, ao remover, chama onRemoved', () => {
    const onRemoved = vi.fn();
    renderPanel({ onRemoved });
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    fireEvent.click(screen.getByText('dialogo-remover'));
    expect(onRemoved).toHaveBeenCalled();
  });

  it('"Remover do projeto" pede confirmação antes de chamar onRemoveFromProject', async () => {
    const onRemoveFromProject = vi.fn().mockResolvedValue(undefined);
    renderPanel({ project: project(), projectId: 'prj-1', onRemoveFromProject });

    fireEvent.click(screen.getByRole('button', { name: 'Remover do projeto' }));
    expect(screen.getByText('Excluir local')).toBeInTheDocument();
    expect(onRemoveFromProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onRemoveFromProject).toHaveBeenCalledTimes(1));
  });

  it('sem onRemoveFromProject, o botão "Remover do projeto" não aparece', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Remover do projeto' })).not.toBeInTheDocument();
  });

  it('modo criação: botão Criar local fica desabilitado até um candidato Geonet ser escolhido', async () => {
    mocks.fetchGeonetCandidates.mockResolvedValue({
      status: 'ready',
      candidates: [{ addressId: 'geo-1', formattedAddress: 'Rua Teste, 100' }],
    });
    mocks.fetchGeonetDetail.mockResolvedValue({
      status: 'ready',
      address: {
        formattedAddress: 'Rua Teste, 100',
        street: 'Rua Teste',
        streetNr: '100',
        coordinates: [-43.1, -22.9],
        geolocationMethod: 'ENDEREÇO COMPLETO',
      },
    });
    mocks.postJson.mockResolvedValue({ site: site({ id: 'site-novo' }) });

    const onCreated = vi.fn();
    renderPanel({
      mode: 'create',
      siteId: null,
      project: project(),
      projectId: 'prj-1',
      onCreated,
    });

    const createButton = screen.getByRole('button', { name: 'Criar local' });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Buscar endereço no Geonet…'), {
      target: { value: 'Rua Teste' },
    });
    const candidate = await screen.findByText('Rua Teste, 100');
    fireEvent.click(candidate);

    await waitFor(() => expect(screen.getByText(/Selecionado:/)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('ex: CDO Rua Miguel de Frias, 380'), {
      target: { value: 'Novo local de teste' },
    });

    await waitFor(() => expect(createButton).not.toBeDisabled());
    fireEvent.click(createButton);

    await waitFor(() =>
      expect(mocks.postJson).toHaveBeenCalledWith(
        '/v1/geo/projects/prj-1/sites',
        expect.objectContaining({ geonetAddressId: 'geo-1' }),
      ),
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        site: expect.objectContaining({ id: 'site-novo' }),
      }),
    );
  });
});
