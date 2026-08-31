#!/usr/bin/env node
/**
 * Remove de `geo_map_feature` as linhas de recurso interno (Splitter, Porta — ver
 * INTERNAL_RESOURCE_TYPES em src/modules/geo/map-visibility.ts) gravadas antes da correção do
 * filtro do write-through (map-feature-synchronizer.ts): até então ele só excluía 'Splitter',
 * então toda Porta de Splitter criada/editada pela API (ex.: load-cto-ports.mjs) entrou no
 * índice do mapa.
 *
 * DELETE cirúrgico por entity_id — não mexe no resto do índice (1.5M+ linhas), ao contrário de
 * um rebuild completo via build-map-features.mjs.
 *
 * Dry-run por default: reporta a contagem por resource_type sem apagar nada.
 *
 * Requer o dist compilado (npm run build) só indiretamente — não importa nada de dist, mas
 * segue a mesma convenção de loader-db.mjs (que sim importa).
 *
 * Uso:
 *   node scripts/prune-internal-map-features.mjs                 # dry-run, postgres
 *   node scripts/prune-internal-map-features.mjs --apply
 *   DATABASE_PROVIDER=oracle node scripts/prune-internal-map-features.mjs --apply
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv();

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const TENANT = (() => {
  const i = argv.indexOf('--tenant');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 'default';
})();

// Mesma lista de src/modules/geo/map-visibility.ts (INTERNAL_RESOURCE_TYPES) — duplicada aqui
// em vez de importada de dist/ porque este script só faz DELETE por entity_id resolvido via
// SQL, sem tocar nas funções TS.
const INTERNAL_RESOURCE_TYPES = ['Splitter', 'Port'];

async function main() {
  const client = await openLoaderDb();
  try {
    console.log(`prune-internal-map-features: provider=${client.provider} tenant=${TENANT} apply=${APPLY}`);

    const typePlaceholders = INTERNAL_RESOURCE_TYPES.map((_, i) => `$${i + 2}`).join(', ');

    const preview = await client.query(
      `SELECT rs.resource_type, COUNT(*) AS n
         FROM geo_map_feature f
         JOIN tmf_physical_resource r ON r.id = f.entity_id
         JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
        WHERE f.tenant_id = $1 AND f.feature_kind = 'resource'
          AND rs.resource_type IN (${typePlaceholders})
        GROUP BY rs.resource_type
        ORDER BY rs.resource_type`,
      [TENANT, ...INTERNAL_RESOURCE_TYPES],
    );

    if (preview.rows.length === 0) {
      console.log('Nenhuma linha de recurso interno encontrada em geo_map_feature — nada a fazer.');
      return;
    }

    let total = 0;
    for (const row of preview.rows) {
      const n = Number(row.n);
      total += n;
      console.log(`  ${row.resource_type}: ${n} linha(s)`);
    }
    console.log(`Total: ${total} linha(s) de recurso interno em geo_map_feature.`);

    if (!APPLY) {
      console.log('Dry-run — rode com --apply para remover.');
      return;
    }

    const result = await client.query(
      `DELETE FROM geo_map_feature
        WHERE tenant_id = $1 AND feature_kind = 'resource'
          AND entity_id IN (
                SELECT r.id FROM tmf_physical_resource r
                  JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
                 WHERE rs.resource_type IN (${typePlaceholders})
              )`,
      [TENANT, ...INTERNAL_RESOURCE_TYPES],
    );
    console.log(`Removidas ${result.rowCount ?? total} linha(s).`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
