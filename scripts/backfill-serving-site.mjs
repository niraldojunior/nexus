#!/usr/bin/env node
/**
 * Vincula recursos de planta externa à estação que os atende.
 *
 * O problema: a carga do Netwin (`load-recursos-netwin.mjs`) trouxe 24.598
 * recursos cuja única ligação com a estação é a sigla escondida no JSON —
 * `characteristics[_origin].extra.sigla = "ICI"`. A árvore de navegação do módulo
 * Geo precisa expandir uma estação e listar sua planta; varrer 24.6 mil linhas de
 * JSON a cada clique não escala.
 *
 * O que este script faz, por estação:
 *   · grava a characteristic `servingSite` = id do GeographicSite (a verdade do
 *     modelo — extensão V.tal via characteristic, como manda o cânone C1);
 *   · grava a coluna indexada `serving_site_id`, que é só armazenamento derivado
 *     e é o que a consulta da árvore usa.
 *
 * Idempotente: só toca em linha com `serving_site_id` nulo, e remove qualquer
 * `servingSite` anterior antes de reescrever. Rodar duas vezes não duplica nada.
 *
 * Uso:
 *   node scripts/backfill-serving-site.mjs            # dry-run (padrão)
 *   node scripts/backfill-serving-site.mjs --apply    # grava
 */

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ quiet: true });

const APPLY = process.argv.slice(2).includes('--apply');
const DB_URL = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;

// "Fonseca (FSA)" → "FSA". Mesma convenção de nome de load-estacoes-netwin.mjs.
const siglaOf = (name) => (String(name ?? '').match(/\(([^)]+)\)\s*$/) || [])[1] ?? null;

// Predicado compartilhado entre a contagem do dry-run e o UPDATE: o recurso ainda
// não tem estação e traz esta sigla no _origin.
const MATCH_SIGLA = `
  r.serving_site_id IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(r.characteristics::jsonb) c
     WHERE c->>'group' = '_origin' AND c->>'name' = 'extra' AND c->'value'->>'sigla' = $1
  )`;

async function main() {
  if (!DB_URL) throw new Error('DATABASE_URL_DEV (ou DATABASE_URL) não definido no .env');

  const pool = new pg.Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  const client = await pool.connect();

  try {
    // A coluna nasce em MIGRATIONS_SQL, que só roda quando o backend sobe. Repetir
    // aqui (é idempotente) deixa o script rodar numa base ainda não migrada.
    await client.query(`ALTER TABLE tmf_physical_resource ADD COLUMN IF NOT EXISTS serving_site_id TEXT`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_tmf_physical_resource_serving_site ON tmf_physical_resource(serving_site_id)`,
    );

    const { rows: stations } = await client.query(
      `SELECT s.id, s.name
         FROM tmf_geographic_site s
         JOIN tmf_geographic_site_specification sp ON sp.id = s.site_specification_id
        WHERE sp.category = 'Site' AND s.status <> 'terminated'
        ORDER BY s.name`,
    );

    const siteBySigla = new Map();
    const ambiguas = [];
    for (const station of stations) {
      const sigla = siglaOf(station.name);
      if (!sigla) continue;
      if (siteBySigla.has(sigla)) {
        ambiguas.push(`${sigla} → ${station.name}`);
        continue;
      }
      siteBySigla.set(sigla, station.id);
    }

    console.log(`Estações ativas : ${siteBySigla.size} (${[...siteBySigla.keys()].join(', ')})`);
    if (ambiguas.length) {
      console.log(`\n⚠ sigla repetida entre estações ativas — a primeira ganha:`);
      for (const item of ambiguas) console.log('   ', item);
    }

    // Panorama do que está sem estação, agrupado pela sigla que o dado traz.
    const { rows: pendentes } = await client.query(
      `SELECT COALESCE(c->'value'->>'sigla', '(sem sigla)') AS sigla,
              r.resource_type,
              count(*)::int AS n
         FROM tmf_physical_resource r
         LEFT JOIN LATERAL (
                SELECT c FROM jsonb_array_elements(r.characteristics::jsonb) c
                 WHERE c->>'group' = '_origin' AND c->>'name' = 'extra'
                 LIMIT 1
              ) origem ON TRUE
        WHERE r.serving_site_id IS NULL
        GROUP BY 1, 2
        ORDER BY 1, 2`,
    );

    let aVincular = 0;
    let semEstacao = 0;
    console.log('\nRecursos sem estação:');
    for (const row of pendentes) {
      const resolvida = siteBySigla.has(row.sigla);
      if (resolvida) aVincular += row.n;
      else semEstacao += row.n;
      console.log(`  ${row.sigla.padEnd(12)} ${String(row.resource_type ?? '-').padEnd(10)} ${String(row.n).padStart(6)}${resolvida ? '' : '   ← sem estação correspondente'}`);
    }
    console.log(`\n  a vincular : ${aVincular}`);
    console.log(`  sem match  : ${semEstacao}`);

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
      return;
    }

    await client.query('BEGIN');
    let total = 0;
    for (const [sigla, siteId] of siteBySigla) {
      const { rowCount } = await client.query(
        `UPDATE tmf_physical_resource r
            SET serving_site_id = $2,
                characteristics = (
                  COALESCE(
                    (SELECT jsonb_agg(c)
                       FROM jsonb_array_elements(r.characteristics::jsonb) c
                      WHERE c->>'name' <> 'servingSite'),
                    '[]'::jsonb
                  ) || jsonb_build_array(
                    jsonb_build_object('name', 'servingSite', 'value', $2::text, 'valueType', 'string')
                  )
                )::text,
                updated_at = now()
          WHERE ${MATCH_SIGLA}`,
        [sigla, siteId],
      );
      total += rowCount ?? 0;
      console.log(`  ${sigla.padEnd(6)} → ${rowCount} recurso(s)`);
    }

    const { rows: [check] } = await client.query(
      `SELECT count(*)::int AS n FROM tmf_physical_resource WHERE serving_site_id IS NOT NULL`,
    );
    await client.query('COMMIT');

    console.log(`\nGravado: ${total} vínculo(s). Total com estação na base: ${check.n}.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
