import type { Connection } from 'oracledb';
import type { MigrationContext } from './context.js';

/**
 * Recontagem set-based (idempotente) de `geographic_administrative_city_tenant` do tenant: Sites raiz com
 * status <> 'Retired' por `geographic_site.administrative_city_id`. Garante antes a linha
 * tenant–município de todo Site com município (FK composta, inclusive Retired). Linhas sem Site
 * ativo ficam com 0 — nunca são apagadas. Nunca incrementa: reexecutar (retry, resume, pausa)
 * converge para o mesmo resultado. Não faz COMMIT.
 */
export async function reconcileAdministrativeCitySiteCounts(
  ctx: MigrationContext,
  target: Connection,
): Promise<{ upserted: number; removed: number }> {
  const { tenantId } = ctx.options;
  const site = ctx.t('geographic_site');
  const counts = ctx.t('geographic_administrative_city_tenant');

  await ensureTenantCityLinks(ctx, target);

  const merged = await target.execute(
    `MERGE INTO ${counts} k
     USING (SELECT s.administrative_city_id AS city_id, COUNT(*) AS total
              FROM ${site} s
             WHERE s.tenant_id = :tenantId AND s.parent_site_id IS NULL
               AND s.status <> 'Retired'
               AND s.administrative_city_id IS NOT NULL
             GROUP BY s.administrative_city_id) c
        ON (k.tenant_id = :tenantId AND k.administrative_city_id = c.city_id)
      WHEN MATCHED THEN UPDATE SET k.active_site_count = c.total, k.updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
           VALUES (:tenantId, c.city_id, c.total, SYSTIMESTAMP)`,
    { tenantId },
    { autoCommit: false },
  );
  // MINUS em vez de NOT EXISTS correlacionado: `geographic_site` não tem índice em
  // `administrative_city_id`, então o NOT EXISTS varria a tabela inteira (milhões de Sites) uma
  // vez por município — minutos/horas em UF grande, contra ~2s com uma única varredura.
  const zeroed = await target.execute(
    `MERGE INTO ${counts} k
     USING (SELECT administrative_city_id AS city_id
              FROM ${counts}
             WHERE tenant_id = :tenantId AND active_site_count <> 0
            MINUS
            SELECT s.administrative_city_id
              FROM ${site} s
             WHERE s.tenant_id = :tenantId AND s.parent_site_id IS NULL
               AND s.status <> 'Retired'
               AND s.administrative_city_id IS NOT NULL) z
        ON (k.tenant_id = :tenantId AND k.administrative_city_id = z.city_id)
      WHEN MATCHED THEN UPDATE SET k.active_site_count = 0, k.updated_at = SYSTIMESTAMP`,
    { tenantId },
    { autoCommit: false },
  );
  const result = { upserted: merged.rowsAffected ?? 0, removed: zeroed.rowsAffected ?? 0 };
  console.log(
    `[Municípios] contagem de Sites ativos reconciliada: atualizados=${result.upserted}; zerados=${result.removed}.`,
  );
  return result;
}

/**
 * Cria as linhas tenant–município ainda inexistentes para os pares já gravados nos Sites. Deve
 * rodar antes de qualquer UPDATE/INSERT de Site com município (a FK composta exige o pai).
 */
export async function ensureTenantCityLinks(
  ctx: MigrationContext,
  target: Connection,
): Promise<void> {
  const { tenantId } = ctx.options;
  await target.execute(
    `MERGE INTO ${ctx.t('geographic_administrative_city_tenant')} k
     USING (SELECT DISTINCT s.administrative_city_id AS city_id
              FROM ${ctx.t('geographic_site')} s
             WHERE s.tenant_id = :tenantId AND s.administrative_city_id IS NOT NULL) c
        ON (k.tenant_id = :tenantId AND k.administrative_city_id = c.city_id)
      WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
           VALUES (:tenantId, c.city_id, 0, SYSTIMESTAMP)`,
    { tenantId },
    { autoCommit: false },
  );
}
