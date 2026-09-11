import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudioGeoExperience } from './StudioGeoExperience';
import * as studioApi from '../../services/studioApi';
import * as geoApi from '../../services/geoApi';
import * as resourceCatalogApi from '../../services/resourceCatalogApi';
import type { StudioStatus } from '../../services/studioApi';
import type { StudioGeoNode } from '../../services/studioGeoApi';

vi.mock('../../services/studioApi', () => ({
  getStudioStatus: vi.fn(),
  saveStudioDraft: vi.fn(),
}));

vi.mock('../../services/geoApi', () => ({
  listGeoSiteSpecifications: vi.fn(),
}));

vi.mock('../../services/resourceCatalogApi', () => ({
  listResourceTypes: vi.fn(),
}));

const baseNodes: StudioGeoNode[] = [
  {
    id: 'group-1',
    kind: 'GROUP',
    parentNodeId: null,
    label: 'Locais',
    sortOrder: 10,
    active: true,
  },
];

const makeStatus = (nodes: StudioGeoNode[]): StudioStatus => ({
  workspace: {
    '@type': 'StudioWorkspace',
    id: 'ws-geo',
    href: '/v1/studio/studio-geo',
    tenantId: 'tenant-default',
    domain: 'studio-geo',
    updatedAt: '2026-09-05T10:00:00.000Z',
    publishedVersionId: undefined,
    draftVersionId: 'ver-1',
  },
  publishedVersion: undefined,
  draftVersion: {
    '@type': 'StudioVersion',
    id: 'ver-1',
    href: '/v1/studio/studio-geo/versions/ver-1',
    tenantId: 'tenant-default',
    domain: 'studio-geo',
    versionNumber: 1,
    status: 'draft',
    snapshot: { schemaVersion: 2, nodes },
    checksum: 'chk-1',
    createdAt: '2026-09-05T10:00:00.000Z',
    createdBy: 'user-admin',
  },
});

