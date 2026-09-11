import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { createCanonicalId } from '../../shared/utils/canonical-id.js';
import type {
  CreateReferenceDataSetInput,
  CreateReferenceDataValueInput,
  ReferenceDataSet,
  ReferenceDataValue,
  UpdateReferenceDataSetInput,
  UpdateReferenceDataValueInput,
} from './domain.js';
import type { IReferenceDataRepository } from './repository.js';

type SetRow = Omit<ReferenceDataSet, 'active'> & { active: unknown };
type ValueRow = Omit<ReferenceDataValue, 'active'> & { active: unknown };

const SELECT_SET = `
  SELECT id, tenant_id AS tenantId, set_key AS "key", name, description,
         CASE WHEN active = 1 THEN 1 ELSE 0 END AS active,
         created_at AS createdAt, updated_at AS updatedAt
    FROM reference_data_set`;

const SELECT_VALUE = `
  SELECT id, tenant_id AS tenantId, set_id AS setId, value_key AS "key", label,
         sort_order AS sortOrder, CASE WHEN active = 1 THEN 1 ELSE 0 END AS active,
         created_at AS createdAt, updated_at AS updatedAt
    FROM reference_data_value`;

const setFromRow = (row: SetRow): ReferenceDataSet => ({ ...row, active: Number(row.active) === 1 });
const valueFromRow = (row: ValueRow): ReferenceDataValue => ({ ...row, active: Number(row.active) === 1 });

export class OracleReferenceDataRepository implements IReferenceDataRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public async listSets(tenantId: string, includeInactive = false): Promise<ReferenceDataSet[]> {
    const rows = await this.db.all<SetRow>(
      `${SELECT_SET} WHERE tenant_id = ?${includeInactive ? '' : ' AND active = 1'} ORDER BY name, set_key`,
      [tenantId],
    );
    return rows.map(setFromRow);
  }

  public async getSet(tenantId: string, id: string): Promise<ReferenceDataSet | null> {
    const row = await this.db.get<SetRow>(`${SELECT_SET} WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
    return row ? setFromRow(row) : null;
  }

  public async getSetByKey(tenantId: string, key: string): Promise<ReferenceDataSet | null> {
    const row = await this.db.get<SetRow>(`${SELECT_SET} WHERE tenant_id = ? AND set_key = ?`, [tenantId, key]);
    return row ? setFromRow(row) : null;
  }

  public async createSet(tenantId: string, input: CreateReferenceDataSetInput): Promise<ReferenceDataSet> {
    const id = createCanonicalId();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO reference_data_set (id, tenant_id, set_key, name, description, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenantId, input.key, input.name, input.description ?? null, 1, now, now],
    );
    return (await this.getSet(tenantId, id))!;
  }

  public async updateSet(
    tenantId: string,
    id: string,
    patch: UpdateReferenceDataSetInput,
  ): Promise<ReferenceDataSet | null> {
    const current = await this.getSet(tenantId, id);
    if (!current) return null;
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE reference_data_set SET set_key = ?, name = ?, description = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`,
      [
        patch.key ?? current.key,
        patch.name ?? current.name,
        patch.description !== undefined ? patch.description : current.description,
        now,
        tenantId,
        id,
      ],
    );
    return this.getSet(tenantId, id);
  }

  public async deactivateSet(tenantId: string, id: string): Promise<ReferenceDataSet | null> {
    const result = await this.db.run(
      `UPDATE reference_data_set SET active = 0, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      [new Date().toISOString(), tenantId, id],
    );
    return result.changes > 0 ? await this.getSet(tenantId, id) : null;
  }

  public async reactivateSet(tenantId: string, id: string): Promise<ReferenceDataSet | null> {
    const result = await this.db.run(
      `UPDATE reference_data_set SET active = 1, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      [new Date().toISOString(), tenantId, id],
    );
    return result.changes > 0 ? await this.getSet(tenantId, id) : null;
  }

  public async listValues(
    tenantId: string,
    setId: string,
    includeInactive = false,
  ): Promise<ReferenceDataValue[]> {
    const rows = await this.db.all<ValueRow>(
      `${SELECT_VALUE} WHERE tenant_id = ? AND set_id = ?${includeInactive ? '' : ' AND active = 1'}
       ORDER BY sort_order, value_key`,
      [tenantId, setId],
    );
    return rows.map(valueFromRow);
  }

  public async getValue(tenantId: string, id: string): Promise<ReferenceDataValue | null> {
    const row = await this.db.get<ValueRow>(`${SELECT_VALUE} WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
    return row ? valueFromRow(row) : null;
  }

  public async createValue(
    tenantId: string,
    setId: string,
    input: CreateReferenceDataValueInput,
  ): Promise<ReferenceDataValue> {
    const id = createCanonicalId();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO reference_data_value
        (id, tenant_id, set_id, value_key, label, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenantId, setId, input.key, input.label, input.sortOrder ?? 100, 1, now, now],
    );
    return (await this.getValue(tenantId, id))!;
  }

  public async updateValue(
    tenantId: string,
    id: string,
    patch: UpdateReferenceDataValueInput,
  ): Promise<ReferenceDataValue | null> {
    const current = await this.getValue(tenantId, id);
    if (!current) return null;
    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE reference_data_value
          SET value_key = ?, label = ?, sort_order = ?, active = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?`,
      [
        patch.key ?? current.key,
        patch.label ?? current.label,
        patch.sortOrder ?? current.sortOrder,
        (patch.active ?? current.active) ? 1 : 0,
        now,
        tenantId,
        id,
      ],
    );
    return this.getValue(tenantId, id);
  }

  public async deactivateValue(tenantId: string, id: string): Promise<ReferenceDataValue | null> {
    const result = await this.db.run(
      `UPDATE reference_data_value SET active = 0, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      [new Date().toISOString(), tenantId, id],
    );
    return result.changes > 0 ? await this.getValue(tenantId, id) : null;
  }

  public async reactivateValue(tenantId: string, id: string): Promise<ReferenceDataValue | null> {
    const result = await this.db.run(
      `UPDATE reference_data_value SET active = 1, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      [new Date().toISOString(), tenantId, id],
    );
    return result.changes > 0 ? await this.getValue(tenantId, id) : null;
  }
}
