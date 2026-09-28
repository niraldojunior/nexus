#!/usr/bin/env node
/**
 * Reconcilia a carga Netwin já gravada no namespace Oracle NX_DEV1_.
 *
 * Auditoria (somente leitura do destino):
 *   npm run migrate:netwin:tenant
 *
 * Aplicação (somente após auditoria aprovada):
 *   npm run migrate:netwin:tenant -- --apply --confirm-netwin-tenant-reconciliation
 *
 * Este script nunca abre uma conexão com o DR Netwin. Ele opera exclusivamente no
 * Oracle Nexus configurado e recusa qualquer namespace que não seja NX_DEV1_.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../shared/config/env.js';
import type { DatabaseClient, DatabaseSession } from '../shared/persistence/database-client.js';
import { createDatabaseClient } from '../shared/persistence/database-factory.js';

loadEnv();

export const NETWIN_SOURCE_TENANT = '01a0c52d-7ec3-7ab3-8535-1439cf602de4';
export const NETWIN_DESTINATION_TENANT = 'vtal';
export const NETWIN_TARGET_PREFIX = 'NX_DEV1_';

export type ReconciliationOptions = { apply: boolean; confirmed: boolean };
type CountRow = { tableName: string; count: number | string };
type ConstraintColumnRow = {
  constraintName: string;
  columnName: string;
  position: number | string;
};
type ConstraintRow = { constraintName: string; constraintType: 'P' | 'U'; columns: string[] };
type ForeignKeyRow = {
  constraintName: string;
  tableName: string;
  referencedTableName: string;
  columns: string[];
  referencedColumns: string[];
};

type TablePlan = {
  tableName: string;
  columns: string[];
  identityColumns: string[];
  count: number;
};

type AuditFinding = {
  code: string;
  table?: string;
  count?: number;
  detail?: string;
};

type AuditReport = {
  targetPrefix: string;
  sourceTenant: string;
  destinationTenant: string;
  counts: CountRow[];
  tables: TablePlan[];
  foreignKeys: ForeignKeyRow[];
  tenantCompositeForeignKeys: ForeignKeyRow[];
  findings: AuditFinding[];
  approved: boolean;
};

const identifier = (value: string): string => {
  if (!/^[a-z][a-z0-9_]*$/iu.test(value))
    throw new Error(`Identificador Oracle inválido: ${value}`);
  return value;
};

export function parseReconciliationOptions(argv: string[]): ReconciliationOptions {
  return {
    apply: argv.includes('--apply'),
    confirmed: argv.includes('--confirm-netwin-tenant-reconciliation'),
  };
}

export function assertReconciliationInvocation(
  options: ReconciliationOptions,
  objectPrefix: string,
): void {
  if (objectPrefix.toUpperCase() !== NETWIN_TARGET_PREFIX) {
    throw new Error(
      `Este reparo só pode operar no prefixo ${NETWIN_TARGET_PREFIX}; recebido ${objectPrefix}.`,
    );
  }
  if (options.confirmed && !options.apply) {
    throw new Error('--confirm-netwin-tenant-reconciliation exige --apply.');
  }
  if (options.apply && !options.confirmed) {
    throw new Error('A escrita exige --apply --confirm-netwin-tenant-reconciliation juntos.');
  }
}

async function tenantTables(db: DatabaseSession, prefix: string): Promise<string[]> {
  const rows = await db.queryMany<{ tableName: string }>(
    `SELECT LOWER(SUBSTR(table_name, ${prefix.length + 1})) AS "tableName"
       FROM user_tab_columns
      WHERE column_name = 'TENANT_ID'
        AND table_name LIKE ? || '%'
      GROUP BY table_name
      ORDER BY table_name`,
    [prefix.toUpperCase()],
  );
  return rows.map((row) => identifier(row.tableName));
}

async function columnsFor(db: DatabaseSession, prefix: string, table: string): Promise<string[]> {
  const rows = await db.queryMany<{ columnName: string }>(
    `SELECT LOWER(column_name) AS "columnName"
       FROM user_tab_columns
      WHERE table_name = ?
      ORDER BY column_id`,
    [`${prefix}${table}`.toUpperCase()],
  );
  return rows.map((row) => identifier(row.columnName));
}

async function constraintsFor(
  db: DatabaseSession,
  prefix: string,
  table: string,
): Promise<ConstraintRow[]> {
  const rows = await db.queryMany<ConstraintColumnRow & { constraintType: 'P' | 'U' }>(
    `SELECT c.constraint_name AS "constraintName",
            c.constraint_type AS "constraintType",
            LOWER(cc.column_name) AS "columnName",
            cc.position AS "position"
       FROM user_constraints c
       JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name
      WHERE c.table_name = ?
        AND c.constraint_type IN ('P', 'U')
      ORDER BY CASE c.constraint_type WHEN 'P' THEN 0 ELSE 1 END, c.constraint_name, cc.position`,
    [`${prefix}${table}`.toUpperCase()],
  );

  const grouped = new Map<string, ConstraintRow>();
  for (const row of rows) {
    const current = grouped.get(row.constraintName) ?? {
      constraintName: row.constraintName,
      constraintType: row.constraintType,
      columns: [],
    };
    current.columns.push(identifier(row.columnName));
    grouped.set(row.constraintName, current);
  }
  return [...grouped.values()];
}

/** A row's global id is the preferred collision key; otherwise use the actual PK/unique key. */
export function selectIdentityColumns(columns: string[], constraints: ConstraintRow[]): string[] {
  if (columns.includes('id')) return ['id'];
  const key = constraints.find((constraint) =>
    constraint.columns.some((column) => column !== 'tenant_id'),
  );
  return key?.columns.filter((column) => column !== 'tenant_id') ?? [];
}

