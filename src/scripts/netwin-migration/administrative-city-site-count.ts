import type { Connection } from 'oracledb';
import type { MigrationContext } from './context.js';

/**
 * Recontagem set-based (idempotente) da projeção `geo_administrative_city_site_count` do tenant:
 * Sites raiz com status <> 'Retired' por município (endereço real; fallback na projeção Site→município). Nunca incrementa — reexecutar
 * (retry, resume, pausa) converge para o mesmo resultado. Não faz COMMIT.
 */
export async function reconcileAdministrativeCitySiteCounts(
  ctx: MigrationContext,
  target: Connection,
): Promise<{ upserted: number; removed: number }> {
  const { tenantId } = ctx.options;
  const site = ctx.t('tmf_geographic_site');
  const address = ctx.t('tmf_geographic_address');
  const projection = ctx.t('geo_site_administrative_city');
  const counts = ctx.t('geo_administrative_city_site_count');

  const merged = await target.execute(
    `MERGE INTO ${counts} k
     USING (SELECT COALESCE(a.administrative_city_id, p.administrative_city_id) AS city_id,
                   COUNT(*) AS total
              FROM ${site} s
              LEFT JOIN ${address} a ON a.id = s.geographic_address_id
              LEFT JOIN ${projection} p ON p.tenant_id = s.tenant_id AND p.site_id = s.id
             WHERE s.tenant_id = :tenantId AND s.parent_site_id IS NULL
               AND s.status <> 'Retired'
               AND COALESCE(a.administrative_city_id, p.administrative_city_id) IS NOT NULL
             GROUP BY COALESCE(a.administrative_city_id, p.administrative_city_id)) c
        ON (k.tenant_id = :tenantId AND k.administrative_city_id = c.city_id)
      WHEN MATCHED THEN UPDATE SET k.active_site_count = c.total, k.updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
           VALUES (:tenantId, c.city_id, c.total, SYSTIMESTAMP)`,
    { tenantId },
    { autoCommit: false },
  );
  const removed = await target.execute(
    `DELETE FROM ${counts} k
      WHERE k.tenant_id = :tenantId
        AND NOT EXISTS (SELECT 1 FROM ${site} s
                          LEFT JOIN ${address} a ON a.id = s.geographic_address_id
                          LEFT JOIN ${projection} p ON p.tenant_id = s.tenant_id AND p.site_id = s.id
                         WHERE s.tenant_id = :tenantId AND s.parent_site_id IS NULL
                           AND s.status <> 'Retired'
                           AND COALESCE(a.administrative_city_id, p.administrative_city_id)
                               = k.administrative_city_id)`,
    { tenantId },
    { autoCommit: false },
  );
  const result = { upserted: merged.rowsAffected ?? 0, removed: removed.rowsAffected ?? 0 };
  console.log(
    `[Municípios] contagem de Sites ativos reconciliada: atualizados=${result.upserted}; removidos=${result.removed}.`,
  );
  return result;
}
