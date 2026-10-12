// Issue #344: cutover explícito dos nomes físicos Oracle (legado → <PREFIXO><DOMÍNIO>_<RESTO>).
// Metadado-only (RENAME): nenhuma linha é copiada. Nunca roda no boot.
//
//   ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --inventory
//   ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --dry-run
//   ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --apply --confirm-prefix NX_DEV9_
//   ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --verify
//   ORACLE_OBJECT_PREFIX=NX_DEV9_ npm run db:restructure -- --rollback --confirm-prefix NX_DEV9_
//
// Pare backend, Studio e migradores antes de --apply: um processo com código antigo pode recriar
// tabelas legadas vazias. Segredos nunca são impressos.
import oracledb, { type Connection } from 'oracledb';
import { config as loadEnv } from 'dotenv';
import { resolveDatabaseConfig } from '../shared/config/env.js';
import {
  invert,
  planRenames,
  preflight,
  renameStatement,
  RESTRUCTURE_LEDGER_TABLE,
  stateOf,
  type Catalog,
  type RenameOperation,
} from '../shared/persistence/object-restructure.js';

loadEnv();

const MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--rollback'] as const;
const args = process.argv.slice(2);
const mode = MODES.find((candidate) => args.includes(candidate));
if (!mode) {
  process.stderr.write(`Informe um modo: ${MODES.join(' | ')}\n`);
  process.exit(2);
}
const confirmed = args[args.indexOf('--confirm-prefix') + 1];

const database = resolveDatabaseConfig(process.env);
const prefix = database.objectPrefix.toUpperCase();
const ledger = `${prefix}${RESTRUCTURE_LEDGER_TABLE.toUpperCase()}`;
const QUERY = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const readCatalog = async (connection: Connection): Promise<Catalog> => {
  const like = `${prefix.replace(/[_%\\]/g, '\\$&')}%`;
  const rows = async <T>(sql: string): Promise<T[]> =>
    ((await connection.execute<T>(sql, [like], QUERY)).rows ?? []) as T[];
  const tables = await rows<{ n: string }>(
    `SELECT table_name AS "n" FROM user_tables WHERE table_name LIKE :1 ESCAPE '\\'`,
  );
  const indexes = await rows<{ n: string }>(
    `SELECT index_name AS "n" FROM user_indexes WHERE index_name LIKE :1 ESCAPE '\\'`,
  );
  const constraints = await rows<{ n: string; t: string }>(
    `SELECT constraint_name AS "n", table_name AS "t" FROM user_constraints
      WHERE constraint_name LIKE :1 ESCAPE '\\'`,
  );
  return {
    tables: new Set(tables.map((row) => row.n)),
    indexes: new Set(indexes.map((row) => row.n)),
    constraints: new Map(constraints.map((row) => [row.n, row.t])),
  };
};

const ensureLedger = async (connection: Connection): Promise<void> => {
  const exists = await connection.execute(
    `SELECT 1 FROM user_tables WHERE table_name = :1`,
    [ledger],
    QUERY,
  );
  if ((exists.rows ?? []).length > 0) return;
  await connection.execute(
    `CREATE TABLE ${ledger} (
       kind VARCHAR2(16 CHAR) NOT NULL,
       source_name VARCHAR2(128 CHAR) NOT NULL,
       target_name VARCHAR2(128 CHAR) NOT NULL,
       status VARCHAR2(16 CHAR) NOT NULL,
       error_message VARCHAR2(1000 CHAR),
       applied_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
       CONSTRAINT ${ledger}_PK PRIMARY KEY (kind, source_name)
     )`,
  );
};

const record = async (
  connection: Connection,
  operation: RenameOperation,
  status: string,
  error?: string,
): Promise<void> => {
  await connection.execute(
    `MERGE INTO ${ledger} t
     USING (SELECT :1 kind, :2 source_name FROM DUAL) s
        ON (t.kind = s.kind AND t.source_name = s.source_name)
      WHEN MATCHED THEN UPDATE SET status = :3, error_message = :4, applied_at = CURRENT_TIMESTAMP
      WHEN NOT MATCHED THEN INSERT (kind, source_name, target_name, status, error_message)
        VALUES (:5, :6, :7, :8, :9)`,
    [
      operation.kind,
      operation.source,
      status,
      error?.slice(0, 1000) ?? null,
      operation.kind,
      operation.source,
      operation.target,
      status,
      error?.slice(0, 1000) ?? null,
    ],
  );
  await connection.commit();
};

