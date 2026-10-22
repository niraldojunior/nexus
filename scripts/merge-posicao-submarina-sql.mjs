#!/usr/bin/env node
/**
 * Unifica as specs de posição submarina em uma só: "Posição Submarina" (issue #406).
 *
 * O importador de cabos (#401) criava uma spec por tipo de ponto — SUBMARINE_BU, SUBMARINE_REPEATER
 * e SUBMARINE_EQUALIZER — e a árvore de Locais mostrava "Posição Submarina OLD" duas vezes ao lado
 * de "Posição Submarina". É o mesmo conceito, então ficam os locais numa spec só.
 *
 * Mesma abordagem de scripts/merge-sala-into-room-sql.mjs (SQL direto, não um PATCH por site).
 * Numa única transação:
 *   1. renomeia o código da canônica (hoje SUBMARINE_REPEATER) para SUBMARINE_POSITION, que é o
 *      código que o importador passa a usar — sem isso, ele recriaria a spec na próxima carga;
 *   2. repontua geographic_site das specs duplicadas (BU e Equalizador) para a canônica;
 *   3. aposenta as duplicadas (lifecycle_status='Retired', C6 — nada é excluído).
 *
 * Idempotente: sem duplicata ativa, não há o que migrar.
 *
 * Uso:
 *   node scripts/merge-posicao-submarina-sql.mjs --environment NX_DEV16_            # dry-run
 *   node scripts/merge-posicao-submarina-sql.mjs --environment NX_DEV16_ --apply    # executa
 *
 * Requer `npm run build` (dist/) e ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD.
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb, resolveLoaderEnvironment } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.includes('--apply');
const CANONICAL_CODE = 'SUBMARINE_POSITION';
const LEGACY_CANONICAL_CODE = 'SUBMARINE_REPEATER';
const DUPLICATE_CODES = ['SUBMARINE_BU', 'SUBMARINE_EQUALIZER'];

async function main() {
  const prefix = resolveLoaderEnvironment();
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');
  console.log(`Ambiente: ${prefix}`);
  const db = await openLoaderDb();

  try {
    const { rows: specs } = await db.query(
      `SELECT id, code, name, lifecycle_status FROM geographic_site_specification
        WHERE code IN ($1, $2, $3, $4)`,
      [CANONICAL_CODE, LEGACY_CANONICAL_CODE, ...DUPLICATE_CODES],
    );
    const active = specs.filter((spec) => spec.lifecycle_status === 'Active');
    const canonical =
      active.find((spec) => spec.code === CANONICAL_CODE) ??
      active.find((spec) => spec.code === LEGACY_CANONICAL_CODE);
    if (!canonical) throw new Error('spec "Posição Submarina" ativa não encontrada.');
    console.log(`Canônica: "${canonical.name}" (${canonical.code}) — ${canonical.id}`);

    const duplicates = active.filter(
      (spec) => DUPLICATE_CODES.includes(spec.code) && spec.id !== canonical.id,
    );
    const renameNeeded = canonical.code !== CANONICAL_CODE;
    if (duplicates.length === 0 && !renameNeeded) {
      console.log('Nada para migrar: nenhuma spec duplicada ativa.');
      return;
    }

    await db.query('BEGIN');
    if (renameNeeded) {
      console.log(`[código] ${canonical.code} -> ${CANONICAL_CODE}`);
      if (APPLY) {
        await db.query(`UPDATE geographic_site_specification SET code = $1 WHERE id = $2`, [
          CANONICAL_CODE,
          canonical.id,
        ]);
      }
    }
    for (const dup of duplicates) {
      const { rows } = await db.query(
        `SELECT COUNT(*) AS count FROM geographic_site WHERE site_specification_id = $1`,
        [dup.id],
      );
      const count = Number(rows[0].count);
      console.log(`\n--- "${dup.name}" (${dup.code}) — ${dup.id}: ${count} local(is) ---`);
      if (!APPLY) {
        console.log(`  (dry-run — ${count} repontados e a spec aposentada)`);
        continue;
      }
      const moved = await db.query(
        `UPDATE geographic_site SET site_specification_id = $1 WHERE site_specification_id = $2`,
        [canonical.id, dup.id],
      );
      await db.query(
        `UPDATE geographic_site_specification SET lifecycle_status = $1 WHERE id = $2`,
        ['Retired', dup.id],
      );
      console.log(`  repontados: ${moved.rowCount}; spec aposentada (Retired).`);
    }
    await db.query(APPLY ? 'COMMIT' : 'ROLLBACK');
    if (APPLY) console.log('\nTransação confirmada.');
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
