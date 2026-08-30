// Fase 3 do projeto "remover coluna href" (issue #169): solta o NOT NULL da coluna `href` nas 22
// tabelas TMF, nos dois providers. Pré-requisito da Fase 4 (parar de escrever href) — sem isso,
// todo INSERT falha com ORA-01400 / 23502 assim que o código parar de mandar o valor.
//
// Idempotente: reexecutar é seguro nos dois providers (Postgres não erra soltando um NOT NULL que já
// não existe; Oracle erra ORA-01451 "already nullable", que este script ignora).
//
// Uso:
//   DATABASE_PROVIDER=postgres npx tsx src/scripts/drop-href-not-null.ts
//   DATABASE_PROVIDER=oracle ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-href-not-null.ts
//
// Rodar uma vez por prefixo Oracle (DEV/HML/PRD/TEST compartilham o mesmo schema físico).
import { config as loadEnv } from 'dotenv';
import { databaseConfigOf, loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

// As 22 tabelas TMF que têm coluna `href` (ver src/shared/persistence/schema.ts).
const TABLES_WITH_HREF = [
  'tmf_geographic_location',
  'tmf_geographic_address',
  'tmf_geographic_site_specification',
  'tmf_geographic_site',
  'tmf_geographic_relationship_type',
  'tmf_resource_specification',
  'tmf_resource_category',
  'tmf_resource_type',
  'tmf_resource_function_specification',
  'tmf_physical_resource',
  'tmf_logical_resource',
  'tmf_service_specification',
  'tmf_service_category',
  'tmf_service_candidate',
  'tmf_resource_facing_service',
  'tmf_customer_facing_service',
  'tmf_service_qualification',
  'tmf_service_order',
  'tmf_resource_order',
  'tmf_party',
  'tmf_party_role',
  'research_session',
] as const;

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const client = createDatabaseClient(databaseConfigOf(config));

const isAlreadyNullable = (error: unknown): boolean =>
  error instanceof Error && /ORA-01451/.test(error.message);

// Mesmo padrão de migrate-database.ts: liga auto-schema só depois do client construído, para
// que initialize() aplique MIGRATIONS_SQL pendentes (ex.: tenant_id) em vez de só validar drift.
process.env.DATABASE_AUTO_SCHEMA = 'true';

try {
  await client.initialize();

  for (const table of TABLES_WITH_HREF) {
    const sql =
      client.provider === 'oracle'
        ? `ALTER TABLE ${table} MODIFY (href NULL)`
        : `ALTER TABLE ${table} ALTER COLUMN href DROP NOT NULL`;

    try {
      await client.run(sql);
      process.stdout.write(`OK   ${table}\n`);
    } catch (error) {
      if (isAlreadyNullable(error)) {
        process.stdout.write(`SKIP ${table} (já nullable)\n`);
        continue;
      }
      throw error;
    }
  }

  process.stdout.write(`href.NOT NULL removido em ${client.provider} — ${TABLES_WITH_HREF.length} tabelas.\n`);
} finally {
  await client.close();
}