describe('StudioGeoExperience — criação de nó pelo menu flutuante', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(baseNodes));
    vi.mocked(geoApi.listGeoSiteSpecifications).mockResolvedValue([]);
    vi.mocked(resourceCatalogApi.listResourceTypes).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('clique no "+" abre o menu com "Grupo" e "Entidade Visual", sem abrir modal', async () => {
    const user = userEvent.setup();
    render(<StudioGeoExperience canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Incluir nó' }));

    const menu = screen.getByRole('menu', { name: 'Tipo de nó a incluir' });
    expect(within(menu).getByRole('menuitem', { name: 'Grupo' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Entidade Visual' })).toBeInTheDocument();
    expect(screen.queryByText('Novo nó da Hierarquia Visual')).not.toBeInTheDocument();
  });

  it('escolher "Grupo" cria "Novo Grupo", seleciona e mostra a aba Geral no Painel Direito', async () => {
    const user = userEvent.setup();
    render(<StudioGeoExperience canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Incluir nó' }));
    await user.click(screen.getByRole('menuitem', { name: 'Grupo' }));

    expect(screen.getByRole('heading', { name: 'Novo Grupo' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Novo Grupo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Geral' })).toHaveClass('bg-white');
  });

  it('escolher "Entidade Visual" cria "Nova Entidade" com categoria Recurso pré-selecionada', async () => {
    const user = userEvent.setup();
    render(<StudioGeoExperience canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Incluir nó' }));
    await user.click(screen.getByRole('menuitem', { name: 'Entidade Visual' }));

    expect(screen.getByRole('heading', { name: 'Nova Entidade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recurso/ })).toHaveClass('border-app-accent');
  });

  it('materializa o visualConfig padrão de entidades LOCAL e RESOURCE no snapshot capturado', async () => {
    let captureSnapshot: (() => Promise<Record<string, unknown>>) | null = null;
    const resourceWithoutVisualConfig: StudioGeoNode = {
      id: 'netwinPole',
      kind: 'ENTITY',
      parentNodeId: null,
      label: 'Postes',
      sortOrder: 20,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'RESOURCE',
        sourceDomain: 'resource-model',
        sourceType: 'RESOURCE_TYPE',
        sourceId: 'Pole',
      },
    };
    const localWithExplicitVisualConfig: StudioGeoNode = {
      id: 'stations',
      kind: 'ENTITY',
      parentNodeId: null,
      label: 'Estações',
      sortOrder: 10,
      active: true,
      defaultVisible: true,
      entity: {
        category: 'LOCAL',
        sourceDomain: 'location-model',
        sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
        sourceId: 'CO',
      },
      visualConfig: {
        geometryKind: 'POINT',
        iconCode: 'CO',
        scaleBands: {
          le5m: { visible: false, sizePx: 31 },
          le10m: { visible: true, sizePx: 30 },
          le20m: { visible: true, sizePx: 29 },
          le50m: { visible: true, sizePx: 28 },
          le100m: { visible: true, sizePx: 27 },
          le500m: { visible: true, sizePx: 26 },
          le1km: { visible: true, sizePx: 25 },
          gt1km: { visible: true, sizePx: 24 },
        },
      },
    };
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(
      makeStatus([localWithExplicitVisualConfig, resourceWithoutVisualConfig]),
    );

    render(
      <StudioGeoExperience
        canEdit
        isEditing
        onRegisterCaptureInitialSnapshot={(capture) => {
          captureSnapshot = capture;
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Postes')).toBeInTheDocument());
    await waitFor(async () => {
      const current = (await captureSnapshot!()) as { nodes: StudioGeoNode[] };
      expect(current.nodes.some((node) => node.id === 'netwinPole')).toBe(true);
    });

    const captured = (await captureSnapshot!()) as { nodes: StudioGeoNode[] };
    const pole = captured.nodes.find((node) => node.id === 'netwinPole');
    const station = captured.nodes.find((node) => node.id === 'stations');

    expect(pole?.kind).toBe('ENTITY');
    expect(pole?.kind === 'ENTITY' && pole.visualConfig).toMatchObject({
      geometryKind: 'POINT',
      scaleBands: { le50m: { visible: false } },
    });
    expect(station?.kind).toBe('ENTITY');
    expect(station?.kind === 'ENTITY' && station.visualConfig).toMatchObject({
      scaleBands: { le5m: { visible: false, sizePx: 31 } },
    });
  });

  it('clicar num nó já selecionado desmarca e volta ao placeholder de seleção', async () => {
    const user = userEvent.setup();
    render(<StudioGeoExperience canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    const tree = screen.getByRole('tree', { name: 'Hierarquia de Camadas' });
    const node = within(tree).getByText('Locais');
    // A carga inicial já seleciona o primeiro nó do snapshot ("Locais").
    expect(screen.getByRole('heading', { name: 'Locais' })).toBeInTheDocument();

    await user.click(node);
    expect(screen.queryByRole('heading', { name: 'Locais' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Selecione um nó da Hierarquia de Camadas para visualizar ou editar.'),
    ).toBeInTheDocument();
  });

  it('lixeira revelada no hover da linha remove o nó sem exigir seleção prévia', async () => {
    const user = userEvent.setup();
    const twoNodes: StudioGeoNode[] = [
      { id: 'group-1', kind: 'GROUP', parentNodeId: null, label: 'Locais', sortOrder: 10, active: true },
      { id: 'group-2', kind: 'GROUP', parentNodeId: null, label: 'Cobertura', sortOrder: 20, active: true },
    ];
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(twoNodes));
    render(<StudioGeoExperience canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    const tree = screen.getByRole('tree', { name: 'Hierarquia de Camadas' });
    // Duas linhas, cada uma com sua própria lixeira (revelada por CSS no hover; no DOM sempre
    // presente). Remove a de "Cobertura" sem selecioná-la antes.
    const trashButtons = within(tree).getAllByTitle('Remover este nó da hierarquia');
    expect(trashButtons).toHaveLength(2);
    await user.click(trashButtons[1]);

    expect(within(tree).queryByText('Cobertura')).not.toBeInTheDocument();
    expect(within(tree).getByText('Locais')).toBeInTheDocument();
  });

  it('com nada selecionado, criar via "+" usa parentNodeId nulo (nó aparece na raiz)', async () => {
    const user = userEvent.setup();
    render(<StudioGeoExperience canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    const tree = screen.getByRole('tree', { name: 'Hierarquia de Camadas' });
    // Desmarca a seleção inicial (primeiro nó do snapshot) para garantir estado "nada selecionado".
    await user.click(within(tree).getByText('Locais'));
    expect(
      screen.getByText('Selecione um nó da Hierarquia de Camadas para visualizar ou editar.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Incluir nó' }));
    await user.click(screen.getByRole('menuitem', { name: 'Grupo' }));

    // "Novo Grupo" deve estar no mesmo nível de topo que "Locais", não aninhado sob ele.
    expect(within(tree).getByText('Novo Grupo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Novo Grupo' })).toBeInTheDocument();
  });
});