async function foreignKeysFor(db: DatabaseSession, prefix: string): Promise<ForeignKeyRow[]> {
  const rows = await db.queryMany<{
    constraintName: string;
    tableName: string;
    referencedTableName: string;
    columnName: string;
    referencedColumnName: string;
    position: number | string;
  }>(
    `SELECT fk.constraint_name AS "constraintName",
            LOWER(SUBSTR(fk.table_name, ${prefix.length + 1})) AS "tableName",
            LOWER(SUBSTR(parent.table_name, ${prefix.length + 1})) AS "referencedTableName",
            LOWER(fk_columns.column_name) AS "columnName",
            LOWER(parent_columns.column_name) AS "referencedColumnName",
            fk_columns.position AS "position"
       FROM user_constraints fk
       JOIN user_constraints parent ON parent.constraint_name = fk.r_constraint_name
       JOIN user_cons_columns fk_columns
         ON fk_columns.constraint_name = fk.constraint_name
       JOIN user_cons_columns parent_columns
         ON parent_columns.constraint_name = parent.constraint_name
        AND parent_columns.position = fk_columns.position
      WHERE fk.constraint_type = 'R'
        AND fk.table_name LIKE ? || '%'
        AND parent.table_name LIKE ? || '%'
      ORDER BY fk.constraint_name, fk_columns.position`,
    [prefix.toUpperCase(), prefix.toUpperCase()],
  );

  const grouped = new Map<string, ForeignKeyRow>();
  for (const row of rows) {
    const current = grouped.get(row.constraintName) ?? {
      constraintName: row.constraintName,
      tableName: identifier(row.tableName),
      referencedTableName: identifier(row.referencedTableName),
      columns: [],
      referencedColumns: [],
    };
    current.columns.push(identifier(row.columnName));
    current.referencedColumns.push(identifier(row.referencedColumnName));
    grouped.set(row.constraintName, current);
  }
  return [...grouped.values()];
}

async function countFor(db: DatabaseSession, table: string, tenantId: string): Promise<number> {
  const row = await db.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM ${identifier(table)} WHERE tenant_id = ?`,
    [tenantId],
  );
  return Number(row?.count ?? 0);
}

async function collisionCount(
  db: DatabaseSession,
  table: string,
  identityColumns: string[],
): Promise<number> {
  if (identityColumns.length === 0) return 0;
  const join = identityColumns
    .map((column) => `destination.${column} = source.${column}`)
    .join(' AND ');
  const row = await db.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count
       FROM ${identifier(table)} source
       JOIN ${identifier(table)} destination ON ${join}
      WHERE source.tenant_id = ?
        AND destination.tenant_id = ?`,
    [NETWIN_SOURCE_TENANT, NETWIN_DESTINATION_TENANT],
  );
  return Number(row?.count ?? 0);
}

