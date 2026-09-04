import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { buildHref } from '../../shared/tmf/index.js';
import type { StudioAuditEntry, StudioDomain, StudioVersion, StudioWorkspace } from './domain.js';
import type { IStudioRepository, StudioTenantScope } from './studio-repository-interface.js';

type StudioWorkspaceRow = {
  id: string;
  tenant_id: string;
  domain: string;
  published_version_id: string | null;
  draft_version_id: string | null;
  updated_at: string;
};

type StudioVersionRow = {
  id: string;
  tenant_id: string;
  domain: string;
  version_number: number;
  status: string;
  snapshot: string;
  checksum: string;
  validation: string | null;
  base_version_id: string | null;
  created_at: string;
  created_by: string;
  published_at: string | null;
  published_by: string | null;
  discarded_at: string | null;
  discarded_by: string | null;
};

type StudioAuditLogRow = {
  id: string;
  tenant_id: string;
  domain: string;
  action: string;
  version_id: string;
  version_number: number;
  actor_sub: string;
  event_time: string;
};

export class PostgresStudioRepository implements IStudioRepository {
  constructor(private db: DatabaseClient) {}

  public transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.db.transaction(async () => await fn());
  }

  public async getWorkspace(
    tenantId: string,
    domain: StudioDomain,
  ): Promise<StudioWorkspace | undefined> {
    const row = await this.db.get<StudioWorkspaceRow>(
      `SELECT id, tenant_id, domain, published_version_id, draft_version_id, updated_at
       FROM studio_workspace WHERE tenant_id = ? AND domain = ?`,
      [tenantId, domain],
    );
    return row ? this.mapWorkspaceRow(row) : undefined;
  }

  public async upsertWorkspace(workspace: StudioWorkspace): Promise<StudioWorkspace> {
    await this.db.run(
      `INSERT INTO studio_workspace (id, tenant_id, domain, published_version_id, draft_version_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, domain) DO UPDATE SET
       published_version_id = excluded.published_version_id,
       draft_version_id = excluded.draft_version_id,
       updated_at = excluded.updated_at`,
      [
        workspace.id,
        workspace.tenantId,
        workspace.domain,
        workspace.publishedVersionId ?? null,
        workspace.draftVersionId ?? null,
        workspace.updatedAt,
      ],
    );
    return (await this.getWorkspace(workspace.tenantId, workspace.domain))!;
  }

  public async getVersion(
    id: string,
    scope?: StudioTenantScope,
  ): Promise<StudioVersion | undefined> {
    const conditions = ['id = ?'];
    const params: string[] = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<StudioVersionRow>(
      `SELECT id, tenant_id, domain, version_number, status, snapshot, checksum, validation,
              base_version_id, created_at, created_by, published_at, published_by,
              discarded_at, discarded_by
       FROM studio_version WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return row ? this.mapVersionRow(row) : undefined;
  }

  public async insertVersion(version: StudioVersion): Promise<StudioVersion> {
    await this.db.run(
      `INSERT INTO studio_version
       (id, tenant_id, domain, version_number, status, snapshot, checksum, validation,
        base_version_id, created_at, created_by, published_at, published_by, discarded_at, discarded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        version.id,
        version.tenantId,
        version.domain,
        version.versionNumber,
        version.status,
        JSON.stringify(version.snapshot),
        version.checksum,
        version.validation ? JSON.stringify(version.validation) : null,
        version.baseVersionId ?? null,
        version.createdAt,
        version.createdBy,
        version.publishedAt ?? null,
        version.publishedBy ?? null,
        version.discardedAt ?? null,
        version.discardedBy ?? null,
      ],
    );
    return (await this.getVersion(version.id))!;
  }

  public async updateVersion(
    version: StudioVersion,
    expectedChecksum?: string,
  ): Promise<StudioVersion | undefined> {
    const result = await this.db.run(
      `UPDATE studio_version SET
       status = ?, snapshot = ?, checksum = ?, validation = ?, published_at = ?, published_by = ?,
       discarded_at = ?, discarded_by = ?
       WHERE id = ? AND tenant_id = ?${expectedChecksum !== undefined ? ' AND checksum = ?' : ''}`,
      [
        version.status,
        JSON.stringify(version.snapshot),
        version.checksum,
        version.validation ? JSON.stringify(version.validation) : null,
        version.publishedAt ?? null,
        version.publishedBy ?? null,
        version.discardedAt ?? null,
        version.discardedBy ?? null,
        version.id,
        version.tenantId,
        ...(expectedChecksum !== undefined ? [expectedChecksum] : []),
      ],
    );
    if (result.changes === 0) return undefined;
    return (await this.getVersion(version.id, { tenantId: version.tenantId }))!;
  }

  public async listVersions(
    tenantId: string,
    domain: StudioDomain,
    query?: { limit?: number; offset?: number },
  ): Promise<StudioVersion[]> {
    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const params: Array<string | number> = [tenantId, domain];
    const sql = [
      `SELECT id, tenant_id, domain, version_number, status, snapshot, checksum, validation,
              base_version_id, created_at, created_by, published_at, published_by,
              discarded_at, discarded_by
       FROM studio_version WHERE tenant_id = ? AND domain = ?`,
      'ORDER BY version_number DESC',
      hasLimit ? 'LIMIT ?' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    return (await this.db.all<StudioVersionRow>(sql, params)).map((row) => this.mapVersionRow(row));
  }

  public async getMaxVersionNumber(tenantId: string, domain: StudioDomain): Promise<number> {
    const row = await this.db.get<{ max_version: number | null }>(
      `SELECT MAX(version_number) AS max_version FROM studio_version WHERE tenant_id = ? AND domain = ?`,
      [tenantId, domain],
    );
    return row?.max_version ?? 0;
  }

  public async appendAudit(entry: StudioAuditEntry): Promise<void> {
    await this.db.run(
      `INSERT INTO studio_audit_log (id, tenant_id, domain, action, version_id, version_number, actor_sub, event_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.tenantId,
        entry.domain,
        entry.action,
        entry.versionId,
        entry.versionNumber,
        entry.actorSub,
        entry.eventTime,
      ],
    );
  }

  public async listAudit(
    tenantId: string,
    domain: StudioDomain,
    query?: { limit?: number; offset?: number },
  ): Promise<StudioAuditEntry[]> {
    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const params: Array<string | number> = [tenantId, domain];
    const sql = [
      `SELECT id, tenant_id, domain, action, version_id, version_number, actor_sub, event_time
       FROM studio_audit_log WHERE tenant_id = ? AND domain = ?`,
      'ORDER BY event_time DESC',
      hasLimit ? 'LIMIT ?' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    return (await this.db.all<StudioAuditLogRow>(sql, params)).map((row) => ({
      '@type': 'StudioAuditEntry',
      id: row.id,
      tenantId: row.tenant_id,
      domain: row.domain as StudioDomain,
      action: row.action as StudioAuditEntry['action'],
      versionId: row.version_id,
      versionNumber: row.version_number,
      actorSub: row.actor_sub,
      eventTime: row.event_time,
    }));
  }

  private mapWorkspaceRow(row: StudioWorkspaceRow): StudioWorkspace {
    return {
      '@type': 'StudioWorkspace',
      id: row.id,
      href: buildHref('studioWorkspace', row.id),
      tenantId: row.tenant_id,
      domain: row.domain as StudioDomain,
      ...(row.published_version_id ? { publishedVersionId: row.published_version_id } : {}),
      ...(row.draft_version_id ? { draftVersionId: row.draft_version_id } : {}),
      updatedAt: row.updated_at,
    };
  }

  private mapVersionRow(row: StudioVersionRow): StudioVersion {
    return {
      '@type': 'StudioVersion',
      id: row.id,
      href: buildHref('studioVersion', row.id),
      tenantId: row.tenant_id,
      domain: row.domain as StudioDomain,
      versionNumber: row.version_number,
      status: row.status as StudioVersion['status'],
      snapshot: JSON.parse(row.snapshot) as Record<string, unknown>,
      checksum: row.checksum,
      ...(row.validation ? { validation: JSON.parse(row.validation) } : {}),
      ...(row.base_version_id ? { baseVersionId: row.base_version_id } : {}),
      createdAt: row.created_at,
      createdBy: row.created_by,
      ...(row.published_at ? { publishedAt: row.published_at } : {}),
      ...(row.published_by ? { publishedBy: row.published_by } : {}),
      ...(row.discarded_at ? { discardedAt: row.discarded_at } : {}),
      ...(row.discarded_by ? { discardedBy: row.discarded_by } : {}),
    };
  }
}
