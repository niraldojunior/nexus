import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StudioGovernanceOverview } from './StudioGovernanceOverview';
import * as studioApi from '../services/studioApi';
import type { StudioAuditEntry, StudioStatus, StudioVersion } from '../services/studioApi';

vi.mock('../services/studioApi', () => ({
  getStudioStatus: vi.fn(),
  listStudioAudit: vi.fn(),
}));

const makeVersion = (
  domain: StudioVersion['domain'],
  versionNumber: number,
  status: 'draft' | 'published',
): StudioVersion => ({
  '@type': 'StudioVersion',
  id: `${domain}-ver-${versionNumber}`,
  href: `/v1/studio/${domain}/versions/ver-${versionNumber}`,
  tenantId: 'tenant-default',
  domain,
  versionNumber,
  status,
  snapshot: {},
  checksum: `chk-${domain}-${versionNumber}`,
  createdAt: '2026-09-05T10:00:00.000Z',
  createdBy: 'user-admin',
  publishedAt: status === 'published' ? '2026-09-05T10:00:00.000Z' : undefined,
  publishedBy: status === 'published' ? 'user-admin' : undefined,
});

const makeStatus = (
  domain: StudioVersion['domain'],
  published?: StudioVersion,
  draft?: StudioVersion,
): StudioStatus => ({
  workspace: {
    '@type': 'StudioWorkspace',
    id: `ws-${domain}`,
    href: `/v1/studio/${domain}`,
    tenantId: 'tenant-default',
    domain,
    updatedAt: '2026-09-05T10:00:00.000Z',
    publishedVersionId: published?.id,
    draftVersionId: draft?.id,
  },
  publishedVersion: published,
  draftVersion: draft,
});

const makeAudit = (
  domain: StudioAuditEntry['domain'],
  action: StudioAuditEntry['action'],
): StudioAuditEntry => ({
  '@type': 'StudioAuditEntry',
  id: `audit-${domain}`,
  tenantId: 'tenant-default',
  domain,
  action,
  versionId: `${domain}-ver-1`,
  versionNumber: 1,
  actorSub: 'user-admin',
  eventTime: '2026-09-05T10:00:00.000Z',
});

describe('StudioGovernanceOverview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('resume os oito domínios com o estado de publicação/draft e a última auditoria', async () => {
    vi.mocked(studioApi.getStudioStatus).mockImplementation(async (domain) =>
      domain === 'resource-model'
        ? makeStatus(domain, makeVersion(domain, 2, 'published'))
        : domain === 'parties'
          ? makeStatus(domain, makeVersion(domain, 1, 'published'), makeVersion(domain, 2, 'draft'))
          : makeStatus(domain),
    );
    vi.mocked(studioApi.listStudioAudit).mockImplementation(async (domain) =>
      domain === 'resource-model' ? [makeAudit(domain, 'published')] : [],
    );

    render(<StudioGovernanceOverview />);

    await waitFor(() => {
      expect(screen.getByText('Recursos')).toBeInTheDocument();
    });

    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText('Draft aberto')).toBeInTheDocument();
    expect(screen.getAllByText('Sem versão').length).toBeGreaterThan(0);
    expect(screen.getByText(/Publicado ·/)).toBeInTheDocument();
  });

  it('mostra o erro do domínio sem interromper a listagem dos demais', async () => {
    vi.mocked(studioApi.getStudioStatus).mockImplementation(async (domain) =>
      domain === 'spatial'
        ? Promise.reject(new Error('falha de rede'))
        : makeStatus(domain),
    );
    vi.mocked(studioApi.listStudioAudit).mockResolvedValue([]);

    render(<StudioGovernanceOverview />);

    await waitFor(() => {
      expect(screen.getByText('falha de rede')).toBeInTheDocument();
    });
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });
});