async function audit(db: DatabaseSession, prefix: string): Promise<AuditReport> {
  const findings: AuditFinding[] = [];
  const counts: CountRow[] = [];
  const tables: TablePlan[] = [];

  for (const tableName of await tenantTables(db, prefix)) {
    const count = await countFor(db, tableName, NETWIN_SOURCE_TENANT);
    if (count === 0) continue;

    const columns = await columnsFor(db, prefix, tableName);
    const constraints = await constraintsFor(db, prefix, tableName);
    const identityColumns = selectIdentityColumns(columns, constraints);
    if (identityColumns.length === 0) {
      findings.push({
        code: 'NO_COLLISION_KEY',
        table: tableName,
        count,
        detail:
          'A tabela não possui id, chave primária ou UNIQUE que permita verificar colisão de destino.',
      });
    } else {
      const collisions = await collisionCount(db, tableName, identityColumns);
      if (collisions > 0) {
        findings.push({
          code: 'DESTINATION_KEY_COLLISION',
          table: tableName,
          count: collisions,
          detail: `Colisão encontrada pela chave ${identityColumns.join(', ')}.`,
        });
      }
    }

    counts.push({ tableName, count });
    tables.push({ tableName, columns, identityColumns, count });
  }

  const foreignKeys = await foreignKeysFor(db, prefix);
  const affected = new Set(tables.map((table) => table.tableName));
  // Chaves estrangeiras tenant-scoped exigem um protocolo próprio no apply: Oracle valida
  // cada UPDATE imediatamente, portanto não há ordem que permita trocar pai e filho. O plano
  // preserva as constraints para desabilitá-las temporariamente e revalidá-las após o commit.
  const tenantCompositeForeignKeys = foreignKeys.filter(
    (foreignKey) =>
      affected.has(foreignKey.tableName) &&
      affected.has(foreignKey.referencedTableName) &&
      foreignKey.columns.includes('tenant_id') &&
      foreignKey.referencedColumns.includes('tenant_id'),
  );
  return {
    targetPrefix: prefix,
    sourceTenant: NETWIN_SOURCE_TENANT,
    destinationTenant: NETWIN_DESTINATION_TENANT,
    counts,
    tables,
    foreignKeys,
    tenantCompositeForeignKeys,
    findings,
    approved: findings.length === 0,
  };
}

