import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeoProjectWorkflowStudio } from './GeoProjectWorkflowStudio';
import * as studioApi from '../../../services/studioApi';
import type { StudioStatus } from '../../../services/studioApi';

vi.mock('../../../services/studioApi', () => ({
  getStudioStatus: vi.fn(),
  saveStudioDraft: vi.fn(),
}));

const makeStatus = (snapshot: Record<string, unknown> | undefined): StudioStatus => ({
  workspace: {
    '@type': 'StudioWorkspace',
    id: 'ws-rules-workflows',
    href: '/v1/studio/rules-workflows',
    tenantId: 'tenant-default',
    domain: 'rules-workflows',
    updatedAt: '2026-09-13T10:00:00.000Z',
    publishedVersionId: undefined,
    draftVersionId: snapshot ? 'ver-1' : undefined,
  },
  publishedVersion: undefined,
  draftVersion: snapshot
    ? {
        '@type': 'StudioVersion',
        id: 'ver-1',
        href: '/v1/studio/rules-workflows/versions/ver-1',
        tenantId: 'tenant-default',
        domain: 'rules-workflows',
        versionNumber: 1,
        status: 'draft',
        snapshot,
        checksum: 'chk-1',
        createdAt: '2026-09-13T10:00:00.000Z',
        createdBy: 'user-admin',
      }
    : undefined,
});

describe('GeoProjectWorkflowStudio', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('carrega vazio quando não há draft nem publicação, sem título/descritivo interno banido', async () => {
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(undefined));

    render(<GeoProjectWorkflowStudio canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    expect(await screen.findByText('Nenhum estado configurado neste snapshot.')).toBeInTheDocument();
    expect(screen.queryByText(/Workflow de Projetos \(GeoProject\)/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Estados operacionais, matriz de transições permitidas/),
    ).not.toBeInTheDocument();
  });

  it('expõe abas Estados/Transições acessíveis, com um único painel visível por vez', async () => {
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(undefined));
    const user = userEvent.setup();
    render(<GeoProjectWorkflowStudio canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    const tablist = screen.getByRole('tablist', { name: 'Workflow de Projetos' });
    const statesTab = within(tablist).getByRole('tab', { name: 'Estados' });
    const transitionsTab = within(tablist).getByRole('tab', { name: 'Transições' });

    expect(statesTab).toHaveAttribute('aria-selected', 'true');
    expect(transitionsTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel', { name: 'Estados' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Transições' })).not.toBeInTheDocument();

    await user.click(transitionsTab);

    expect(transitionsTab).toHaveAttribute('aria-selected', 'true');
    expect(statesTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel', { name: 'Transições' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Estados' })).not.toBeInTheDocument();
  });

  it('cria um estado via botão Adicionar e modal, tornando-o o estado inicial automaticamente', async () => {
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(undefined));
    const user = userEvent.setup();
    render(<GeoProjectWorkflowStudio canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const modal = await screen.findByRole('dialog', { name: 'Criar estado de Projeto' });
    await user.type(within(modal).getByLabelText('Nome'), 'Planejado');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    expect(screen.queryByRole('dialog', { name: 'Criar estado de Projeto' })).not.toBeInTheDocument();
    const row = screen.getByText('Planejado').closest('tr');
    expect(row).not.toBeNull();
    const initialRadio = within(row as HTMLElement).getByRole('radio', {
      name: 'Definir Planejado como estado inicial',
    });
    expect(initialRadio).toBeChecked();
    expect(
      screen.queryByText('Selecione um estado inicial antes de publicar.'),
    ).not.toBeInTheDocument();
  });

  it('permite editar um estado inline com lápis/salvar/cancelar', async () => {
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(
      makeStatus({
        schemaVersion: 1,
        workflowId: 'geo-project',
        initialStateCode: 'planned',
        states: [{ code: 'planned', name: 'Planejado', sortOrder: 100, active: true, behavior: 'planning' }],
        transitions: [],
      }),
    );
    const user = userEvent.setup();
    render(<GeoProjectWorkflowStudio canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Editar Planejado' }));
    const nameInput = screen.getByDisplayValue('Planejado');
    await user.clear(nameInput);
    await user.type(nameInput, 'Em planejamento');
    await user.click(screen.getByRole('button', { name: 'Salvar Planejado' }));

    expect(screen.getByText('Em planejamento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar Planejado' })).not.toBeInTheDocument();
  });

  it('limpa o estado inicial quando ele é inativado e exige nova escolha antes de publicar', async () => {
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(
      makeStatus({
        schemaVersion: 1,
        workflowId: 'geo-project',
        initialStateCode: 'planned',
        states: [
          { code: 'planned', name: 'Planejado', sortOrder: 100, active: true, behavior: 'planning' },
          { code: 'execution', name: 'Em execução', sortOrder: 200, active: true, behavior: 'execution' },
        ],
        transitions: [],
      }),
    );
    const user = userEvent.setup();
    render(<GeoProjectWorkflowStudio canEdit isEditing />);
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Editar Planejado' }));
    await user.click(screen.getByLabelText('Estado Planejado ativo'));
    await user.click(screen.getByRole('button', { name: 'Salvar Planejado' }));

    expect(
      await screen.findByText('Selecione um estado inicial antes de publicar.'),
    ).toBeInTheDocument();
    const row = screen.getByText('Planejado').closest('tr');
    const initialRadio = within(row as HTMLElement).getByRole('radio', {
      name: 'Definir Planejado como estado inicial',
    });
    expect(initialRadio).not.toBeChecked();
    expect(initialRadio).toBeDisabled();
  });

  it('captura o snapshot em memória via onRegisterCaptureDraft/onRegisterCaptureInitialSnapshot', async () => {
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(
      makeStatus({
        schemaVersion: 1,
        workflowId: 'geo-project',
        initialStateCode: 'planned',
        states: [{ code: 'planned', name: 'Planejado', sortOrder: 100, active: true, behavior: 'planning' }],
        transitions: [],
      }),
    );
    let captureInitial: (() => Promise<Record<string, unknown>>) | null = null;
    render(
      <GeoProjectWorkflowStudio
        canEdit
        isEditing
        onRegisterCaptureInitialSnapshot={(fn) => {
          captureInitial = fn;
        }}
      />,
    );
    await waitFor(() => expect(studioApi.getStudioStatus).toHaveBeenCalled());
    await waitFor(() => expect(captureInitial).not.toBeNull());

    const snapshot = await captureInitial!();
    expect(snapshot).toMatchObject({
      workflowId: 'geo-project',
      initialStateCode: 'planned',
      states: [{ code: 'planned', name: 'Planejado' }],
    });
  });
});
