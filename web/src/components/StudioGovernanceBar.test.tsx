import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { StudioGovernanceBar } from './StudioGovernanceBar';
import * as studioApi from '../services/studioApi';
import type { StudioStatus, StudioValidationResult } from '../services/studioApi';

vi.mock('../services/studioApi', async () => {
  const actual = await vi.importActual<typeof import('../services/studioApi')>(
    '../services/studioApi',
  );
  return {
    ...actual,
    getStudioStatus: vi.fn(),
    validateStudioDraft: vi.fn(),
    publishStudioDraft: vi.fn(),
    discardStudioDraft: vi.fn(),
    saveStudioDraft: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const draftStatus = (overrides: Partial<StudioStatus['draftVersion']> = {}): StudioStatus => ({
  workspace: {
    '@type': 'StudioWorkspace',
    id: 'ws-1',
    href: '/v1/studio/workspace/ws-1',
    tenantId: 'vtal',
    domain: 'spatial',
    updatedAt: '2026-09-04T10:00:00.000Z',
  },
  draftVersion: {
    '@type': 'StudioVersion',
    id: 'draft-1',
    href: '/v1/studio/version/draft-1',
    tenantId: 'vtal',
    domain: 'spatial',
    versionNumber: 1,
    status: 'draft',
    snapshot: { coverages: [] },
    checksum: 'checksum-1',
    createdAt: '2026-09-04T10:00:00.000Z',
    createdBy: 'studio-admin',
    ...overrides,
  },
});

test('disables Publicar when a draft has never been validated', async () => {
  vi.mocked(studioApi.getStudioStatus).mockResolvedValue(draftStatus());

  render(<StudioGovernanceBar domain="spatial" canEdit canAdmin />);

  const publish = await screen.findByRole('button', { name: /publicar/i });
  expect(publish).toBeDisabled();
});

test('shows individual validation issues and keeps Publicar disabled when invalid', async () => {
  vi.mocked(studioApi.getStudioStatus).mockResolvedValue(draftStatus());
  const invalid: StudioValidationResult = {
    valid: false,
    issues: [
      {
        severity: 'error',
        code: 'SPATIAL_COVERAGES_ARRAY_REQUIRED',
        message: 'A lista de coberturas espaciais (coverages) é obrigatória.',
        path: 'coverages',
      },
    ],
    validatedAt: '2026-09-04T10:05:00.000Z',
  };
  vi.mocked(studioApi.validateStudioDraft).mockResolvedValue(invalid);
  vi.mocked(studioApi.getStudioStatus).mockResolvedValueOnce(draftStatus()).mockResolvedValue(
    draftStatus({ validation: invalid }),
  );

  render(<StudioGovernanceBar domain="spatial" canEdit canAdmin />);

  const validate = await screen.findByRole('button', { name: /validar/i });
  await userEvent.click(validate);

  expect(
    await screen.findByText('A lista de coberturas espaciais (coverages) é obrigatória.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /publicar/i })).toBeDisabled();
});

test('enables Publicar once validation reports valid: true', async () => {
  const valid: StudioValidationResult = {
    valid: true,
    issues: [],
    validatedAt: '2026-09-04T10:05:00.000Z',
  };
  vi.mocked(studioApi.getStudioStatus)
    .mockResolvedValueOnce(draftStatus())
    .mockResolvedValue(draftStatus({ validation: valid }));
  vi.mocked(studioApi.validateStudioDraft).mockResolvedValue(valid);

  render(<StudioGovernanceBar domain="spatial" canEdit canAdmin />);

  const validate = await screen.findByRole('button', { name: /validar/i });
  await userEvent.click(validate);

  await waitFor(() =>
    expect(screen.getByRole('button', { name: /publicar/i })).not.toBeDisabled(),
  );
});
