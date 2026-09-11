import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { IStudioAssetRepository } from './asset-repository-interface.js';
import type { StudioAsset } from './asset-service.js';

type StudioAssetRow = {
  id: string;
  tenant_id: string;
  name: string;
  mime_type: string;
  content: string;
  checksum: string;
  active: number;
  created_at: string;
  created_by: string;
  retired_at: string | null;
  retired_by: string | null;
};

export class OracleStudioAssetRepository implements IStudioAssetRepository {
  constructor(private readonly db: DatabaseClient) {}

  public async insert(asset: StudioAsset): Promise<StudioAsset> {
    await this.db.run(
      `INSERT INTO studio_asset
       (id, tenant_id, name, mime_type, content, checksum, active, created_at, created_by, retired_at, retired_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset.id,
        asset.tenantId,
        asset.name,
        asset.mimeType,
        asset.content,
        asset.checksum,
        asset.active ? 1 : 0,
        asset.createdAt,
        asset.createdBy,
        asset.retiredAt ?? null,
        asset.retiredBy ?? null,
      ],
    );
    return (await this.get(asset.tenantId, asset.id))!;
  }

  public async get(tenantId: string, id: string): Promise<StudioAsset | undefined> {
    const row = await this.db.get<StudioAssetRow>(
      `SELECT id, tenant_id, name, mime_type, content, checksum, active, created_at, created_by, retired_at, retired_by
       FROM studio_asset WHERE tenant_id = ? AND id = ?`,
      [tenantId, id],
    );
    return row ? this.map(row) : undefined;
  }

  public async list(tenantId: string, options: { active?: boolean } = {}): Promise<StudioAsset[]> {
    const rows = await this.db.all<StudioAssetRow>(
      `SELECT id, tenant_id, name, mime_type, content, checksum, active, created_at, created_by, retired_at, retired_by
       FROM studio_asset WHERE tenant_id = ?${options.active === undefined ? '' : ' AND active = ?'}
       ORDER BY name, id`,
      options.active === undefined ? [tenantId] : [tenantId, options.active ? 1 : 0],
    );
    return rows.map((row) => this.map(row));
  }

  public async retire(
    tenantId: string,
    id: string,
    retiredAt: string,
    retiredBy: string,
  ): Promise<StudioAsset | undefined> {
    const result = await this.db.run(
      `UPDATE studio_asset SET active = 0, retired_at = ?, retired_by = ?
       WHERE tenant_id = ? AND id = ? AND active = 1`,
      [retiredAt, retiredBy, tenantId, id],
    );
    if (result.changes === 0) return undefined;
    return await this.get(tenantId, id);
  }

  private map(row: StudioAssetRow): StudioAsset {
    return {
      '@type': 'StudioAsset',
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      mimeType: row.mime_type as StudioAsset['mimeType'],
      content: row.content,
      checksum: row.checksum,
      active: row.active === 1,
      createdAt: row.created_at,
      createdBy: row.created_by,
      ...(row.retired_at ? { retiredAt: row.retired_at } : {}),
      ...(row.retired_by ? { retiredBy: row.retired_by } : {}),
    };
  }
}
