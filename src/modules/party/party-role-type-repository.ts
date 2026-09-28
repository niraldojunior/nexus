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

  // Múltiplos papéis do mesmo roleName são permitidos (ex.: "Fabricante de ONT" e "Fabricante de
  // OLT" ambos com roleName=manufacturer, cada um com seu próprio catálogo de characteristics via
  // role_type_id) — só a `key` (slug único por papel) precisa ser exclusiva.
  public async findByKey(tenantId: string, key: string): Promise<PartyRoleType | null> {
    const row = await this.db.get<PartyRoleTypeRow>(
      `${SELECT_PARTY_ROLE_TYPE} WHERE tenant_id = ? AND type_key = ?`,
      [tenantId, key],
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
      [
        id,
        tenantId,
        input.key,
        input.roleName,
        input.label,
        input.description ?? null,
        1,
        now,
        now,
      ],
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
    const nextDescription =
      patch.description !== undefined ? patch.description : current.description;
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
        // Renomeia somente os PartyRole vinculados a este PartyRoleType específico, não todos os
        // homônimos de outro PartyRoleType. Se role_type_id ainda não foi preenchido (dados
        // pré-migration V24), o fallback por roleName continua correto porque antes da V24 só
        // existia um PartyRoleType por roleName.
        await this.db.run(
          `UPDATE tmf_party_role SET name = ?, updated_at = ?
            WHERE tenant_id = ? AND (role_type_id = ? OR (role_type_id IS NULL AND name = ?))`,
          [nextRoleName, now, tenantId, id, current.roleName],
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

  // Contraparte de `deactivate` — usada pelo Studio ao republicar um tipo de parte que havia
  // sido descartado numa publicação anterior (C6: nunca DELETE físico, sempre reversível).
  public async reactivate(tenantId: string, id: string): Promise<PartyRoleType | null> {
    const result = await this.db.run(
      `UPDATE party_role_type SET active = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      [1, new Date().toISOString(), tenantId, id],
    );
    return result.changes > 0 ? await this.get(tenantId, id) : null;
  }

  public async listOrganizationsByRoleTypeIds(
    tenantId: string,
    roleTypeIds: string[],
  ): Promise<Array<{ id: string; name: string }>> {
    if (roleTypeIds.length === 0) return [];
    const placeholders = roleTypeIds.map(() => '?').join(', ');
    return await this.db.all<{ id: string; name: string }>(
      `SELECT DISTINCT p.id, p.name
         FROM tmf_party p
         JOIN tmf_party_role r ON r.party_id = p.id
        WHERE r.role_type_id IN (${placeholders})
          AND (r.tenant_id = ? OR r.tenant_id IS NULL)
          AND r.status = 'active'
          AND p.status = 'active'
        ORDER BY p.name`,
      [...roleTypeIds, tenantId],
    );
  }

  public async getUsage(
    tenantId: string,
    roleName: string,
    roleTypeId?: string,
  ): Promise<{
    organizationCount: number;
    organizations: Array<{ id: string; name: string }>;
    resourceSpecificationCount: number;
  }> {
    // Busca organizações com party_role ativo — por role_type_id quando disponível (preciso),
    // fallback por roleName (pré-migration V24 ou chamadas legadas).
    const orgFilter = roleTypeId
      ? { clause: 'r.role_type_id = ?', param: roleTypeId }
      : { clause: 'r.name = ?', param: roleName };
    const orgRows = await this.db.all<{ id: string; name: string }>(
      `SELECT DISTINCT p.id, p.name
         FROM tmf_party p
         JOIN tmf_party_role r ON r.party_id = p.id
        WHERE ${orgFilter.clause}
          AND (r.tenant_id = ? OR r.tenant_id IS NULL)
          AND r.status = 'active'
          AND p.status = 'active'
        ORDER BY p.name`,
      [orgFilter.param, tenantId],
    );

    // Contagem de especificações de recurso que referenciam papéis deste tipo (ex.: manufacturer)
    let resourceSpecificationCount = 0;
    try {
      const resCountRow = await this.db.get<{ count: unknown }>(
        `SELECT COUNT(DISTINCT s.id) AS "count"
           FROM resource_specification s
           JOIN resource_spec_related_party rp ON rp.specification_id = s.id
          WHERE rp.role = ?
            AND (s.tenant_id = ? OR s.tenant_id IS NULL)
            AND s.status = 'active'`,
        [roleName, tenantId],
      );
      if (resCountRow && resCountRow.count !== undefined && resCountRow.count !== null) {
        resourceSpecificationCount = Number(resCountRow.count);
      }
    } catch {
      // Se a tabela ou coluna de relacionamento não existir em algum ambiente de teste isolado
      resourceSpecificationCount = 0;
    }

    return {
      organizationCount: orgRows.length,
      organizations: orgRows,
      resourceSpecificationCount,
    };
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

  public async ensureVendorSeed(tenantId: string): Promise<void> {
    const existing = await this.db.get<{ id: string }>(
      `SELECT id FROM party_role_type WHERE tenant_id = ? AND type_key = ?`,
      [tenantId, 'vendor'],
    );
    if (existing) return;
    await this.create(tenantId, {
      key: 'vendor',
      roleName: 'vendor',
      label: 'Vendors',
      description: 'Fornecedores de aquisição de instâncias de recurso (RN-002, issue #251).',
    });
  }
}
