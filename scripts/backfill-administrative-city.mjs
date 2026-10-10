#!/usr/bin/env node
/**
 * Backfill do diretório geográfico canônico (issue #329): preenche `geo_administrative_city`
 * (país + UF + município) a partir dos endereços existentes e liga cada `tmf_geographic_address`
 * ao município via `administrative_city_id`.
 *
 * Toda escrita atual já faz isso (ver `OracleGeoRepository.upsertAddress` e o migrador nativo);
 * este script cobre as linhas gravadas antes da migration v29. Nunca roda no boot.
 *
 * - Dry-run por padrão: agrega as tuplas distintas e reporta totais, inválidos, incompletos e
 *   colisões de normalização (ex.: Niteroi / Niterói), sem gravar nada.
 * - `--apply` exige `--target-prefix <PREFIXO_>` (ex.: NX_DEV3_) para evitar gravar no ambiente
 *   errado por variável herdada da sessão.
 * - Idempotente e reiniciável: só toca endereços ainda sem vínculo, paginando por id (keyset),
 *   com commit por lote. Endereços incompletos/inválidos não são alterados.
 *
 * Requer `npm run build` (usa a normalização compilada em dist/).
 *
 * Uso:
 *   node scripts/backfill-administrative-city.mjs --target-prefix NX_DEV3_
 *   node scripts/backfill-administrative-city.mjs --target-prefix NX_DEV3_ --apply [--batch-size 5000]
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import {
  administrativeCityNaturalKey,
  normalizeAdministrativeCity,
} from '../dist/src/modules/geo/administrative-city.js';
import { createCanonicalId } from '../dist/src/shared/utils/canonical-id.js';

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
    throw new Error(`--target-prefix inválido "${targetPrefix}" (ex.: NX_DEV3_).`);
  }
  process.env.ORACLE_OBJECT_PREFIX = targetPrefix;
}
if (APPLY && !targetPrefix) {
  throw new Error('--apply exige --target-prefix <PREFIXO_> explícito (ex.: NX_DEV3_).');
}

const BATCH_SIZE = Number(valueOf('--batch-size') ?? 5000);
if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 20000) {
  throw new Error('--batch-size deve ser inteiro entre 1 e 20000.');
}
const IN_CHUNK = 500;

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const toNumber = (row, key) => Number(row?.[key] ?? row?.[key.toUpperCase()] ?? 0);

async function scalar(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return toNumber(rows[0], 'n');
}

/** Agrega as tuplas livres distintas dos endereços ainda sem vínculo (uma varredura). */
async function aggregateUnlinkedTuples(client) {
  const { rows } = await client.query(
    `SELECT country, state_or_province, city, COUNT(*) AS n
       FROM tmf_geographic_address
      WHERE administrative_city_id IS NULL
      GROUP BY country, state_or_province, city`,
  );
  const groups = new Map();
  let invalid = 0;
  let incomplete = 0;
  let eligible = 0;
  for (const row of rows) {
    const count = toNumber(row, 'n');
    const raw = {
      country: row.country ?? row.COUNTRY,
      stateOrProvince: row.state_or_province ?? row.STATE_OR_PROVINCE,
      city: row.city ?? row.CITY,
    };
    const tuple = normalizeAdministrativeCity(raw);
    if (!tuple) {
      if (!String(raw.city ?? '').trim() || !String(raw.stateOrProvince ?? '').trim()) {
        incomplete += count;
      } else {
        invalid += count;
      }
      continue;
    }
    eligible += count;
    const key = administrativeCityNaturalKey(tuple);
    const group = groups.get(key) ?? { tuple, spellings: new Map(), total: 0 };
    group.spellings.set(tuple.cityName, (group.spellings.get(tuple.cityName) ?? 0) + count);
    group.total += count;
    groups.set(key, group);
  }
  // Grafia canônica: a mais frequente; desempate lexical determinístico.
  for (const group of groups.values()) {
    const [best] = [...group.spellings.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'),
    );
    group.tuple = { ...group.tuple, cityName: best[0] };
  }
  const collisions = [...groups.values()].filter((group) => group.spellings.size > 1);
  return { groups, eligible, invalid, incomplete, collisions };
}

