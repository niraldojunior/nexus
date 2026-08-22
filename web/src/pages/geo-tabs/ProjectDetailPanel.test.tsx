import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailPanel } from './ProjectDetailPanel';
import type { GeoProject, ProjectArea } from '../../services/geoProjectApi';
import type { GeoTreeNode } from '../../services/geoTreeApi';

afterEach(() => {
  cleanup();
});

const project = (overrides: Partial<GeoProject> = {}): GeoProject => ({
  id: 'prj-1',
  tenantId: 'default',
  name: 'Expansão Icaraí',
  description: null,
  iconDataUrl: null,
  status: 'planned',
  createdBy: null,
  siteCount: 0,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

const site = (overrides: Partial<GeoTreeNode> = {}): GeoTreeNode => ({
  id: 'site:s1',
  kind: 'site',
  label: 'CDO Rua Miguel de Frias, 380',
  refId: 's1',
  referredType: 'GeographicSite',
  status: 'planned',
  hasChildren: false,
  ...overrides,
});

const area = (overrides: Partial<ProjectArea> = {}): ProjectArea => ({
  id: 'loc-1',
  kind: 'concentration',
  siteCount: 10,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [0, 0],
      ],
    ],
  },
  siteIds: [],
  centroid: [0, 0],
  areaKm2: 1,
  generatedAt: '2026-08-17T00:00:00Z',
  ...overrides,
});

const renderPanel = (overrides: Partial<Parameters<typeof ProjectDetailPanel>[0]> = {}) => {
  const props = {
    isMobile: false,
    project: project(),
    sites: [] as GeoTreeNode[],
    sitesLoading: false,
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    onBack: vi.fn(),
    onAddSite: vi.fn(),
    onOpenSite: vi.fn(),
    onRemoveSite: vi.fn(),
    ...overrides,
  };
  render(<ProjectDetailPanel {...props} />);
  return props;
};

describe('ProjectDetailPanel', () => {
  const openSites = () => fireEvent.click(screen.getByRole('button', { name: 'Locais' }));
  it('perder o foco do título grava via onUpdate, sem botão de salvar', () => {
    const props = renderPanel();
    const titleInput = screen.getByLabelText('Nome do projeto');

    fireEvent.change(titleInput, { target: { value: 'Novo nome do projeto' } });
    fireEvent.blur(titleInput);

    expect(props.onUpdate).toHaveBeenCalledTimes(1);
    expect(props.onUpdate).toHaveBeenCalledWith({ name: 'Novo nome do projeto' });
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('perder o foco sem alterar o título não grava de novo', () => {
    const props = renderPanel();
    const titleInput = screen.getByLabelText('Nome do projeto');
    fireEvent.blur(titleInput);
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('Escape descarta a edição do título sem gravar', () => {
    const props = renderPanel();
    const titleInput = screen.getByLabelText('Nome do projeto') as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: 'rascunho perdido' } });
    fireEvent.keyDown(titleInput, { key: 'Escape' });

    expect(titleInput.value).toBe('Expansão Icaraí');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('perder o foco da descrição grava via onUpdate', () => {
    const props = renderPanel();
    const description = screen.getByLabelText('Descrição do projeto');

    fireEvent.change(description, { target: { value: 'Levantamento de campo do Q3' } });
    fireEvent.blur(description);

    expect(props.onUpdate).toHaveBeenCalledWith({ description: 'Levantamento de campo do Q3' });
  });

  it('menu ⋯ abre e Excluir projeto pede confirmação (com a contagem de locais) antes de chamar onDelete', async () => {
    const props = renderPanel({
      project: project({ siteCount: 3 }),
      onDelete: vi.fn().mockResolvedValue({ deleted: true, retired: 3, skipped: 0, blocked: 0 }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções do projeto' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir projeto' }));

    expect(props.onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByText(/3 locais criados neste projeto serão encerrados/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    await screen.findByRole('button', { name: 'Mais opções do projeto' });
  });

  it('local bloqueado mantém o painel aberto e avisa, em vez de fechar silenciosamente (issue #58)', async () => {
    renderPanel({
      onDelete: vi.fn().mockResolvedValue({ deleted: false, retired: 0, skipped: 0, blocked: 1 }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções do projeto' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir projeto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText(/1 local não pôde ser encerrado/i)).toBeInTheDocument();
  });

  it('Adicionar Local chama onAddSite', () => {
    const props = renderPanel();
    openSites();
    fireEvent.click(screen.getByRole('button', { name: /adicionar local/i }));
    expect(props.onAddSite).toHaveBeenCalledTimes(1);
  });

  it('clicar num local da lista chama onOpenSite com o nó', () => {
    const target = site();
    const props = renderPanel({ sites: [target] });
    openSites();
    fireEvent.click(screen.getByText(target.label));
    expect(props.onOpenSite).toHaveBeenCalledWith(target);
  });

  it('mostra o estado vazio quando o projeto não tem locais', () => {
    renderPanel({ sites: [] });
    openSites();
    expect(screen.getByText(/nenhum local neste projeto ainda/i)).toBeInTheDocument();
  });

  it('trocar o status do projeto grava via onUpdate', () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText('Status do projeto'), {
      target: { value: 'active' },
    });
    expect(props.onUpdate).toHaveBeenCalledWith({ status: 'active' });
  });

  it('mostra aviso quando a cascata de status deixa locais para trás', async () => {
    const props = renderPanel({
      onUpdate: vi.fn().mockResolvedValue({ siteCascade: { updated: 1, skipped: 2 } }),
    });
    fireEvent.change(screen.getByLabelText('Status do projeto'), {
      target: { value: 'planned' },
    });
    expect(props.onUpdate).toHaveBeenCalledWith({ status: 'planned' });
    expect(
      await screen.findByText('2 locais não puderam seguir para o novo status.'),
    ).toBeInTheDocument();
  });

  it('projeto terminado esconde a combo de status (RF-010: não volta)', () => {
    renderPanel({ project: project({ status: 'terminated' }) });
    expect(screen.queryByLabelText('Status do projeto')).not.toBeInTheDocument();
    expect(screen.getByText('Terminado')).toBeInTheDocument();
  });

  it('excluir um local da lista pede confirmação antes de chamar onRemoveSite', () => {
    const target = site();
    const props = renderPanel({ sites: [target] });
    openSites();

    fireEvent.click(screen.getByRole('button', { name: /excluir local/i }));
    expect(props.onRemoveSite).not.toHaveBeenCalled();
    expect(screen.getByText(/será encerrado/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(props.onRemoveSite).toHaveBeenCalledWith(target);
  });

  it('sem manchas, a contagem usa sites.length (comportamento de sempre)', () => {
    renderPanel({ sites: [site(), site({ id: 'site:s2', refId: 's2' })] });
    openSites();
    expect(screen.getByText('2 locais')).toBeInTheDocument();
  });

  it('com manchas geradas (REQ-MOD01-017), a contagem usa project.siteCount e avisa a página parcial', () => {
    renderPanel({
      project: project({ siteCount: 3514 }),
      sites: [site()],
      areas: [area({ kind: 'concentration' }), area({ id: 'loc-2', kind: 'dispersion' })],
    });
    openSites();
    expect(screen.getByText('3514 locais (mostrando 1)')).toBeInTheDocument();
    expect(screen.queryByText('1 concentração · 1 dispersão')).not.toBeInTheDocument();
  });
});
