import { describe, expect, it, vi } from 'vitest';
import { OrganizationsStudioAdapter } from '../src/modules/studio/adapters/organizations-studio-adapter.js';
import type { PartyService } from '../src/modules/party/service.js';

describe('OrganizationsStudioAdapter', () => {
  const mockPartyService = {
    listParties: vi.fn().mockResolvedValue([]),
    createParty: vi.fn().mockImplementation((input) => Promise.resolve({ id: 'p-1', ...input })),
    updateParty: vi.fn().mockImplementation((id, input) => Promise.resolve({ id, ...input })),
  } as unknown as PartyService;

  const adapter = new OrganizationsStudioAdapter(mockPartyService);

  it('declares domain organizations and restoreBaselineOnDiscard false', () => {
    expect(adapter.domain).toBe('organizations');
    expect(adapter.restoreBaselineOnDiscard).toBe(false);
  });

  it('validates required organizations array', async () => {
    const invalid = await adapter.validate({});
    expect(invalid.valid).toBe(false);
    expect(invalid.issues[0]?.code).toBe('ORGANIZATIONS_ARRAY_REQUIRED');

    const valid = await adapter.validate({
      organizations: [{ name: 'Nokia do Brasil', partyType: 'Organization', status: 'active' }],
    });
    expect(valid.valid).toBe(true);
  });

  it('materializes snapshot in upsert-only fashion without deactivating absent items', async () => {
    await adapter.materialize(
      {
        organizations: [{ name: 'Huawei', partyType: 'Organization', status: 'active' }],
      },
      { tenantId: 'tenant-1' },
    );

    expect(mockPartyService.createParty).toHaveBeenCalled();
  });
});
