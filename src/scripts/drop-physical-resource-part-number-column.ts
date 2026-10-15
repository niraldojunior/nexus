// Script de DROP físico da coluna `part_number` de `resource_physical`.
//
// Contexto:
// `part_number` deixou de fazer parte do contrato de PhysicalResource. O fornecedor de aquisição
// permanece em `related_party` com papel `vendor`; a identificação de catálogo pertence à
// ResourceSpecification. A coluna só pode ser removida depois de sua auditoria explícita.
//
// Uso:
//   1. Auditoria prévia (seguro, somente leitura):
//      ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-physical-resource-part-number-column.ts
//
//   2. Aplicação física (irreversível no Oracle):
//      ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-physical-resource-part-number-column.ts --apply --confirm-drop-physical-resource-part-number
//
//   3. Se houver valores legados e a decisão for descartá-los:
//      ... --apply --confirm-drop-physical-resource-part-number --allow-legacy-data
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const apply = hasFlag('--apply');
const confirmed = hasFlag('--confirm-drop-physical-resource-part-number');
const allowLegacyData = hasFlag('--allow-legacy-data');

if (apply && !confirmed) {
  throw new Error(
    'A remoção física exige --apply --confirm-drop-physical-resource-part-number. Sem flags, o script apenas audita.',
  );
}

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const client = createDatabaseClient(config.database);

const TABLE_NAME = 'resource_physical';
const COLUMN_NAME = 'part_number';

const columnExists = async (objectPrefix: string): Promise<boolean> => {
  const row = await client.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM user_tab_cols WHERE table_name = UPPER(?) AND column_name = UPPER(?)`,
    [`${objectPrefix}${TABLE_NAME}`, COLUMN_NAME],
  );
  return Number(row?.count ?? 0) > 0;
};

const run = async (): Promise<void> => {
  const objectPrefix = config.database.objectPrefix ?? '';

  try {
    await client.initialize();

    process.stdout.write(`\n=== Auditoria / Remoção física: ${TABLE_NAME}.${COLUMN_NAME} ===\n`);
    process.stdout.write(`Ambiente: ${config.database.provider} (prefixo: "${objectPrefix}")\n\n`);

    const hasColumn = await columnExists(objectPrefix);
    process.stdout.write(
      `Status da coluna no Oracle: ${hasColumn ? 'PRESENTE' : 'AUSENTE (já removida)'}\n\n`,
    );
    if (!hasColumn) {
      process.stdout.write('A coluna já foi removida. Nenhuma ação necessária.\n');
      return;
    }

    const [totalRow, populatedRow] = await Promise.all([
      client.queryOne<{ total: number | string }>(`SELECT COUNT(*) AS total FROM ${TABLE_NAME}`),
      client.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM ${TABLE_NAME} WHERE ${COLUMN_NAME} IS NOT NULL`,
      ),
    ]);
    const total = Number(totalRow?.total ?? 0);
    const populated = Number(populatedRow?.count ?? 0);

    process.stdout.write('Auditoria de dados:\n');
    process.stdout.write(`  - Total de instâncias em ${TABLE_NAME}: ${total}\n`);
    process.stdout.write(`  - Linhas com ${COLUMN_NAME} preenchido: ${populated}\n\n`);

    if (populated > 0) {
      process.stdout.write('Amostra de registros com Part Number legado:\n');
      const samples = await client.queryMany<Record<string, unknown>>(
        `SELECT id, name, resource_specification_id, ${COLUMN_NAME}
           FROM ${TABLE_NAME}
          WHERE ${COLUMN_NAME} IS NOT NULL
          FETCH FIRST 5 ROWS ONLY`,
      );
      for (const sample of samples) {
        process.stdout.write(
          `  - id: ${sample.id} | name: ${sample.name} | part_number: ${sample[COLUMN_NAME]} | specId: ${sample.resource_specification_id}\n`,
        );
      }
      process.stdout.write('\n');
    }

    if (!apply) {
      process.stdout.write(
        'Modo auditoria concluído. Nenhuma alteração foi realizada no schema.\n',
      );
      process.stdout.write('Para executar o DROP físico, execute:\n');
      process.stdout.write(
        `  ORACLE_OBJECT_PREFIX=${objectPrefix} npx tsx src/scripts/drop-physical-resource-part-number-column.ts --apply --confirm-drop-physical-resource-part-number\n\n`,
      );
      return;
    }

    if (populated > 0 && !allowLegacyData) {
      process.stdout.write(
        'ATENÇÃO: Existem linhas com part_number preenchido. Para confirmar o descarte desses valores legados e prosseguir com o DROP físico, adicione a flag --allow-legacy-data.\n',
      );
      return;
    }

    process.stdout.write('Executando DROP físico da coluna...\n');
    await client.execute(
      `ALTER TABLE ${TABLE_NAME} DROP COLUMN ${COLUMN_NAME} CASCADE CONSTRAINTS`,
    );
    process.stdout.write(`    DROP COLUMN ${TABLE_NAME}.${COLUMN_NAME}: removida com sucesso\n`);
    process.stdout.write('\nDROP concluído com sucesso. Schema atualizado.\n');
  } finally {
    await client.close();
  }
};

void run();
