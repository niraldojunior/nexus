// Script de DROP físico da coluna `geographic_location_id` de `tmf_physical_resource`
// (issue #254, mesmo padrão da #251 — ver drop-physical-resource-manufacturer-model-columns.ts).
//
// Contexto:
// `geographic_location_id` é um espelho morto: nenhum código de src/modules/resource/ lê ou
// escreve essa coluna — o repositório usa `place_id` como fonte real de "onde está instalado"
// (place_id sempre aponta para um GeographicSite ou GeographicLocation, C2). Só scripts de carga
// legados (load-recursos-netwin.mjs, migrate-netwin-osp.ts, migrate-netwin-infranode.ts)
// preenchiam essa coluna em paralelo a `place_id`, e pararam de fazê-lo nesta mesma issue.
//
// A coluna tem FK real (REFERENCES tmf_geographic_location(id)) — CASCADE CONSTRAINTS no DROP
// COLUMN do Oracle remove a constraint junto, sem passo manual adicional.
//
// Uso:
//   1. Auditoria prévia (seguro, somente leitura):
//      ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-physical-resource-geographic-location-id-column.ts
//
//   2. Aplicação física (irreversível no Oracle):
//      ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-physical-resource-geographic-location-id-column.ts --apply --confirm-drop-physical-resource-geographic-location-id
//
//   3. Se houver resíduos divergentes de place_id/geographic_location_id e a decisão for
//      descartá-los mesmo assim:
//      ... --apply --confirm-drop-physical-resource-geographic-location-id --allow-divergent-data
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const apply = hasFlag('--apply');
const confirmed = hasFlag('--confirm-drop-physical-resource-geographic-location-id');
const allowDivergentData = hasFlag('--allow-divergent-data');

if (apply && !confirmed) {
  throw new Error(
    'A remoção física exige --apply --confirm-drop-physical-resource-geographic-location-id. Sem flags, o script apenas audita.',
  );
}

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const client = createDatabaseClient(config.database);

const COLUMN_NAME = 'geographic_location_id';
const TABLE_NAME = 'tmf_physical_resource';

const columnExists = async (objectPrefix: string, table: string, columnName: string): Promise<boolean> => {
  const row = await client.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM user_tab_cols WHERE table_name = UPPER(?) AND column_name = UPPER(?)`,
    [`${objectPrefix}${table}`, columnName],
  );
  return Number(row?.count ?? 0) > 0;
};

const run = async (): Promise<void> => {
  const objectPrefix = config.database.objectPrefix ?? '';

  try {
    await client.initialize();

    process.stdout.write(`\n=== Auditoria / Remoção física: ${TABLE_NAME}.${COLUMN_NAME} ===\n`);
    process.stdout.write(`Ambiente: ${config.database.provider} (prefixo: "${objectPrefix}")\n\n`);

    const hasColumn = await columnExists(objectPrefix, TABLE_NAME, COLUMN_NAME);
    process.stdout.write(
      `Status da coluna no Oracle: ${hasColumn ? 'PRESENTE' : 'AUSENTE (já removida)'}\n\n`,
    );

    if (!hasColumn) {
      process.stdout.write('A coluna já foi removida. Nenhuma ação necessária.\n');
      return;
    }

    // Auditoria: quantas linhas têm o espelho preenchido, e quantas divergem de place_id — o
    // esperado é `diferentes = 0`, já que os loaders sempre gravaram o mesmo valor nas duas
    // colunas (ver comentário em load-recursos-netwin.mjs antes desta issue).
    const totalRow = await client.queryOne<{ total: number | string }>(
      `SELECT COUNT(*) AS total FROM ${TABLE_NAME}`,
    );
    const total = Number(totalRow?.total ?? 0);

    const filledRow = await client.queryOne<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM ${TABLE_NAME} WHERE ${COLUMN_NAME} IS NOT NULL`,
    );
    const filled = Number(filledRow?.count ?? 0);

    const divergentRow = await client.queryOne<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM ${TABLE_NAME}
        WHERE ${COLUMN_NAME} IS NOT NULL
          AND (place_id IS NULL OR place_id <> ${COLUMN_NAME})`,
    );
    const divergent = Number(divergentRow?.count ?? 0);

    process.stdout.write(`Auditoria de dados:\n`);
    process.stdout.write(`  - Total de instâncias em ${TABLE_NAME}: ${total}\n`);
    process.stdout.write(`  - Linhas com ${COLUMN_NAME} preenchido: ${filled}\n`);
    process.stdout.write(`  - Linhas onde ${COLUMN_NAME} diverge de place_id: ${divergent}\n\n`);

    if (divergent > 0) {
      process.stdout.write(`Amostra de registros divergentes:\n`);
      const samples = await client.queryMany<Record<string, unknown>>(
        `SELECT id, name, place_id, ${COLUMN_NAME} FROM ${TABLE_NAME}
          WHERE ${COLUMN_NAME} IS NOT NULL
            AND (place_id IS NULL OR place_id <> ${COLUMN_NAME})
          FETCH FIRST 5 ROWS ONLY`,
      );
      for (const sample of samples) {
        process.stdout.write(
          `  - id: ${sample.id} | name: ${sample.name} | place_id: ${sample.place_id ?? 'NULL'} | ${COLUMN_NAME}: ${sample[COLUMN_NAME] ?? 'NULL'}\n`,
        );
      }
      process.stdout.write('\n');
    }

    if (!apply) {
      process.stdout.write('Modo auditoria concluído. Nenhuma alteração foi realizada no schema.\n');
      process.stdout.write('Para executar o DROP físico, execute:\n');
      process.stdout.write(
        `  ORACLE_OBJECT_PREFIX=${objectPrefix} npx tsx src/scripts/drop-physical-resource-geographic-location-id-column.ts --apply --confirm-drop-physical-resource-geographic-location-id\n\n`,
      );
      return;
    }

    // Gate: divergência entre place_id e geographic_location_id é inesperada (contradiria a
    // premissa validada na issue) — exige --allow-divergent-data para confirmar o descarte.
    if (divergent > 0 && !allowDivergentData) {
      process.stdout.write(
        'ATENÇÃO: Existem linhas onde geographic_location_id diverge de place_id. Para confirmar o descarte desse resíduo e prosseguir com o DROP físico, adicione a flag --allow-divergent-data.\n',
      );
      return;
    }

    process.stdout.write('Executando DROP físico da coluna...\n');
    await client.execute(`ALTER TABLE ${TABLE_NAME} DROP COLUMN ${COLUMN_NAME} CASCADE CONSTRAINTS`);
    process.stdout.write(`    DROP COLUMN ${TABLE_NAME}.${COLUMN_NAME}: removida com sucesso\n`);

    process.stdout.write('\nDROP concluído com sucesso. Schema atualizado.\n');
  } finally {
    await client.close();
  }
};

void run();
