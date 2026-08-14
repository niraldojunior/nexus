import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectSitePanel } from './ProjectSitePanel';
import type { GeoProject, ProjectSite } from '../../services/geoProjectApi';

const mocks = vi.hoisted(() => ({
  removeProjectSite: vi.fn(),
}));

vi.mock('../../services/geoProjectApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geoProjectApi')>();
  return { ...actual, removeProjectSite: mocks.removeProjectSite };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.removeProjectSite.mockReset();
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

const site = (overrides: Partial<ProjectSite> = {}): ProjectSite => ({
  id: 'site:s1',
  kind: 'site',
  label: 'CDO Rua Miguel de Frias, 380',
  refId: 's1',
  referredType: 'GeographicSite',
  status: 'Planned',
  hasChildren: false,
  note: null,
  geonetAddressId: 'geonet-1',
  ...overrides,
});

const renderPanel = (overrides: Partial<Parameters<typeof ProjectSitePanel>[0]> = {}) => {
  const props = {
    isMobile: false,
    projectId: 'prj-1',
    project: project(),
    site: site(),
    specs: [],
    pickedAddress: null,
    pickingOnMap: false,
    onTogglePickOnMap: vi.fn(),
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onSiteChanged: vi.fn(),
    onRemoved: vi.fn(),
    ...overrides,
  };
  render(<ProjectSitePanel {...props} />);
  return props;
};

describe('ProjectSitePanel', () => {
  it('Remover do projeto abre o mesmo modal de confirmação do painel de Projeto', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /remover do projeto/i }));

    expect(screen.getByText('Excluir local')).toBeInTheDocument();
    expect(screen.getByText(/será encerrado/i)).toBeInTheDocument();
    expect(mocks.removeProjectSite).not.toHaveBeenCalled();
  });

  it('confirmar no modal chama removeProjectSite + onRemoved', async () => {
    mocks.removeProjectSite.mockResolvedValue(undefined);
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /remover do projeto/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mocks.removeProjectSite).toHaveBeenCalledWith('prj-1', 's1'));
    await waitFor(() => expect(props.onRemoved).toHaveBeenCalledTimes(1));
  });

  it('cancelar no modal não remove nada e fecha o modal', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /remover do projeto/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Excluir local')).not.toBeInTheDocument();
    expect(mocks.removeProjectSite).not.toHaveBeenCalled();
    expect(props.onRemoved).not.toHaveBeenCalled();
  });
});
