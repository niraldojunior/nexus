import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceHistoryTab } from './ResourceHistoryTab';

const mocks = vi.hoisted(() => ({ fetchPhysicalResourceAudit: vi.fn() }));

vi.mock('../../services/resourceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/resourceApi')>();
  return { ...actual, fetchPhysicalResourceAudit: mocks.fetchPhysicalResourceAudit };
});

afterEach(() => {
  cleanup();
  mocks.fetchPhysicalResourceAudit.mockReset();
});

describe('ResourceHistoryTab', () => {
  it('traduz as alterações auditadas e ordena os eventos mais recentes primeiro', async () => {
    mocks.fetchPhysicalResourceAudit.mockResolvedValue([
      {
        '@type': 'ResourceAuditEntry',
        id: 'older',
        tenantId: 'default',
        actorSub: 'operador',
        action: 'transition',
        entityType: 'PhysicalResource',
        entityId: 'cto-1',
        eventTime: '2026-08-01T10:00:00Z',
        before: { administrativeState: 'unlocked' },
        after: { administrativeState: 'locked' },
        traceId: 'trace-1',
      },
      {
        '@type': 'ResourceAuditEntry',
        id: 'newer',
        tenantId: 'default',
        actorSub: 'planejamento',
        action: 'patch',
        entityType: 'PhysicalResource',
        entityId: 'cto-1',
        eventTime: '2026-08-02T10:00:00Z',
        before: { statusCode: 'available' },
        after: { statusCode: 'blocked_risk_area' },
        traceId: 'trace-2',
      },
    ]);

    render(<ResourceHistoryTab resourceId="cto-1" />);

    await waitFor(() => expect(screen.getByText('Estado Granular: available → blocked_risk_area')).toBeInTheDocument());
    expect(screen.getByText('Estado Administrativo: Desbloqueado → Bloqueado')).toBeInTheDocument();
    expect(mocks.fetchPhysicalResourceAudit).toHaveBeenCalledWith('cto-1');
  });

  it('informa quando não existe histórico registrado', async () => {
    mocks.fetchPhysicalResourceAudit.mockResolvedValue([]);
    render(<ResourceHistoryTab resourceId="cto-1" />);

    expect(await screen.findByText('Sem histórico de alterações registrado.')).toBeInTheDocument();
  });
});
