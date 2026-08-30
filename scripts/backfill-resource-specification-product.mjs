#!/usr/bin/env node
/**
 * Promove `manufacturer` e `model` mais frequentes das instâncias para characteristics da
 * ResourceSpecification (issue #171). Fabricante/modelo descrevem o produto do catálogo; as
 * colunas de instância permanecem nesta fase como fallback e para investigar divergências.
 *
 * Só processa specs de CTO/Splitter. Empate é resolvido deterministicamente por valor alfabético.
 * Existing characteristic ganha: o script nunca sobrescreve decisão já curada no catálogo.
 *
 * Uso:
 *   node scripts/backfill-resource-specification-product.mjs            # dry-run
 *   node scripts/backfill-resource-specification-product.mjs --apply    # atualiza specs
 *
 * Requer `npm run build` e as mesmas env vars dos loaders.
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });
const APPLY = process.argv.includes('--apply');
const TARGET_TYPES = ['CTO', 'Splitter'];

const parseCharacteristics = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

async function mostFrequent(db, specificationId, column) {
  const result = await db.query(
    `SELECT ${column} AS value, COUNT(*) AS total
       FROM tmf_physical_resource
      WHERE resource_specification_id = $1 AND ${column} IS NOT NULL
        AND TRIM(${column}) <> ''
      GROUP BY ${column}
      ORDER BY COUNT(*) DESC, ${column}
      LIMIT 1`,
    [specificationId],
  );
  return result.rows[0] ? { value: result.rows[0].value, total: Number(result.rows[0].total) } : null;
}

async function main() {
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');
  const db = await openLoaderDb();
  console.log(`Provider: ${db.provider}`);

  try {
    const placeholders = TARGET_TYPES.map((_, index) => `$${index + 1}`).join(', ');
    const specs = (
      await db.query(
        `SELECT id, name, resource_type, characteristics
           FROM tmf_resource_specification
          WHERE resource_type IN (${placeholders})
          ORDER BY resource_type, name, id`,
        TARGET_TYPES,
      )
    ).rows;

    const updates = [];
    for (const spec of specs) {
      const characteristics = parseCharacteristics(spec.characteristics);
      const existingNames = new Set(characteristics.map((item) => item?.name));
      const additions = [];
      if (!existingNames.has('manufacturer')) {
        const candidate = await mostFrequent(db, spec.id, 'manufacturer');
        if (candidate) additions.push({ name: 'manufacturer', value: candidate.value, valueType: 'string' });
      }
      if (!existingNames.has('model')) {
        const candidate = await mostFrequent(db, spec.id, 'model');
        if (candidate) additions.push({ name: 'model', value: candidate.value, valueType: 'string' });
      }
      if (additions.length > 0) updates.push({ spec, characteristics, additions });
    }

    console.log(`Specs ${TARGET_TYPES.join('/')}: ${specs.length}. Com promoção: ${updates.length}.`);
    for (const item of updates) {
      console.log(
        `  [${item.spec.resource_type}] ${item.spec.name}: ${item.additions
          .map((c) => `${c.name}="${c.value}"`)
          .join(', ')}`,
      );
    }
    if (!APPLY || updates.length === 0) return;

    await db.query('BEGIN');
    for (const item of updates) {
      await db.query(
        `UPDATE tmf_resource_specification
            SET characteristics = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [JSON.stringify([...item.characteristics, ...item.additions]), item.spec.id],
      );
    }
    await db.query('COMMIT');
    console.log(`\nAtualizadas: ${updates.length} ResourceSpecification(s).`);
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
