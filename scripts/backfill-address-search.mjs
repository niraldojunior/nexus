#!/usr/bin/env node
/**
 * Backfill único de `street_search`/`street_nr_search`/`city_search`/`postcode_search` em
 * `tmf_geographic_address`, para linhas gravadas antes de essas colunas existirem (toda escrita
 * atual já as popula — ver `PostgresGeoRepository`).
 *
 * Isto era um `UPDATE ... WHERE col IS NULL OR col IS NULL OR ...` dentro de MIGRATIONS_SQL,
 * rodando a cada boot com DATABASE_AUTO_SCHEMA=true — a condição em OR sobre quatro colunas não
 * pode ser servida por um único índice, então virava full table scan de `tmf_geographic_address`
 * (783 mil linhas hoje) toda vez, mesmo já não havendo nada para atualizar. Rodar este script uma
 * vez por ambiente (após a migração da coluna, antes ou depois de qualquer carga) substitui esse
 * custo recorrente.
 *
 * Uso:
 *   node scripts/backfill-address-search.mjs            # dry-run: só mostra quantas linhas faltam
 *   node scripts/backfill-address-search.mjs --apply    # grava
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.includes('--apply');

const MISSING_WHERE = `street_search IS NULL OR street_nr_search IS NULL OR city_search IS NULL OR postcode_search IS NULL`;

const UPDATE_SQL = `
  UPDATE tmf_geographic_address
     SET street_search = LOWER(TRANSLATE(street_name,
           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
           'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
         street_nr_search = LOWER(REPLACE(REPLACE(COALESCE(street_nr, ''), ' ', ''), '-', '')),
         city_search = LOWER(TRANSLATE(COALESCE(city, ''),
           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
           'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
         postcode_search = REPLACE(REPLACE(COALESCE(postcode, ''), ' ', ''), '-', '')
   WHERE ${MISSING_WHERE}`;

async function main() {
  const client = await openLoaderDb();
  try {
    const { rows } = await client.query(
      `SELECT COUNT(*) AS n FROM tmf_geographic_address WHERE ${MISSING_WHERE}`,
    );
    const missing = Number(rows[0]?.n ?? rows[0]?.N ?? 0);
    console.log(`Endereços sem search normalizado: ${missing}`);

    if (missing === 0) {
      console.log('Nada a fazer.');
      return;
    }
    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Rode com --apply para executar. —');
      return;
    }

    const t0 = Date.now();
    await client.query('BEGIN');
    await client.query(UPDATE_SQL);
    await client.query('COMMIT');
    console.log(`Gravado em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

    await client.gatherStats('tmf_geographic_address');
    console.log('Estatísticas atualizadas.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
