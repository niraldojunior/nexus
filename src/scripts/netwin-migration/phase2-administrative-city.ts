import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { resolveAdministrativeCityIds } from '../netwin-migration-kit.js';
import {
  administrativeCityNaturalKey,
  normalizeAdministrativeCity,
  type AdministrativeCityTuple,
} from '../../modules/geo/administrative-city.js';
import { reconcileAdministrativeCitySiteCounts } from './administrative-city-site-count.js';
import { chunksOf } from './source-batches.js';
import type { PhaseStats } from './types.js';

type TupleRow = {
  COUNTRY: string | null;
  STATE_OR_PROVINCE: string | null;
  CITY: string | null;
  N: number;
};

type AddressRow = {
  ID: string;
  COUNTRY: string | null;
  STATE_OR_PROVINCE: string | null;
  CITY: string | null;
};

/**
 * Fase 2.E — diretório geográfico canônico (issue #329).
 *
 * A master de municípios nasce na Fase 1 (CITYAREA); aqui se preenche o município direto do Site
 * (`tmf_geographic_site.administrative_city_id`, issue #339) a partir da tupla postal do endereço e
 * se reconcilia a quantidade de Sites ativos por município.
 *
 * As Fases 2.A/2.B já gravam `administrative_city_id` junto de cada endereço importado. Esta etapa
 * fecha a execução: garante que todo município/UF/país dos endereços do tenant esteja no diretório
 * `geo_administrative_city` e que todo endereço elegível esteja ligado a ele — inclusive os de
 * cargas anteriores. Idempotente: município existente (chave país+UF+município normalizada) é
 * reaproveitado, nunca duplicado; endereço já ligado não é tocado; incompleto/inválido é ignorado.
 */