async function applyReconciliation(client: DatabaseClient, report: AuditReport): Promise<void> {
  if (!report.approved) {
    throw new Error(
      `Preflight reprovado com ${report.findings.length} divergência(s); nenhuma linha foi alterada.`,
    );
  }

  const disabled: ForeignKeyRow[] = [];
  try {
    // Estas FKs incluem tenant_id nos dois lados. Oracle as valida a cada UPDATE,
    // portanto pai e filho não podem ser renomeados em nenhuma ordem DML. O DDL é
    // limitado às constraints descobertas no próprio namespace e é revalidado ao fim.
    for (const foreignKey of report.tenantCompositeForeignKeys) {
      await client.execute(
        `ALTER TABLE ${identifier(foreignKey.tableName)} DISABLE CONSTRAINT ${identifier(foreignKey.constraintName)}`,
      );
      disabled.push(foreignKey);
    }

    await client.transaction(async (session) => {
      // O catálogo Studio é tenant-scoped, mas o ResourceType é vocabulário
      // compartilhado. A carga antiga criou clones tenant-local; ao existir um
      // tipo canônico `default` com o mesmo code, a folha deve apontar para ele.
      // Isto corrige Port/Splitter sem recriar suas instâncias nem relacionamentos.
      const normalizedNodes = await session.execute(
        `UPDATE tmf_resource_catalog_node node
            SET resource_type_id = (
              SELECT shared.id
                FROM tmf_resource_type local_type
                JOIN tmf_resource_type shared
                  ON shared.code = local_type.code
                 AND shared.tenant_id = 'default'
               WHERE local_type.id = node.resource_type_id
                 AND local_type.tenant_id = ?
            )
          WHERE node.tenant_id = ?
            AND EXISTS (
              SELECT 1
                FROM tmf_resource_type local_type
                JOIN tmf_resource_type shared
                  ON shared.code = local_type.code
                 AND shared.tenant_id = 'default'
               WHERE local_type.id = node.resource_type_id
                 AND local_type.tenant_id = ?
            )`,
        [NETWIN_SOURCE_TENANT, NETWIN_SOURCE_TENANT, NETWIN_SOURCE_TENANT],
      );
      process.stdout.write(
        `  tmf_resource_catalog_node: ${normalizedNodes.changes} folha(s) normalizada(s) para ResourceType compartilhado.\n`,
      );

      // NX_DEV1_ já possui o catálogo mestre default do tenant vtal. O catálogo
      // criado pela carga Netwin também é default; dois defaults violariam a
      // constraint funcional única. Reaproveitamos o catálogo mestre para os
      // nós importados e preservamos o catálogo histórico como não-default.
      const destinationCatalog = await session.queryOne<{ id: string }>(
        `SELECT id
           FROM tmf_resource_catalog
          WHERE tenant_id = ?
            AND is_default = 1
          FETCH FIRST 1 ROWS ONLY`,
        [NETWIN_DESTINATION_TENANT],
      );
      const sourceCatalog = await session.queryOne<{ id: string }>(
        `SELECT id
           FROM tmf_resource_catalog
          WHERE tenant_id = ?
            AND is_default = 1
          FETCH FIRST 1 ROWS ONLY`,
        [NETWIN_SOURCE_TENANT],
      );
      if (!destinationCatalog || !sourceCatalog) {
        throw new Error('Catálogo default de origem ou destino ausente durante a reconciliação.');
      }

      const remappedNodes = await session.execute(
        `UPDATE tmf_resource_catalog_node
            SET catalog_id = ?
          WHERE tenant_id = ?
            AND catalog_id = ?`,
        [destinationCatalog.id, NETWIN_SOURCE_TENANT, sourceCatalog.id],
      );
      const demotedCatalog = await session.execute(
        `UPDATE tmf_resource_catalog
            SET is_default = 0
          WHERE id = ?
            AND tenant_id = ?`,
        [sourceCatalog.id, NETWIN_SOURCE_TENANT],
      );
      process.stdout.write(
        `  tmf_resource_catalog: ${demotedCatalog.changes} catálogo(s) histórico(s) marcado(s) como não-default; ${remappedNodes.changes} nó(s) movido(s) ao catálogo mestre vtal.\n`,
      );

      for (const table of report.tables) {
        const result = await session.execute(
          `UPDATE ${identifier(table.tableName)} SET tenant_id = ? WHERE tenant_id = ?`,
          [NETWIN_DESTINATION_TENANT, NETWIN_SOURCE_TENANT],
        );
        process.stdout.write(`  ${table.tableName}: ${result.changes} linha(s) reconciliada(s).\n`);
      }
    });
  } finally {
    for (const foreignKey of [...disabled].reverse()) {
      await client.execute(
        `ALTER TABLE ${identifier(foreignKey.tableName)} ENABLE VALIDATE CONSTRAINT ${identifier(foreignKey.constraintName)}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
  const options = parseReconciliationOptions(process.argv.slice(2));
  assertReconciliationInvocation(options, config.database.objectPrefix);
  const client = createDatabaseClient(config.database);

  try {
    await client.initialize();
    const report = await audit(client, config.database.objectPrefix);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.approved) {
      throw new Error(
        `Preflight reprovado com ${report.findings.length} divergência(s); nenhuma linha foi alterada.`,
      );
    }
    if (options.apply) {
      await applyReconciliation(client, report);
      const after = await audit(client, config.database.objectPrefix);
      process.stdout.write(`${JSON.stringify(after, null, 2)}\n`);
      if (!after.approved || after.counts.length > 0) {
        throw new Error(
          'Validação pós-reconciliação reprovada; investigue o relatório antes de nova execução.',
        );
      }
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}

export { audit, applyReconciliation };
