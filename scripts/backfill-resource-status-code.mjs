#!/usr/bin/env node
/**
 * Migra a characteristic livre `substatus` dos recursos para `status_code`, resolvido no catálogo
 * `tmf_resource_status_catalog` (issue #171).
 *
 * O script NÃO remove `substatus`: ele fica como rastreabilidade da origem nesta fase. Novas leituras
 * passam a preferir `status_code`; a remoção só poderá ocorrer depois da homologação do backfill.
 *
 * Uso:
 *   node scripts/backfill-resource-status-code.mjs            # dry-run
 *   node scripts/backfill-resource-status-code.mjs --apply    # atualiza em lotes
 *
 * Requer `npm run build` (importa o resolver canônico de `dist/`) e a migração já aplicada no banco.
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import { resolveStatusCode } from '../dist/src/modules/resource/status-catalog.js';

loadEnv({ quiet: true });
const APPLY = process.argv.includes('--apply');
const CHUNK_SIZE = 500;

const chunks = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function loadPending(db) {
  if (db.provider === 'oracle') {
    return (
      await db.query(
        `SELECT r.id, jt.substatus
           FROM tmf_physical_resource r,
                JSON_TABLE(r.characteristics, '$[*]' COLUMNS (
                  char_name VARCHAR2(255) PATH '$.name',
                  substatus VARCHAR2(4000) PATH '$.value'
                )) jt
          WHERE r.status_code IS NULL AND jt.char_name = 'substatus'`,
      )
    ).rows;
  }
  return (
    await db.query(
      `SELECT r.id, c->>'value' AS substatus
         FROM tmf_physical_resource r
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.characteristics, '[]')::jsonb) c
        WHERE r.status_code IS NULL AND c->>'name' = 'substatus'`,
    )
  ).rows;
}

async function main() {
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');
  const db = await openLoaderDb();
  console.log(`Provider: ${db.provider}`);

  try {
    const pending = await loadPending(db);
    const idsByCode = new Map();
    const unknown = new Map();

    for (const row of pending) {
      const code = resolveStatusCode(row.substatus);
      if (!code) {
        unknown.set(row.substatus, (unknown.get(row.substatus) ?? 0) + 1);
        continue;
      }
      const ids = idsByCode.get(code) ?? [];
      ids.push(row.id);
      idsByCode.set(code, ids);
    }

    console.log(`Recursos com substatus e status_code vazio: ${pending.length}`);
    for (const [code, ids] of [...idsByCode.entries()].sort()) {
      console.log(`  ${code}: ${ids.length}`);
    }
    if (unknown.size > 0) {
      console.log('\nSem mapeamento (não serão alterados):');
      for (const [value, total] of [...unknown.entries()].sort()) console.log(`  ${total} × ${value}`);
    }

    if (!APPLY) return;
    await db.query('BEGIN');
    let updated = 0;
    for (const [code, ids] of idsByCode) {
      for (const batch of chunks(ids, CHUNK_SIZE)) {
        const placeholders = batch.map((_, index) => `$${index + 2}`).join(', ');
        const result = await db.query(
          `UPDATE tmf_physical_resource
              SET status_code = $1, updated_at = CURRENT_TIMESTAMP
            WHERE status_code IS NULL AND id IN (${placeholders})`,
          [code, ...batch],
        );
        updated += result.rowCount ?? 0;
      }
    }
    await db.query('COMMIT');
    console.log(`\nAtualizados: ${updated}. Sem mapeamento: ${[...unknown.values()].reduce((a, b) => a + b, 0)}.`);
  } catch (error) {
    if (APPLY) await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