export async function runPhase2AdministrativeCity(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 2.E: Diretório geográfico (país, UF, município) ===');
  const { tenantId, batchSize } = ctx.options;
  const address = ctx.t('tmf_geographic_address');
  const site = ctx.t('tmf_geographic_site');
  const cityTenant = ctx.t('geo_administrative_city_tenant');
  const directory = ctx.t('geo_administrative_city');

  const target = ctx.options.apply ? await ctx.getTargetConnection() : null;
  const reader = target ?? (await ctx.getTargetReadConnection());
  try {
    const grouped = await reader.execute<TupleRow>(
      `SELECT a.country AS "COUNTRY", a.state_or_province AS "STATE_OR_PROVINCE", a.city AS "CITY",
              COUNT(*) AS "N"
         FROM ${site} s
         JOIN ${address} a ON a.id = s.geographic_address_id
        WHERE s.tenant_id=:tenantId AND s.administrative_city_id IS NULL
        GROUP BY a.country, a.state_or_province, a.city`,
      { tenantId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    // Grafia canônica = a mais frequente (desempate lexical), como no backfill.
    const groups = new Map<
      string,
      { tuple: AdministrativeCityTuple; spellings: Map<string, number> }
    >();
    let eligible = 0;
    for (const row of grouped.rows ?? []) {
      const tuple = normalizeAdministrativeCity({
        country: row.COUNTRY,
        stateOrProvince: row.STATE_OR_PROVINCE,
        city: row.CITY,
      });
      if (!tuple) {
        stats.skipped += Number(row.N);
        continue;
      }
      eligible += Number(row.N);
      const key = administrativeCityNaturalKey(tuple);
      const group = groups.get(key) ?? { tuple, spellings: new Map<string, number>() };
      group.spellings.set(
        tuple.cityName,
        (group.spellings.get(tuple.cityName) ?? 0) + Number(row.N),
      );
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const [best] = [...group.spellings.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'),
      );
      if (best) group.tuple = { ...group.tuple, cityName: best[0] };
    }

    console.log(
      `[Diretório] Sites sem município: elegíveis=${eligible}; ignorados (incompletos/inválidos)=${stats.skipped}; municípios distintos=${groups.size}.`,
    );
    if (!target) {
      console.log('[Diretório] DRY-RUN: nada gravado.');
      return stats;
    }
    if (groups.size === 0) {
      await reconcileAdministrativeCitySiteCounts(ctx, target);
      await target.execute('COMMIT');
      return stats;
    }

    const before = await target.execute<{ N: number }>(
      `SELECT COUNT(*) AS "N" FROM ${directory}`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const cityIds = await resolveAdministrativeCityIds(target, ctx.t, [
      ...[...groups.values()].map((group) => group.tuple),
    ]);
    await target.execute('COMMIT');
    const after = await target.execute<{ N: number }>(
      `SELECT COUNT(*) AS "N" FROM ${directory}`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    stats.loaded = Number(after.rows?.[0]?.N ?? 0) - Number(before.rows?.[0]?.N ?? 0);
    console.log(
      `[Diretório] municípios novos=${stats.loaded}; já existentes reaproveitados=${cityIds.size - stats.loaded}.`,
    );

    // Ligação por keyset (id crescente); '' vira NULL no Oracle, então o cursor parte de ' '.
    let lastId = ' ';
    for (;;) {
      const page = await target.execute<AddressRow>(
        `SELECT s.id AS "ID", a.country AS "COUNTRY", a.state_or_province AS "STATE_OR_PROVINCE",
                a.city AS "CITY"
           FROM ${site} s
           JOIN ${address} a ON a.id = s.geographic_address_id
          WHERE s.tenant_id=:tenantId AND s.administrative_city_id IS NULL AND s.id > :lastId
          ORDER BY s.id
          FETCH FIRST :pageSize ROWS ONLY`,
        { tenantId, lastId, pageSize: batchSize },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = page.rows ?? [];
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1]!.ID;
      const byCity = new Map<string, string[]>();
      for (const row of rows) {
        const tuple = normalizeAdministrativeCity({
          country: row.COUNTRY,
          stateOrProvince: row.STATE_OR_PROVINCE,
          city: row.CITY,
        });
        const cityId = tuple ? cityIds.get(administrativeCityNaturalKey(tuple)) : undefined;
        if (!cityId) continue;
        byCity.set(cityId, [...(byCity.get(cityId) ?? []), row.ID]);
      }
      try {
        for (const [cityId, ids] of byCity) {
          for (const part of chunksOf(ids, 500)) {
            const binds: Record<string, string> = { cityId, tenantId };
            const clause = part
              .map((id, index) => {
                binds[`id${index}`] = id;
                return `:id${index}`;
              })
              .join(', ');
            // Pai da FK composta antes do Site.
            await target.execute(
              `MERGE INTO ${cityTenant} k
               USING (SELECT :tenantId AS tenant_id, :cityId AS city_id FROM DUAL) c
                  ON (k.tenant_id = c.tenant_id AND k.administrative_city_id = c.city_id)
                WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
                     VALUES (c.tenant_id, c.city_id, 0, SYSTIMESTAMP)`,
              { tenantId, cityId },
              { autoCommit: false },
            );
            // Só preenche município nulo: edições da modal prevalecem sobre a carga.
            const result = await target.execute(
              `UPDATE ${site} SET administrative_city_id=:cityId
                WHERE tenant_id=:tenantId AND administrative_city_id IS NULL AND id IN (${clause})`,
              binds,
              { autoCommit: false },
            );
            stats.updated += result.rowsAffected ?? 0;
          }
        }
        await target.execute('COMMIT');
      } catch (error) {
        await target.execute('ROLLBACK');
        throw error;
      }
    }
    console.log(`[Diretório] Sites ligados ao município=${stats.updated}.`);
    await reconcileAdministrativeCitySiteCounts(ctx, target);
    await target.execute('COMMIT');
    return stats;
  } finally {
    if (target) await target.close();
    else await reader.close();
  }
}
