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

describe('SitePanel', () => {
  it('modo consulta: mostra nome editável e as 4 abas do painel unificado', () => {
    renderPanel();
    expect(screen.getByLabelText('Nome do local')).toHaveValue('CDO Rua Miguel de Frias, 380');
    expect(screen.getByRole('button', { name: 'Visão Geral' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sub-locais' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recursos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
  });

  it('editar o nome e perder o foco grava via PATCH /v1/geo/sites/:id', async () => {
    mocks.patchJson.mockResolvedValue({});
    renderPanel();
    const nameInput = screen.getByLabelText('Nome do local');
    fireEvent.change(nameInput, { target: { value: 'Novo nome do local' } });
    fireEvent.blur(nameInput);

    await waitFor(() =>
      expect(mocks.patchJson).toHaveBeenCalledWith('/v1/geo/sites/site-1', {
        name: 'Novo nome do local',
      }),
    );
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

  it('Status fica travado (somente leitura) enquanto o projeto de origem está em curso', () => {
    renderPanel(
      { project: project({ status: 'active' }), projectId: 'prj-1' },
      { origin: { kind: 'project', projectId: 'prj-1', projectName: 'Expansão Icaraí' } },
    );
    expect(screen.getByText(/herdado do projeto Expansão Icaraí/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Status do local')).not.toBeInTheDocument();
  });

  it('Status é editável quando o site não pertence a um projeto em curso', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('Editar Status'));
    expect(screen.getByLabelText('Status do local')).toBeInTheDocument();
  });

  // Regressão: o combo de tipo do cabeçalho oferecia sempre a lista fixa de tipos
  // category:'Site' (CO/POP/Cabinet/Ponto de Instalação…), mesmo ao visualizar um
  // sub-local (categoria SubSite) — que nunca está nessa lista. Um sub-local só pode
  // trocar entre os tipos que a spec do PAI aceita como filho.
  it('sub-local: combo de tipo oferece só os tipos aceitos pelo pai, não a lista fixa de Site', () => {
    const co = spec({
      id: 'spec-co',
      name: 'Central Office',
      code: 'CO',
      category: 'Site',
      allowedChildSpecIds: ['spec-room'],
    });
    const room = spec({
      id: 'spec-room',
      name: 'Room',
      code: 'ROOM',
      category: 'SubSite',
      allowedParentSpecIds: ['spec-co'],
    });
    const installationPoint = spec({ id: 'spec-pi', code: 'INSTALLATION_POINT' });
    const coSite = site({ id: 'co-1', name: 'Icaraí (ICI)', siteSpecificationId: 'spec-co' });
    const roomSite = site({
      id: 'room-1',
      name: 'Sala 1',
      siteSpecificationId: 'spec-room',
      parentSite: { id: 'co-1', '@referredType': 'GeographicSite' },
    });

    renderPanel(
      { siteId: 'room-1', specs: [co, room, installationPoint], sites: [coSite, roomSite] },
      { site: roomSite },
    );

    const combo = screen.getByLabelText('Tipo de local') as HTMLSelectElement;
    const optionLabels = Array.from(combo.options).map((option) => option.text);
    expect(optionLabels).toEqual(['Sala']);
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
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ site: expect.objectContaining({ id: 'site-novo' }) }));
  });
});
