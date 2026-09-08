import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';

export type PartyRoleType = {
  id: string;
  tenantId: string;
  key: string;
  roleName: string;
  label: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartyRoleTypeInput = {
  key: string;
  roleName: string;
  label: string;
  description?: string | null;
};

export type UpdatePartyRoleTypeInput = Partial<CreatePartyRoleTypeInput>;

type PartyRoleTypeRow = Omit<PartyRoleType, 'active'> & { active: unknown };

const SELECT_PARTY_ROLE_TYPE = `
  SELECT id, tenant_id AS tenantId, type_key AS "key", role_name AS roleName,
         label, description, CASE WHEN active = 1 THEN 1 ELSE 0 END AS active,
         created_at AS createdAt, updated_at AS updatedAt
    FROM party_role_type`;

const fromRow = (row: PartyRoleTypeRow): PartyRoleType => ({
  ...row,
  active: Number(row.active) === 1,
});

export class PartyRoleTypeRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public async list(tenantId: string, includeInactive = false): Promise<PartyRoleType[]> {
    const rows = await this.db.all<PartyRoleTypeRow>(
      `${SELECT_PARTY_ROLE_TYPE} WHERE tenant_id = ?${includeInactive ? '' : ' AND active = 1'}
       ORDER BY label, type_key`,
      [tenantId],
    );
    return rows.map(fromRow);
  }

  public async get(tenantId: string, id: string): Promise<PartyRoleType | null> {
    const row = await this.db.get<PartyRoleTypeRow>(
      `${SELECT_PARTY_ROLE_TYPE} WHERE tenant_id = ? AND id = ?`,
      [tenantId, id],
    );
    return row ? fromRow(row) : null;
  }

  public async findByKeyOrRoleName(
    tenantId: string,
    key: string,
    roleName: string,
  ): Promise<PartyRoleType | null> {
    const row = await this.db.get<PartyRoleTypeRow>(
      `${SELECT_PARTY_ROLE_TYPE}
        WHERE tenant_id = ? AND (type_key = ? OR role_name = ?)`,
      [tenantId, key, roleName],
    );
    return row ? fromRow(row) : null;
  }

  public async create(tenantId: string, input: CreatePartyRoleTypeInput): Promise<PartyRoleType> {
    const id = createCanonicalId();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO party_role_type
        (id, tenant_id, type_key, role_name, label, description, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenantId, input.key, input.roleName, input.label, input.description ?? null, 1, now, now],
    );
    return (await this.get(tenantId, id))!;
  }

  public async update(
    tenantId: string,
    id: string,
    patch: UpdatePartyRoleTypeInput,
  ): Promise<PartyRoleType | null> {
    const current = await this.get(tenantId, id);
    if (!current) return null;
    const nextKey = patch.key ?? current.key;
    const nextRoleName = patch.roleName ?? current.roleName;
    const nextLabel = patch.label ?? current.label;
    const nextDescription = patch.description !== undefined ? patch.description : current.description;
    const now = new Date().toISOString();

    await this.db.transaction(async () => {
      await this.db.run(
        `UPDATE party_role_type
            SET type_key = ?, role_name = ?, label = ?, description = ?, updated_at = ?
          WHERE tenant_id = ? AND id = ?`,
        [nextKey, nextRoleName, nextLabel, nextDescription, now, tenantId, id],
      );
      if (nextRoleName !== current.roleName) {
        await this.db.run(
          `UPDATE party_role_type_characteristic
              SET role_name = ?, updated_at = ?
            WHERE tenant_id = ? AND role_name = ?`,
          [nextRoleName, now, tenantId, current.roleName],
        );
        await this.db.run(
          `UPDATE tmf_party_role SET name = ?, updated_at = ?
            WHERE tenant_id = ? AND name = ?`,
          [nextRoleName, now, tenantId, current.roleName],
        );
      }
    });
    return await this.get(tenantId, id);
  }

  public async deactivate(tenantId: string, id: string): Promise<PartyRoleType | null> {
    const result = await this.db.run(
      `UPDATE party_role_type SET active = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      [0, new Date().toISOString(), tenantId, id],
    );
    return result.changes > 0 ? await this.get(tenantId, id) : null;
  }

  public async ensureSupplierSeed(tenantId: string): Promise<void> {
    const existing = await this.db.get<{ id: string }>(
      `SELECT id FROM party_role_type WHERE tenant_id = ? AND type_key = ?`,
      [tenantId, 'supplier'],
    );
    if (existing) return;
    await this.create(tenantId, {
      key: 'supplier',
      roleName: 'manufacturer',
      label: 'Fornecedores',
      description: 'Organizações fornecedoras de equipamentos e materiais.',
    });
  }
}
