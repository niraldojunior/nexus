#!/usr/bin/env node
/**
 * Reparo: coloca as "Cobertura GPON" no seu município (issue #407).
 *
 * A fase 3 do migrador Netwin criava o Site de cobertura sem `administrative_city_id`, então as ~12 mil
 * coberturas apareciam em "Sem UF / Sem município" na árvore de Locais. UF e município estão nas
 * characteristics `_coverage.uf` / `_coverage.city` (a fase 3 agora grava o município direto).
 *
 * Só os níveis bairro e município pertencem a uma cidade. O nível UF atravessa vários municípios, e
 * cobertura sem município ("Sem município") ou com UF inválida não tem como entrar no diretório: ficam
 * como estão e são listadas ao final.
 *
 * Idempotente (só toca Sites sem município). Numa transação: vincula tenant–município (FK composta),
 * grava o município nos Sites e recontagem a contagem por município. Sem DELETE (C6).
 *
 * Uso:
 *   node scripts/repair-gpon-coverage-city.mjs --environment NX_DEV16_            # dry-run
 *   node scripts/repair-gpon-coverage-city.mjs --environment NX_DEV16_ --apply    # executa
 *
 * Requer `npm run build` (dist/) e ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD.
 */

import { config as loadEnv } from 'dotenv';
import {
  administrativeCityNaturalKey,
  normalizeAdministrativeCity,
} from '../dist/src/modules/geo/administrative-city.js';
import {
  linkAdministrativeCities,
  recountAdministrativeCityTenant,
} from './administrative-city-loader.mjs';
import { openLoaderDb, resolveLoaderEnvironment } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.includes('--apply');
const SPEC_CODE = 'GPON_COVERAGE';
const NO_CITY_LABEL = 'Sem município';
const CHUNK = 500;

function coverageValue(characteristics, name) {
  try {
    const list =
      typeof characteristics === 'string' ? JSON.parse(characteristics) : characteristics;
    return list?.find((item) => item.group === '_coverage' && item.name === name)?.value;
  } catch {
    return undefined;
  }
}

async function main() {
  const prefix = resolveLoaderEnvironment();
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');
  console.log(`Ambiente: ${prefix}`);
  const db = await openLoaderDb();

  try {
    const { rows: sites } = await db.query(
      `SELECT s.id, s.tenant_id, s.characteristics
         FROM geographic_site s
         JOIN geographic_site_specification sp ON sp.id = s.site_specification_id
        WHERE sp.code = $1 AND s.status <> 'Retired' AND s.administrative_city_id IS NULL`,
      [SPEC_CODE],
    );
    console.log(`Coberturas ativas sem município: ${sites.length}`);

    const rows = [];
    const skipped = { uf: 0, semMunicipio: 0, invalido: 0 };
    for (const site of sites) {
      const level = coverageValue(site.characteristics, 'level');
      const city = coverageValue(site.characteristics, 'city');
      const uf = coverageValue(site.characteristics, 'uf');
      if (level === 'uf') skipped.uf += 1;
      else if (!city || city === NO_CITY_LABEL) skipped.semMunicipio += 1;
      else if (!normalizeAdministrativeCity({ stateOrProvince: uf, city })) skipped.invalido += 1;
      else rows.push({ siteId: site.id, tenantId: site.tenant_id, city, state_or_province: uf });
    }

    const tuples = new Map();
    for (const row of rows) {
      const tuple = normalizeAdministrativeCity({
        stateOrProvince: row.state_or_province,
        city: row.city,
      });
      tuples.set(administrativeCityNaturalKey(tuple), tuple);
    }
    const { rows: directory } = await db.query(
      'SELECT country_code, state_code, city_key FROM geographic_administrative_city',
    );
    const known = new Set(
      directory.map(
        (item) =>
          `${item.country_code ?? item.COUNTRY_CODE}|${item.state_code ?? item.STATE_CODE}|${item.city_key ?? item.CITY_KEY}`,
      ),
    );
    const novos = [...tuples.keys()].filter((key) => !known.has(key));

    console.log(`\nA vincular: ${rows.length} Site(s) em ${tuples.size} município(s)`);
    console.log(
      `  municípios já no diretório: ${tuples.size - novos.length}; novos: ${novos.length}`,
    );
    for (const key of novos.slice(0, 20)) console.log(`    + ${key}`);
    console.log(
      `Ficam sem município: ${skipped.uf} de nível UF · ${skipped.semMunicipio} sem município na origem · ${skipped.invalido} com UF/município inválido`,
    );

    if (!APPLY) {
      console.log('\n(dry-run — nada gravado)');
      return;
    }

    // Insere no diretório os municípios ausentes e preenche administrative_city_id nas linhas.
    await linkAdministrativeCities(db, rows);
    const byCity = new Map();
    const tenantPairs = new Map();
    for (const row of rows) {
      if (!row.administrative_city_id) continue;
      const list = byCity.get(row.administrative_city_id) ?? [];
      list.push(row.siteId);
      byCity.set(row.administrative_city_id, list);
      tenantPairs.set(`${row.tenantId}|${row.administrative_city_id}`, [
        row.tenantId,
        row.administrative_city_id,
      ]);
    }
    for (const [tenantId, cityId] of tenantPairs.values()) {
      await db.query(
        `MERGE INTO geographic_administrative_city_tenant k
         USING (SELECT $1 AS tenant_id, $2 AS city_id FROM DUAL) c
            ON (k.tenant_id = c.tenant_id AND k.administrative_city_id = c.city_id)
          WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
               VALUES (c.tenant_id, c.city_id, 0, SYSTIMESTAMP)`,
        [tenantId, cityId],
      );
    }
    let updated = 0;
    for (const [cityId, ids] of byCity) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const part = ids.slice(i, i + CHUNK);
        const result = await db.query(
          `UPDATE geographic_site SET administrative_city_id = $1
            WHERE administrative_city_id IS NULL AND id IN (${part.map((_, n) => `$${n + 2}`).join(', ')})`,
          [cityId, ...part],
        );
        updated += result.rowCount ?? 0;
      }
    }
    await db.query('COMMIT');
    await recountAdministrativeCityTenant(db);
    console.log(`\nSites atualizados: ${updated}. Contagem por município recalculada.`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.close();
  }
  console.log('\n=== fim ===');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