async function resolveCityIds(client, groups) {
  const ids = new Map();
  const { rows } = await client.query(
    `SELECT id, country_code, state_code, city_key FROM geo_administrative_city`,
  );
  for (const row of rows) {
    const key = `${row.country_code ?? row.COUNTRY_CODE}|${row.state_code ?? row.STATE_CODE}|${row.city_key ?? row.CITY_KEY}`;
    ids.set(key, row.id ?? row.ID);
  }
  let created = 0;
  for (const [key, group] of groups) {
    if (ids.has(key)) continue;
    const id = createCanonicalId();
    const { tuple } = group;
    await client.query(
      `INSERT INTO geo_administrative_city
         (id, country_code, country_name, state_code, city_name, city_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tuple.countryCode, tuple.countryName, tuple.stateCode, tuple.cityName, tuple.cityKey],
    );
    ids.set(key, id);
    created += 1;
  }
  return { ids, created };
}

async function main() {
  const client = await openLoaderDb();
  try {
    console.log(`Ambiente: ${process.env.ORACLE_OBJECT_PREFIX}`);
    const total = await scalar(client, `SELECT COUNT(*) AS n FROM tmf_geographic_address`);
    const linked = await scalar(
      client,
      `SELECT COUNT(*) AS n FROM tmf_geographic_address WHERE administrative_city_id IS NOT NULL`,
    );
    const existingCities = await scalar(
      client,
      `SELECT COUNT(*) AS n FROM geo_administrative_city`,
    );
    console.log(
      `Endereços: ${total}; já vinculados: ${linked}; municípios no diretório: ${existingCities}`,
    );

    const t0 = Date.now();
    const { groups, eligible, invalid, incomplete, collisions } =
      await aggregateUnlinkedTuples(client);
    console.log(
      `Sem vínculo e elegíveis: ${eligible}; incompletos (sem UF/município): ${incomplete}; ` +
        `UF/país inválidos: ${invalid}; tuplas canônicas distintas: ${groups.size} ` +
        `(agregação em ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
    if (collisions.length > 0) {
      console.log(`Colisões de normalização consolidadas: ${collisions.length}`);
      for (const group of collisions.slice(0, 20)) {
        console.log(
          `  ${group.tuple.stateCode} ${group.tuple.cityName}: ${[...group.spellings.keys()].join(' | ')}`,
        );
      }
    }
    console.log(`Lotes estimados (${BATCH_SIZE} por lote): ${Math.ceil(eligible / BATCH_SIZE)}`);

    if (eligible === 0) {
      console.log('Nada a fazer.');
      return;
    }
    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Rode com --apply para executar. —');
      return;
    }

    await client.query('BEGIN');
    const { ids, created } = await resolveCityIds(client, groups);
    await client.query('COMMIT');
    console.log(`Diretório: ${created} município(s) criado(s), ${ids.size} no total.`);

    // Oracle trata '' como NULL; um espaço ordena antes de qualquer UUID.
    let lastId = ' ';
    let linkedNow = 0;
    let batches = 0;
    for (;;) {
      const { rows } = await client.query(
        `SELECT id, country, state_or_province, city
           FROM tmf_geographic_address
          WHERE administrative_city_id IS NULL AND id > $1
          ORDER BY id
          FETCH FIRST ${BATCH_SIZE} ROWS ONLY`,
        [lastId],
      );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].id ?? rows[rows.length - 1].ID;
      const byCity = new Map();
      for (const row of rows) {
        const tuple = normalizeAdministrativeCity({
          country: row.country ?? row.COUNTRY,
          stateOrProvince: row.state_or_province ?? row.STATE_OR_PROVINCE,
          city: row.city ?? row.CITY,
        });
        if (!tuple) continue;
        const cityId = ids.get(administrativeCityNaturalKey(tuple));
        if (!cityId) continue;
        const list = byCity.get(cityId) ?? [];
        list.push(row.id ?? row.ID);
        byCity.set(cityId, list);
      }
      const bt = Date.now();
      await client.query('BEGIN');
      for (const [cityId, addressIds] of byCity) {
        for (const part of chunk(addressIds, IN_CHUNK)) {
          const placeholders = part.map((_, index) => `$${index + 2}`).join(', ');
          const result = await client.query(
            `UPDATE tmf_geographic_address
                SET administrative_city_id = $1
              WHERE administrative_city_id IS NULL AND id IN (${placeholders})`,
            [cityId, ...part],
          );
          linkedNow += result.rowCount ?? 0;
        }
      }
      await client.query('COMMIT');
      batches += 1;
      console.log(
        `[lote ${batches}] cursor=${lastId} vinculados=${linkedNow} (${Date.now() - bt}ms)`,
      );
    }

    await client.gatherStats('geo_administrative_city');
    await client.gatherStats('tmf_geographic_address');
    console.log(
      `Concluído: ${linkedNow} endereço(s) vinculado(s) em ${batches} lote(s). Estatísticas atualizadas.`,
    );

    const pending = await scalar(
      client,
      `SELECT COUNT(*) AS n FROM tmf_geographic_address WHERE administrative_city_id IS NULL`,
    );
    const orphans = await scalar(
      client,
      `SELECT COUNT(*) AS n FROM tmf_geographic_address a
        WHERE a.administrative_city_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM geo_administrative_city c WHERE c.id = a.administrative_city_id)`,
    );
    console.log(
      `Verificação: sem vínculo restantes=${pending} (incompletos/inválidos); FKs órfãs=${orphans}.`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
