// Fase 3 do projeto "remover coluna href" (issue #169): solta o NOT NULL da coluna `href` nas 22
// tabelas TMF Oracle. Pré-requisito da Fase 4 (parar de escrever href) — sem isso, todo INSERT falha
// com ORA-01400 assim que o código parar de mandar o valor.
//
// Idempotente: Oracle retorna ORA-01451 quando a coluna já é nullable, e o script ignora esse caso.
//
// Uso:
//   ORACLE_OBJECT_PREFIX=NEXUS_DEV_ npx tsx src/scripts/drop-href-not-null.ts
//
// Rodar uma vez por prefixo Oracle (DEV/HML/PRD/TEST compartilham o mesmo schema físico).
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../shared/config/env.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

// As 22 tabelas TMF que têm coluna `href` (ver src/shared/persistence/schema.ts).
const TABLES_WITH_HREF = [
  'geographic_location',
  'geographic_address',
  'geographic_site_specification',
  'geographic_site',
  'geographic_relationship_type',
  'resource_specification',
  'resource_type',
  'resource_function_specification',
  'resource_physical',
  'resource_logical',
  'service_specification',
  'service_category',
  'service_candidate',
  'service_resource_facing',
  'service_customer_facing',
  'service_qualification',
  'order_service',
  'order_resource',
  'party',
  'party_role',
  'user_research_session',
] as const;

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const client = createDatabaseClient(config.database);

const isAlreadyNullable = (error: unknown): boolean =>
  error instanceof Error && /ORA-01451/.test(error.message);

// Mesmo padrão de migrate-database.ts: liga auto-schema só depois do client construído, para
// que initialize() aplique MIGRATIONS_SQL pendentes (ex.: tenant_id) em vez de só validar drift.
process.env.DATABASE_AUTO_SCHEMA = 'true';

try {
  await client.initialize();

  for (const table of TABLES_WITH_HREF) {
    try {
      await client.run(`ALTER TABLE ${table} MODIFY (href NULL)`);
      process.stdout.write(`OK   ${table}\n`);
    } catch (error) {
      if (isAlreadyNullable(error)) {
        process.stdout.write(`SKIP ${table} (já nullable)\n`);
        continue;
      }
      throw error;
    }
  }

  process.stdout.write(`href.NOT NULL removido no Oracle — ${TABLES_WITH_HREF.length} tabelas.\n`);
} finally {
  await client.close();
}
