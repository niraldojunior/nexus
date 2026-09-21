import { describe, expect, it, vi } from 'vitest';
import { PartiesStudioAdapter } from '../src/modules/studio/adapters/parties-studio-adapter.js';
import type { PartyRoleType, PartyRoleTypeRepository } from '../src/modules/party/party-role-type-repository.js';
import type { PartyRoleTypeCharacteristicRepository } from '../src/modules/party/party-role-type-characteristic-repository.js';

function makePartyRoleType(overrides: Partial<PartyRoleType> = {}): PartyRoleType {
  return {
    id: 'role-1',
    tenantId: 'tenant-1',
    key: 'supplier',
    roleName: 'supplier',
    label: 'Fornecedor',
    description: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PartiesStudioAdapter', () => {
  it('declares domain parties and restoreBaselineOnDiscard false', () => {
    const adapter = new PartiesStudioAdapter(
      {} as unknown as PartyRoleTypeRepository,
      {} as unknown as PartyRoleTypeCharacteristicRepository,
    );
    expect(adapter.domain).toBe('parties');
    expect(adapter.restoreBaselineOnDiscard).toBe(false);
  });

  it('validates required partyRoleTypes array and duplicate roleName/key', async () => {
    const adapter = new PartiesStudioAdapter(
      {} as unknown as PartyRoleTypeRepository,
      {} as unknown as PartyRoleTypeCharacteristicRepository,
    );

    const missingArray = await adapter.validate({});
    expect(missingArray.valid).toBe(false);
    expect(missingArray.issues[0]?.code).toBe('PARTIES_TYPES_ARRAY_REQUIRED');

    const duplicated = await adapter.validate({
      partyRoleTypes: [
        { key: 'supplier', roleName: 'supplier', label: 'Fornecedor' },
        { key: 'supplier', roleName: 'supplier', label: 'Fornecedor 2' },
      ],
    });
    expect(duplicated.valid).toBe(false);
    expect(duplicated.issues.map((issue) => issue.code)).toContain('PARTIES_KEY_DUPLICATE');

    const valid = await adapter.validate({
      partyRoleTypes: [{ key: 'supplier', roleName: 'supplier', label: 'Fornecedor' }],
    });
    expect(valid.valid).toBe(true);
  });

  // Item 3 da UX de Papéis: um papel inativado via "Inativar" na UI e publicado deve realmente
  // deixar de ser ativo no catálogo canônico. Antes desta correção, `materialize()` só desativava
  // por AUSÊNCIA no snapshot — um item presente com `active: false` nunca disparava `deactivate()`
  // porque seu id já tinha entrado em `snapshotIds`.
  it('deactivates a role present in the snapshot with active: false', async () => {
    const existingRole = makePartyRoleType({ active: true });
    const partyRoleTypeRepository = {
      list: vi.fn().mockResolvedValue([existingRole]),
      update: vi.fn().mockResolvedValue(existingRole),
      create: vi.fn(),
      reactivate: vi.fn(),
      deactivate: vi.fn().mockResolvedValue({ ...existingRole, active: false }),
    } as unknown as PartyRoleTypeRepository;

    const characteristicRepository = {
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      create: vi.fn(),
      deactivate: vi.fn(),
    } as unknown as PartyRoleTypeCharacteristicRepository;

    const adapter = new PartiesStudioAdapter(partyRoleTypeRepository, characteristicRepository);

    await adapter.materialize(
      {
        partyRoleTypes: [
          {
            id: existingRole.id,
            key: existingRole.key,
            roleName: existingRole.roleName,
            label: existingRole.label,
            active: false,
          },
        ],
      },
      { tenantId: 'tenant-1' },
    );

    expect(partyRoleTypeRepository.deactivate).toHaveBeenCalledWith('tenant-1', existingRole.id);
    // Não deve cair também no caminho de reativação.
    expect(partyRoleTypeRepository.reactivate).not.toHaveBeenCalled();
  });

  it('reactivates a previously inactive role republished as active', async () => {
    const existingRole = makePartyRoleType({ active: false });
    const partyRoleTypeRepository = {
      list: vi.fn().mockResolvedValue([existingRole]),
      update: vi.fn().mockResolvedValue(existingRole),
      create: vi.fn(),
      reactivate: vi.fn().mockResolvedValue({ ...existingRole, active: true }),
      deactivate: vi.fn(),
    } as unknown as PartyRoleTypeRepository;

    const characteristicRepository = {
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      create: vi.fn(),
      deactivate: vi.fn(),
    } as unknown as PartyRoleTypeCharacteristicRepository;

    const adapter = new PartiesStudioAdapter(partyRoleTypeRepository, characteristicRepository);

    await adapter.materialize(
      {
        partyRoleTypes: [
          {
            id: existingRole.id,
            key: existingRole.key,
            roleName: existingRole.roleName,
            label: existingRole.label,
            active: true,
          },
        ],
      },
      { tenantId: 'tenant-1' },
    );

    expect(partyRoleTypeRepository.reactivate).toHaveBeenCalledWith('tenant-1', existingRole.id);
    expect(partyRoleTypeRepository.deactivate).not.toHaveBeenCalled();
  });

  it('deactivates roles absent from the snapshot (existing behavior preserved)', async () => {
    const existingRole = makePartyRoleType({ active: true });
    const partyRoleTypeRepository = {
      list: vi.fn().mockResolvedValue([existingRole]),
      update: vi.fn(),
      create: vi.fn(),
      reactivate: vi.fn(),
      deactivate: vi.fn().mockResolvedValue({ ...existingRole, active: false }),
    } as unknown as PartyRoleTypeRepository;

    const characteristicRepository = {
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      create: vi.fn(),
      deactivate: vi.fn(),
    } as unknown as PartyRoleTypeCharacteristicRepository;

    const adapter = new PartiesStudioAdapter(partyRoleTypeRepository, characteristicRepository);

    await adapter.materialize({ partyRoleTypes: [] }, { tenantId: 'tenant-1' });

    expect(partyRoleTypeRepository.deactivate).toHaveBeenCalledWith('tenant-1', existingRole.id);
  });
});
