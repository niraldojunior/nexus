import type { DatabaseClient } from './database-client.js';
import { createCanonicalId } from '../utils/canonical-id.js';

export type NexusEnvironmentBootstrapMode = 'empty' | 'legacy';

export type NexusEnvironmentProfile = {
  environmentId: string;
  bootstrapMode: NexusEnvironmentBootstrapMode;
  initialTenantId: string | null;
};

type EnvironmentRow = {
  id: string;
  bootstrapMode: NexusEnvironmentBootstrapMode;
  tenantId: string | null;
};

/**
 * Perfil persistido do namespace. A ausência da tabela/linha é legacy para que namespaces
 * anteriores continuem funcionando durante a migração progressiva.
 */
export class EnvironmentProfileRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public async get(): Promise<NexusEnvironmentProfile> {
    try {
      const row = await this.db.get<EnvironmentRow>(
        `SELECT id, bootstrap_mode AS bootstrapMode, tenant_id AS tenantId
           FROM nexus_environment
          ORDER BY created_at
          LIMIT 1`,
      );
      if (row) {
        return {
          environmentId: row.id,
          bootstrapMode: row.bootstrapMode === 'empty' ? 'empty' : 'legacy',
          initialTenantId: row.tenantId,
        };
      }
    } catch {
      // Schema pré-v17: compatibilidade legacy intencional.
    }
    return { environmentId: 'legacy', bootstrapMode: 'legacy', initialTenantId: null };
  }

  public async createEmpty(tenantId: string): Promise<NexusEnvironmentProfile> {
    const environmentId = createCanonicalId();
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO nexus_environment (id, bootstrap_mode, tenant_id, created_at, updated_at)
       VALUES (?, 'empty', ?, ?, ?)`,
      [environmentId, tenantId, now, now],
    );
    return { environmentId, bootstrapMode: 'empty', initialTenantId: tenantId };
  }

  public async markEmpty(environmentId: string, tenantId: string): Promise<void> {
    await this.db.run(
      `UPDATE nexus_environment
          SET bootstrap_mode = 'empty', tenant_id = ?, updated_at = ?
        WHERE id = ?`,
      [tenantId, new Date().toISOString(), environmentId],
    );
  }
}
