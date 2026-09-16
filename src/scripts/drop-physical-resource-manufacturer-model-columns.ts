// Script de DROP físico das colunas `manufacturer` e `model` de `tmf_physical_resource`
// (issue #251, fechando o ciclo aberto pela #171).
//
// Contexto:
// A issue #171 moveu fabricante (relatedParty role=manufacturer) e modelo (characteristic 'model')
// para ResourceSpecification, alinhado a TMF639 v4 e TMF632/669. As colunas em tmf_physical_resource
// viraram informação morta.
//
// Uso:
//   1. Auditoria prévia (seguro, somente leitura):
//      ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-physical-resource-manufacturer-model-columns.ts
//
//   2. Aplicação física (irreversível no Oracle):
//      ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-physical-resource-manufacturer-model-columns.ts --apply --confirm-drop-physical-resource-manufacturer-model
//
//   3. Se houver resíduos divergentes/órfãos e a decisão for descartá-los:
//      ... --apply --confirm-drop-physical-resource-manufacturer-model --allow-divergent-data
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const apply = hasFlag('--apply');
const confirmed = hasFlag('--confirm-drop-physical-resource-manufacturer-model');
const allowDivergentData = hasFlag('--allow-divergent-data');

if (apply && !confirmed) {
  throw new Error(
    'A remoção física exige --apply --confirm-drop-physical-resource-manufacturer-model. Sem flags, o script apenas audita.',
  );
}

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const client = createDatabaseClient(config.database);

const columnExists = async (
  objectPrefix: string,
  table: string,
  columnName: string,
): Promise<boolean> => {
  const row = await client.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM user_tab_cols WHERE table_name = UPPER(?) AND column_name = UPPER(?)`,
    [`${objectPrefix}${table}`, columnName],
  );
  return Number(row?.count ?? 0) > 0;
};

const dropColumnIfExists = async (
  objectPrefix: string,
  table: string,
  columnName: string,
): Promise<boolean> => {
  if (!(await columnExists(objectPrefix, table, columnName))) {
    process.stdout.write(`    DROP COLUMN ${table}.${columnName}: coluna já inexistente\n`);
    return false;
  }
  await client.execute(`ALTER TABLE ${table} DROP COLUMN ${columnName} CASCADE CONSTRAINTS`);
  process.stdout.write(`    DROP COLUMN ${table}.${columnName}: removida com sucesso\n`);
  return true;
};

const run = async (): Promise<void> => {
  const objectPrefix = config.database.objectPrefix ?? '';

  try {
    await client.initialize();

    process.stdout.write('\n=== Auditoria / Remoção física: tmf_physical_resource (manufacturer, model) ===\n');
    process.stdout.write(`Ambiente: ${config.database.provider} (prefixo: "${objectPrefix}")\n\n`);

    const hasManufacturerCol = await columnExists(objectPrefix, 'tmf_physical_resource', 'manufacturer');
    const hasModelCol = await columnExists(objectPrefix, 'tmf_physical_resource', 'model');

    process.stdout.write(`Status das colunas no Oracle:\n`);
    process.stdout.write(`  - manufacturer: ${hasManufacturerCol ? 'PRESENTE' : 'AUSENTE (já removida)'}\n`);
    process.stdout.write(`  - model:        ${hasModelCol ? 'PRESENTE' : 'AUSENTE (já removida)'}\n\n`);

    if (!hasManufacturerCol && !hasModelCol) {
      process.stdout.write('Ambas as colunas já foram removidas. Nenhuma ação necessária.\n');
      return;
    }

    // Se as colunas existem, audita os dados persistidos
    const totalRow = await client.queryOne<{ total: number | string }>(
      'SELECT COUNT(*) AS total FROM tmf_physical_resource',
    );
    const total = Number(totalRow?.total ?? 0);

    let mfgCount = 0;
    let modelCount = 0;

    if (hasManufacturerCol) {
      const row = await client.queryOne<{ count: number | string }>(
        'SELECT COUNT(*) AS count FROM tmf_physical_resource WHERE manufacturer IS NOT NULL',
      );
      mfgCount = Number(row?.count ?? 0);
    }

    if (hasModelCol) {
      const row = await client.queryOne<{ count: number | string }>(
        'SELECT COUNT(*) AS count FROM tmf_physical_resource WHERE model IS NOT NULL',
      );
      modelCount = Number(row?.count ?? 0);
    }

    process.stdout.write(`Auditoria de dados:\n`);
    process.stdout.write(`  - Total de instâncias em tmf_physical_resource: ${total}\n`);
    process.stdout.write(`  - Linhas com manufacturer preenchido: ${mfgCount}\n`);
    process.stdout.write(`  - Linhas com model preenchido:        ${modelCount}\n\n`);

    const hasLegacyData = mfgCount > 0 || modelCount > 0;

    if (hasLegacyData) {
      process.stdout.write(`Amostra de registros com dados legados:\n`);
      const sampleCols: string[] = ['id', 'name', 'resource_specification_id'];
      if (hasManufacturerCol) sampleCols.push('manufacturer');
      if (hasModelCol) sampleCols.push('model');

      const samples = await client.queryMany<Record<string, unknown>>(
        `SELECT ${sampleCols.join(', ')} FROM tmf_physical_resource WHERE ${
          [hasManufacturerCol ? 'manufacturer IS NOT NULL' : '', hasModelCol ? 'model IS NOT NULL' : '']
            .filter(Boolean)
            .join(' OR ')
        } FETCH FIRST 5 ROWS ONLY`,
      );
      for (const sample of samples) {
        process.stdout.write(
          `  - id: ${sample.id} | name: ${sample.name} | mfg: ${sample.manufacturer ?? 'NULL'} | model: ${sample.model ?? 'NULL'} | specId: ${sample.resource_specification_id}\n`,
        );
      }
      process.stdout.write('\n');
    }

    if (!apply) {
      process.stdout.write('Modo auditoria concluído. Nenhuma alteração foi realizada no schema.\n');
      process.stdout.write('Para executar o DROP físico, execute:\n');
      process.stdout.write(
        `  ORACLE_OBJECT_PREFIX=${objectPrefix} npx tsx src/scripts/drop-physical-resource-manufacturer-model-columns.ts --apply --confirm-drop-physical-resource-manufacturer-model\n\n`,
      );
      return;
    }

    // Gate: se há dados e não foi passado --allow-divergent-data, confirma que os dados foram revisados
    if (hasLegacyData && !allowDivergentData) {
      process.stdout.write(
        'ATENÇÃO: Existem linhas com manufacturer/model legados preenchidos. Para confirmar o descarte desses resíduos e prosseguir com o DROP físico, adicione a flag --allow-divergent-data.\n',
      );
      return;
    }

    // Executa o DROP físico
    process.stdout.write('Executando DROP físico das colunas...\n');
    if (hasManufacturerCol) {
      await dropColumnIfExists(objectPrefix, 'tmf_physical_resource', 'manufacturer');
    }
    if (hasModelCol) {
      await dropColumnIfExists(objectPrefix, 'tmf_physical_resource', 'model');
    }

    process.stdout.write('\nDROP concluído com sucesso. Schema atualizado.\n');
  } finally {
    await client.close();
  }
};

void run();