const ownerOf = async (connection: Connection, constraint: string): Promise<string | undefined> => {
  const result = await connection.execute<{ t: string }>(
    `SELECT table_name AS "t" FROM user_constraints WHERE constraint_name = :1`,
    [constraint],
    QUERY,
  );
  return result.rows?.[0]?.t;
};

const execute = async (
  connection: Connection,
  operation: RenameOperation,
): Promise<'renamed' | 'skipped'> => {
  const catalog = await readCatalog(connection);
  const state = stateOf(operation, catalog);
  if (state === 'conflict') throw new Error(`Conflito em ${operation.source} → ${operation.target}.`);
  if (state !== 'pending') return 'skipped';
  const owner = operation.kind === 'constraint' ? await ownerOf(connection, operation.source) : undefined;
  await connection.execute(renameStatement(operation, owner));
  return 'renamed';
};

const connection = await oracledb.getConnection({
  connectString: database.connectString,
  user: database.user,
  password: database.password,
});
try {
  const operations = planRenames(prefix);
  const catalog = await readCatalog(connection);
  const states = operations.map((operation) => ({ operation, state: stateOf(operation, catalog) }));
  const tally = (wanted: string): number => states.filter((entry) => entry.state === wanted).length;
  const summary = `prefixo=${prefix} pendentes=${tally('pending')} concluídas=${tally('done')} ausentes=${tally('absent')} conflitos=${tally('conflict')}`;

  if (mode === '--inventory') {
    for (const { operation, state } of states) {
      process.stdout.write(`${state.padEnd(8)} ${operation.kind.padEnd(10)} ${operation.source} -> ${operation.target}\n`);
    }
    process.stdout.write(`${summary}\n`);
  } else if (mode === '--dry-run' || mode === '--apply' || mode === '--rollback') {
    const plan = mode === '--rollback' ? operations.map(invert).reverse() : operations;
    const problems = mode === '--rollback' ? [] : preflight(operations, catalog);
    if (problems.length > 0) {
      for (const problem of problems) process.stderr.write(`PREFLIGHT: ${problem.message}\n`);
      process.exitCode = 1;
    } else if (mode === '--dry-run') {
      for (const operation of plan) {
        if (stateOf(operation, catalog) === 'pending') {
          process.stdout.write(`${renameStatement(operation, catalog.constraints.get(operation.source) ?? '<tabela>')}\n`);
        }
      }
      process.stdout.write(`${summary}\n`);
    } else {
      if (confirmed?.toUpperCase() !== prefix) {
        throw new Error(`--confirm-prefix deve repetir exatamente ${prefix}.`);
      }
      await ensureLedger(connection);
      for (const operation of plan) {
        try {
          const outcome = await execute(connection, operation);
          await record(connection, operation, outcome === 'renamed' ? mode.slice(2) : 'skipped');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await record(connection, operation, 'failed', message);
          throw new Error(`Falha em ${operation.source}: ${message}. Reexecute para retomar.`);
        }
      }
      process.stdout.write(`${mode.slice(2)} concluído. ${summary}\n`);
    }
  } else {
    const after = await readCatalog(connection);
    const remaining = states.filter((entry) => entry.state === 'pending' || entry.state === 'conflict');
    const invalid = await connection.execute<{ n: string }>(
      `SELECT object_name AS "n" FROM user_objects WHERE status = 'INVALID' AND object_name LIKE :1 ESCAPE '\\'`,
      [`${prefix.replace(/[_%\\]/g, '\\$&')}%`],
      QUERY,
    );
    const disabled = await connection.execute<{ n: string }>(
      `SELECT constraint_name AS "n" FROM user_constraints
        WHERE constraint_name LIKE :1 ESCAPE '\\' AND (status <> 'ENABLED' OR validated <> 'VALIDATED')`,
      [`${prefix.replace(/[_%\\]/g, '\\$&')}%`],
      QUERY,
    );
    for (const entry of remaining) process.stderr.write(`PENDENTE: ${entry.operation.source}\n`);
    for (const row of invalid.rows ?? []) process.stderr.write(`INVÁLIDO: ${row.n}\n`);
    for (const row of disabled.rows ?? []) process.stderr.write(`CONSTRAINT: ${row.n}\n`);
    const ok = remaining.length === 0 && (invalid.rows ?? []).length === 0 && (disabled.rows ?? []).length === 0;
    process.stdout.write(`${ok ? 'OK' : 'FALHA'} ${summary} tabelas=${after.tables.size}\n`);
    if (!ok) process.exitCode = 1;
  }
} finally {
  await connection.close();
}
