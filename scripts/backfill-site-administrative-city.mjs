#!/usr/bin/env node
/**
 * Backfill do município direto no Site (issue #339, fase expand → cutover).
 *
 * Preenche `tmf_geographic_site.administrative_city_id` com a precedência legada
 * `COALESCE(endereço.administrative_city_id, geo_site_administrative_city.administrative_city_id)`,
 * garante antes as linhas tenant–município em `geo_administrative_city_tenant`, recontagem
 * `active_site_count` (Sites raiz não-Retired; linhas referenciadas ficam com 0, nunca apagadas) e,
 * só se a paridade fechar, valida a FK composta e coleta estatísticas.
 *
 * - Dry-run por padrão. `--apply` exige `--target-prefix <PREFIXO_>` explícito.
 * - Idempotente e reiniciável: só toca Sites com a coluna NULL, paginando por id (keyset),
 *   com commit por lote.
 * - Nunca roda no boot. Requer `npm run build` (loader-db usa dist/).
 *
 * Uso:
 *   node scripts/backfill-site-administrative-city.mjs --target-prefix NX_DEV9_
 *   node scripts/backfill-site-administrative-city.mjs --target-prefix NX_DEV9_ --apply [--batch-size 5000]
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const valueOf = (flag) => {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} exige um valor.`);
  return value;
};

const ORACLE_PREFIX = /^[A-Za-z][A-Za-z0-9_]*_$/;
const targetPrefix = valueOf('--target-prefix')?.trim().toUpperCase();
if (targetPrefix) {
  if (!ORACLE_PREFIX.test(targetPrefix)) {
    throw new Error(`--target-prefix inválido "${targetPrefix}" (ex.: NX_DEV9_).`);
  }
  process.env.ORACLE_OBJECT_PREFIX = targetPrefix;
}
if (APPLY && !targetPrefix) {
  throw new Error('--apply exige --target-prefix <PREFIXO_> explícito (ex.: NX_DEV9_).');
}
const BATCH_SIZE = Number(valueOf('--batch-size') ?? 5000);
if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 50000) {
  throw new Error('--batch-size deve ser inteiro entre 1 e 50000.');
}

const toNumber = (row, key) => Number(row?.[key] ?? row?.[key.toUpperCase()] ?? 0);
async function scalar(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return toNumber(rows[0], 'n');
}

// Cidade legada de um Site, com a precedência do código anterior ao cutover.
const LEGACY_CITY = `COALESCE(
  (SELECT a.administrative_city_id FROM tmf_geographic_address a WHERE a.id = s.geographic_address_id),
  (SELECT p.administrative_city_id FROM geo_site_administrative_city p
    WHERE p.tenant_id = s.tenant_id AND p.site_id = s.id))`;

async function parity(client) {
  const mismatched = await scalar(
    client,
    `SELECT COUNT(*) AS n FROM tmf_geographic_site s
      WHERE s.administrative_city_id IS NOT NULL
        AND s.administrative_city_id <> ${LEGACY_CITY}`,
  );
  const missingLink = await scalar(
    client,
    `SELECT COUNT(*) AS n FROM tmf_geographic_site s
      WHERE s.administrative_city_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM geo_administrative_city_tenant t
                         WHERE t.tenant_id = s.tenant_id
                           AND t.administrative_city_id = s.administrative_city_id)`,
  );
  const unfilled = await scalar(
    client,
    `SELECT COUNT(*) AS n FROM tmf_geographic_site s
      WHERE s.administrative_city_id IS NULL AND ${LEGACY_CITY} IS NOT NULL`,
  );
  const wrongCount = await scalar(
    client,
    `SELECT COUNT(*) AS n FROM geo_administrative_city_tenant t
      WHERE t.active_site_count <> (SELECT COUNT(*) FROM tmf_geographic_site s
                                     WHERE s.tenant_id = t.tenant_id
                                       AND s.administrative_city_id = t.administrative_city_id
                                       AND s.parent_site_id IS NULL AND s.status <> 'Retired')`,
  );
  return { mismatched, missingLink, unfilled, wrongCount };
}

async function main() {
  const client = await openLoaderDb();
  try {
    const prefix = process.env.ORACLE_OBJECT_PREFIX;
    console.log(`Ambiente: ${prefix}`);
    const total = await scalar(client, `SELECT COUNT(*) AS n FROM tmf_geographic_site`);
    const pending = await scalar(
      client,
      `SELECT COUNT(*) AS n FROM tmf_geographic_site s
        WHERE s.administrative_city_id IS NULL AND ${LEGACY_CITY} IS NOT NULL`,
    );
    const pairs = await scalar(
      client,
      `SELECT COUNT(*) AS n FROM (SELECT DISTINCT s.tenant_id, ${LEGACY_CITY} AS city_id
                                   FROM tmf_geographic_site s) x WHERE x.city_id IS NOT NULL`,
    );
    console.log(
      `Sites: ${total}; a preencher: ${pending}; pares tenant–município distintos (legado): ${pairs}`,
    );
    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Rode com --apply para executar. —');
      return;
    }

    // 1) Pares tenant–município (inclui os usados só por Sites Retired).
    await client.query('BEGIN');
    await client.query(
      `MERGE INTO geo_administrative_city_tenant t
       USING (SELECT DISTINCT s.tenant_id, ${LEGACY_CITY} AS city_id
                FROM tmf_geographic_site s) src
          ON (t.tenant_id = src.tenant_id AND t.administrative_city_id = src.city_id)
        WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
             VALUES (src.tenant_id, src.city_id, 0, SYSTIMESTAMP)
             WHERE src.city_id IS NOT NULL`,
    );
    await client.query('COMMIT');

    // 2) Sites, por faixas de id (keyset). Oracle trata '' como NULL; ' ' ordena antes de qualquer UUID.
    let lastId = ' ';
    let filled = 0;
    let batches = 0;
    for (;;) {
      const { rows } = await client.query(
        `SELECT MAX(id) AS upper_id FROM (
           SELECT id FROM tmf_geographic_site WHERE id > $1 ORDER BY id
            FETCH FIRST ${BATCH_SIZE} ROWS ONLY)`,
        [lastId],
      );
      const upper = rows[0]?.upper_id ?? rows[0]?.UPPER_ID;
      if (!upper) break;
      const bt = Date.now();
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE tmf_geographic_site s
            SET s.administrative_city_id = ${LEGACY_CITY}
          WHERE s.id > $1 AND s.id <= $2 AND s.administrative_city_id IS NULL
            AND ${LEGACY_CITY} IS NOT NULL`,
        [lastId, upper],
      );
      await client.query('COMMIT');
      filled += result.rowCount ?? 0;
      batches += 1;
      lastId = upper;
      console.log(`[lote ${batches}] cursor=${lastId} preenchidos=${filled} (${Date.now() - bt}ms)`);
    }

    // 3) Recontagem (nunca incrementa): Sites raiz não-Retired; linhas referenciadas ficam com 0.
    await client.query('BEGIN');
    await client.query(
      `UPDATE geo_administrative_city_tenant t
          SET t.active_site_count = (SELECT COUNT(*) FROM tmf_geographic_site s
                                      WHERE s.tenant_id = t.tenant_id
                                        AND s.administrative_city_id = t.administrative_city_id
                                        AND s.parent_site_id IS NULL AND s.status <> 'Retired'),
              t.updated_at = SYSTIMESTAMP`,
    );
    await client.query('COMMIT');

    // 4) Gate de paridade: só valida a FK se tudo fechar.
    const result = await parity(client);
    console.log(`Paridade: ${JSON.stringify(result)}`);
    if (Object.values(result).some((value) => value > 0)) {
      throw new Error('Paridade divergente — FK NÃO validada. Corrija e reexecute.');
    }
    await client.query(
      `ALTER TABLE tmf_geographic_site MODIFY CONSTRAINT ${prefix}fk_tmf_geographic_site_admin_city VALIDATE`,
    );
    await client.gatherStats('tmf_geographic_site');
    await client.gatherStats('geo_administrative_city_tenant');
    console.log(
      `Concluído: ${filled} Site(s) preenchido(s) em ${batches} lote(s). FK validada; estatísticas atualizadas.`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
