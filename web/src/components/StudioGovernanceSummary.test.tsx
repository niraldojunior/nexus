import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudioGovernanceSummary } from './StudioGovernanceSummary';
import * as studioApi from '../services/studioApi';
import type { StudioStatus, StudioValidationResult, StudioVersion } from '../services/studioApi';

vi.mock('../services/studioApi', () => ({
  getStudioStatus: vi.fn(),
  saveStudioDraft: vi.fn(),
  validateStudioDraft: vi.fn(),
  publishStudioDraft: vi.fn(),
  discardStudioDraft: vi.fn(),
}));

const makeVersion = (
  versionNumber: number,
  status: 'draft' | 'published' | 'discarded',
  checksum: string,
  extra: Partial<StudioVersion> = {},
): StudioVersion => ({
  '@type': 'StudioVersion',
  id: `ver-${versionNumber}`,
  href: `/v1/studio/resource-model/versions/ver-${versionNumber}`,
  tenantId: 'tenant-default',
  domain: 'resource-model',
  versionNumber,
  status,
  snapshot: {},
  checksum,
  createdAt: '2026-09-05T10:00:00.000Z',
  createdBy: 'user-admin',
  publishedAt: status === 'published' ? '2026-09-05T10:00:00.000Z' : undefined,
  publishedBy: status === 'published' ? 'user-admin' : undefined,
  ...extra,
});

const makeStatus = (published?: StudioVersion, draft?: StudioVersion): StudioStatus => ({
  workspace: {
    '@type': 'StudioWorkspace',
    id: 'ws-1',
    href: '/v1/studio/resource-model',
    tenantId: 'tenant-default',
    domain: 'resource-model',
    updatedAt: '2026-09-05T10:00:00.000Z',
    publishedVersionId: published?.id,
    draftVersionId: draft?.id,
  },
  publishedVersion: published,
  draftVersion: draft,
});

describe('StudioGovernanceSummary', () => {
  beforeEach(() => {
    // resetAllMocks (não clearAllMocks): precisa também apagar o mockResolvedValue/
    // mockResolvedValueOnce configurado no teste anterior, senão o próximo teste herda a
    // implementação alheia além do histórico de chamadas.
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('exibe a versão publicada e o botão "Editar" quando não há draft', async () => {
    const published = makeVersion(3, 'published', 'chk-pub-3');
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(published, undefined));

    render(<StudioGovernanceSummary domain="resource-model" canEdit={true} canAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText(/v3 publicado/i)).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /editar/i });
    expect(editBtn).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(editBtn);

    expect(studioApi.saveStudioDraft).toHaveBeenCalledWith('resource-model', {});
  });

  it('valida e publica com sucesso em um único clique ao clicar "Publicar"', async () => {
    const published = makeVersion(3, 'published', 'chk-pub-3');
    const draft = makeVersion(4, 'draft', 'chk-draft-4');
    const updatedDraft = makeVersion(4, 'draft', 'chk-draft-4-validated');

    vi.mocked(studioApi.getStudioStatus)
      .mockResolvedValueOnce(makeStatus(published, draft))
      .mockResolvedValueOnce(makeStatus(published, updatedDraft))
      .mockResolvedValueOnce(makeStatus(makeVersion(4, 'published', 'chk-pub-4'), undefined));

    const validResult: StudioValidationResult = {
      valid: true,
      issues: [],
      validatedAt: '2026-09-05T10:05:00.000Z',
    };
    vi.mocked(studioApi.validateStudioDraft).mockResolvedValue(validResult);
    vi.mocked(studioApi.publishStudioDraft).mockResolvedValue(
      makeVersion(4, 'published', 'chk-pub-4'),
    );

    render(<StudioGovernanceSummary domain="resource-model" canEdit={true} canAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText(/draft v4/i)).toBeInTheDocument();
    });

    const publishBtn = screen.getByRole('button', { name: /publicar/i });
    const user = userEvent.setup();
    await user.click(publishBtn);

    expect(studioApi.validateStudioDraft).toHaveBeenCalledWith('resource-model');
    expect(studioApi.publishStudioDraft).toHaveBeenCalledWith(
      'resource-model',
      'chk-draft-4-validated',
    );
  });

  it('exibe modal com os impedimentos quando a validação falha e não chama publish', async () => {
    const draft = makeVersion(4, 'draft', 'chk-draft-4');
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(undefined, draft));

    const invalidResult: StudioValidationResult = {
      valid: false,
      issues: [
        {
          severity: 'error',
          code: 'MISSING_COVERAGES',
          message: 'Pelo menos uma cobertura é obrigatória.',
        },
      ],
      validatedAt: '2026-09-05T10:05:00.000Z',
    };
    vi.mocked(studioApi.validateStudioDraft).mockResolvedValue(invalidResult);

    render(<StudioGovernanceSummary domain="resource-model" canEdit={true} canAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText(/draft v4/i)).toBeInTheDocument();
    });

    const publishBtn = screen.getByRole('button', { name: /publicar/i });
    const user = userEvent.setup();
    await user.click(publishBtn);

    await waitFor(() => {
      expect(screen.getByText(/impedimentos na validação/i)).toBeInTheDocument();
      expect(screen.getByText(/pelo menos uma cobertura é obrigatória\./i)).toBeInTheDocument();
    });

    expect(studioApi.publishStudioDraft).not.toHaveBeenCalled();

    const closeBtn = screen.getByRole('button', { name: /fechar/i });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/impedimentos na validação/i)).not.toBeInTheDocument();
    });
  });

  it('descarta o draft ao clicar em "Cancelar"', async () => {
    const draft = makeVersion(4, 'draft', 'chk-draft-4');
    vi.mocked(studioApi.getStudioStatus)
      .mockResolvedValueOnce(makeStatus(undefined, draft))
      .mockResolvedValueOnce(makeStatus(undefined, undefined));

    vi.mocked(studioApi.discardStudioDraft).mockResolvedValue(
      makeVersion(4, 'discarded', 'chk-draft-4-disc'),
    );

    render(<StudioGovernanceSummary domain="resource-model" canEdit={true} canAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText(/draft v4/i)).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    const user = userEvent.setup();
    await user.click(cancelBtn);

    expect(studioApi.discardStudioDraft).toHaveBeenCalledWith('resource-model', 'chk-draft-4');
  });

  it('não exibe os botões de publicar e cancelar quando canAdmin é falso', async () => {
    const draft = makeVersion(4, 'draft', 'chk-draft-4');
    vi.mocked(studioApi.getStudioStatus).mockResolvedValue(makeStatus(undefined, draft));

    render(<StudioGovernanceSummary domain="resource-model" canEdit={true} canAdmin={false} />);

    await waitFor(() => {
      expect(screen.getByText(/draft v4/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /publicar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });
});
