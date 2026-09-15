// Remove `tmf_relationship_type_catalog` e `tmf_characteristic_group_catalog` (issue #231):
// tabelas criadas com a intenção de virar o catálogo transversal de #159 (DEV-X-003), mas nunca
// ligadas a nenhum repositório/serviço em `src/`. Resource e Geographic mantêm catálogos de
// RelationshipType próprios e funcionais (`tmf_resource_relationship_type`,
// `tmf_geographic_relationship_type`) — nada os referencia.
//
// Uso (somente auditoria, seguro):
//   ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-orphan-transversal-catalogs.ts
//
// Remoção física (irreversível no Oracle — rode em cada ambiente separadamente, dev antes de prd):
//   ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-orphan-transversal-catalogs.ts --apply --confirm-drop-orphan-catalogs
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

const ORPHAN_TABLES = ['tmf_relationship_type_catalog', 'tmf_characteristic_group_catalog'] as const;

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const apply = hasFlag('--apply');
const confirmed = hasFlag('--confirm-drop-orphan-catalogs');

if (apply && !confirmed) {
  throw new Error(
    'A remoção física exige --apply --confirm-drop-orphan-catalogs. Sem flags, o script apenas audita.',
  );
}

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const client = createDatabaseClient(config.database);

const toNumber = (value: number | string): number => Number(value);

const tableExists = async (table: string): Promise<boolean> => {
  const objectName = `${config.database.objectPrefix}${table}`;
  const row = await client.queryOne<{ count: number | string }>(
    'SELECT COUNT(*) AS count FROM user_tables WHERE table_name = UPPER(?)',
    [objectName],
  );
  return toNumber(row?.count ?? 0) > 0;
};

const countRows = async (table: string): Promise<number> => {
  const row = await client.queryOne<{ count: number | string }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return toNumber(row?.count ?? 0);
};

try {
  // Auditoria nunca aplica migrations: mesmo padrão de `drop-href-columns.ts`. Com
  // DATABASE_AUTO_SCHEMA=false, drift não impede a leitura, só a escrita.
  await client.initialize();

  let totalRows = 0;
  const present: string[] = [];

  for (const table of ORPHAN_TABLES) {
    if (!(await tableExists(table))) {
      process.stdout.write(`SKIP ${table} (tabela já inexistente)\n`);
      continue;
    }
    present.push(table);
    const rows = await countRows(table);
    totalRows += rows;
    process.stdout.write(`AUDIT ${table}: ${rows} linha(s)\n`);
  }

  if (totalRows > 0) {
    throw new Error(
      `Auditoria encontrou ${totalRows} linha(s) nas tabelas órfãs. Isso contradiz a premissa de "nunca usadas" — investigue antes de remover.`,
    );
  }

  process.stdout.write(
    `Auditoria aprovada: ${present.length} tabela(s) presente(s), todas vazias.\n`,
  );

  if (!apply) {
    process.stdout.write(
      'Nenhuma alteração aplicada. Use --apply --confirm-drop-orphan-catalogs somente após revisar esta auditoria.\n',
    );
  } else {
    for (const table of present) {
      const physicalName = `${config.database.objectPrefix}${table}`;
      await client.run(`DROP TABLE ${physicalName} CASCADE CONSTRAINTS PURGE`);
      process.stdout.write(`DROP ${table}\n`);
    }
    process.stdout.write('Remoção física dos catálogos órfãos concluída no Oracle.\n');
  }
} finally {
  await client.close();
}
