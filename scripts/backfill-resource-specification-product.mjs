#!/usr/bin/env node
/**
 * Promove `manufacturer` (relacionado a Party com PartyRole 'manufacturer'), `model`
 * (characteristic) e `resourceLayerId` (tmf_resource_layer 'gpon_network' para GPON) para a
 * ResourceSpecification (issue #171).
 *
 * Elimina characteristics legadas obsoletas ('manufacturer' e 'networkType') das specs.
 *
 * Uso:
 *   node scripts/backfill-resource-specification-product.mjs            # dry-run
 *   node scripts/backfill-resource-specification-product.mjs --apply    # atualiza specs e cria parties
 *
 * Requer `npm run build` e as mesmas env vars dos loaders.
 */

import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });
const APPLY = process.argv.includes('--apply');
const TARGET_TYPES = ['CTO', 'Splitter'];

const parseJson = (raw) => {
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

async function findOrCreateManufacturerParty(db, manufacturerName) {
  const name = manufacturerName.trim();
  const existingParty = (
    await db.query(
      `SELECT id, name FROM tmf_party WHERE LOWER(name) = LOWER($1) AND tenant_id = 'default' LIMIT 1`,
      [name],
    )
  ).rows[0];

  let partyId = existingParty?.id;
  if (!partyId) {
    partyId = randomUUID();
    if (APPLY) {
      await db.query(
        `INSERT INTO tmf_party (id, tenant_id, name, party_type, status, party_characteristic)
         VALUES ($1, 'default', $2, 'Organization', 'active', '[]')`,
        [partyId, name],
      );
    }
  }

  const existingRole = (
    await db.query(
      `SELECT id FROM tmf_party_role WHERE party_id = $1 AND name = 'manufacturer' AND tenant_id = 'default' LIMIT 1`,
      [partyId],
    )
  ).rows[0];

  if (!existingRole && APPLY) {
    const roleId = randomUUID();
    await db.query(
      `INSERT INTO tmf_party_role (id, tenant_id, party_id, name, status, party_role_characteristic)
       VALUES ($1, 'default', $2, 'manufacturer', 'active', '[]')`,
      [roleId, partyId],
    );
  }

  return { id: partyId, name };
}

async function main() {
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');
  const db = await openLoaderDb();
  console.log(`Provider: ${db.provider}`);

  try {
    const gponLayer = (
      await db.query(
        `SELECT id, code, name FROM tmf_resource_layer WHERE code = 'gpon_network' AND tenant_id = 'default' LIMIT 1`,
      )
    ).rows[0];

    const placeholders = TARGET_TYPES.map((_, index) => `$${index + 1}`).join(', ');
    const specs = (
      await db.query(
        `SELECT id, name, resource_type, resource_layer_id, related_party, characteristics
           FROM tmf_resource_specification
          WHERE resource_type IN (${placeholders})
          ORDER BY resource_type, name, id`,
        TARGET_TYPES,
      )
    ).rows;

    const updates = [];
    for (const spec of specs) {
      let characteristics = parseJson(spec.characteristics);
      let relatedParty = parseJson(spec.related_party);
      let resourceLayerId = spec.resource_layer_id;

      // 1. Limpar characteristics obsoletas ('manufacturer' e 'networkType')
      const hadObsoleteChars = characteristics.some((c) => c?.name === 'manufacturer' || c?.name === 'networkType');
      characteristics = characteristics.filter((c) => c?.name !== 'manufacturer' && c?.name !== 'networkType');

      let hasChanges = hadObsoleteChars;

      // 2. Camada GPON para CTO/Splitter se ainda não associada
      if (!resourceLayerId && gponLayer) {
        resourceLayerId = gponLayer.id;
        hasChanges = true;
      }

      // 3. Promover model se ausente
      if (!characteristics.some((c) => c?.name === 'model')) {
        const candidate = await mostFrequent(db, spec.id, 'model');
        if (candidate) {
          characteristics.push({ name: 'model', value: candidate.value, valueType: 'string' });
          hasChanges = true;
        }
      }

      // 4. Fabricante como RelatedParty manufacturer se ausente
      let manufacturerParty = relatedParty.find((p) => p.role === 'manufacturer');
      if (!manufacturerParty) {
        const candidate = await mostFrequent(db, spec.id, 'manufacturer');
        if (candidate) {
          const party = await findOrCreateManufacturerParty(db, candidate.value);
          relatedParty.push({
            id: party.id,
            name: party.name,
            role: 'manufacturer',
            '@referredType': 'Organization',
          });
          hasChanges = true;
        }
      }

      if (hasChanges) {
        updates.push({
          spec,
          resourceLayerId,
          relatedParty,
          characteristics,
        });
      }
    }

    console.log(`Specs ${TARGET_TYPES.join('/')}: ${specs.length}. Com atualização: ${updates.length}.`);
    for (const item of updates) {
      const mfg = item.relatedParty.find((p) => p.role === 'manufacturer');
      const mdl = item.characteristics.find((c) => c.name === 'model');
      console.log(
        `  [${item.spec.resource_type}] ${item.spec.name}: layer="${item.resourceLayerId ?? 'sem'}" manufacturer="${mfg?.name ?? 'sem'}" model="${mdl?.value ?? 'sem'}"`,
      );
    }
    if (!APPLY || updates.length === 0) return;

    await db.query('BEGIN');
    for (const item of updates) {
      await db.query(
        `UPDATE tmf_resource_specification
            SET resource_layer_id = $1,
                related_party = $2,
                characteristics = $3,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $4`,
        [
          item.resourceLayerId,
          JSON.stringify(item.relatedParty),
          JSON.stringify(item.characteristics),
          item.spec.id,
        ],
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
