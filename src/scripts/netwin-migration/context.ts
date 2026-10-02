import oracledb, { type Connection, type Pool } from 'oracledb';
import {
  configureOracleClient,
  oracleConnectDescriptor,
  quote,
  makeTablePrefixer,
  ensureControlTables,
  type TablePrefixer,
} from '../netwin-migration-kit.js';
import type { CliOptions } from './types.js';

oracledb.fetchAsString = [oracledb.CLOB];
configureOracleClient();

export type MigrationContext = {
  options: CliOptions;
  t: TablePrefixer;
  getSourceConnection: () => Promise<Connection>;
  getTargetConnection: () => Promise<Connection | null>;
  getTargetReadConnection: () => Promise<Connection>;
  close: () => Promise<void>;
};

const READ_ONLY_SQL = /^(?:SELECT|WITH)\b/iu;
const READ_ONLY_BLOCKED_METHODS = new Set<keyof Connection>([
  'changePassword',
  'clearAppContext',
  'clearEndUserSecurityContext',
  'commit',
  'createLob',
  'directPathLoad',
  'executeMany',
  'rollback',
  'runPipeline',
  'setEndUserSecurityContext',
  'shutdown',
  'startup',
  'subscribe',
  'unsubscribe',
]);

function stripLeadingSqlComments(sql: string): string {
  return sql.replace(/^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)+/u, '');
}

export function assertReadOnlySql(sql: string, label = 'conexão read-only'): void {
  const normalized = stripLeadingSqlComments(sql);
  if (!READ_ONLY_SQL.test(normalized)) {
    throw new Error(`Operação bloqueada: ${label} aceita exclusivamente consultas SELECT ou WITH.`);
  }

  if (
    /\b(?:FOR\s+UPDATE|INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COMMIT|ROLLBACK|LOCK\s+TABLE)\b/iu.test(
      normalized,
    )
  ) {
    throw new Error(
      `Operação bloqueada: ${label} aceita exclusivamente consultas sem escrita ou bloqueio.`,
    );
  }
}

export function assertReadOnlySourceSql(sql: string): void {
  assertReadOnlySql(sql, 'a origem Netwin');
}

function guardReadOnlyConnection(connection: Connection, label: string): Connection {
  return new Proxy(connection, {
    get(target, property, receiver) {
      if (property === 'execute' || property === 'queryStream') {
        return (sql: string, ...args: unknown[]) => {
          assertReadOnlySql(sql, label);
          return Reflect.apply(target[property], target, [sql, ...args]);
        };
      }
      if (
        typeof property === 'string' &&
        READ_ONLY_BLOCKED_METHODS.has(property as keyof Connection)
      ) {
        return () => {
          throw new Error(`Operação ${property} bloqueada em ${label}.`);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Teto por chamada na origem Netwin. Generoso o bastante para as varreduras legítimas de uma UF
 * inteira, mas finito: sem ele uma query degenerada pendura a migração sem erro.
 * Ajustável por NETWIN_DR_CALL_TIMEOUT_MS.
 */
const DEFAULT_SOURCE_CALL_TIMEOUT_MS = 15 * 60 * 1000;

export async function createMigrationContext(options: CliOptions): Promise<MigrationContext> {
  const t = makeTablePrefixer(options.targetPrefix);
  const parsedCallTimeout = Number(process.env.NETWIN_DR_CALL_TIMEOUT_MS);
  const sourceCallTimeoutMs =
    Number.isFinite(parsedCallTimeout) && parsedCallTimeout > 0
      ? parsedCallTimeout
      : DEFAULT_SOURCE_CALL_TIMEOUT_MS;
  const normalizedPrefix = options.targetPrefix.toUpperCase();
  if (options.apply && options.tenantId === 'default') {
    throw new Error(
      'Em modo APPLY, informe explicitamente --tenant-id. A seleção automática de tenant foi removida.',
    );
  }
  if (['NX_DEV1_', 'NX_DEV2_'].includes(normalizedPrefix) && options.tenantId !== 'vtal') {
    throw new Error(
      `O prefixo ${normalizedPrefix} é exclusivo do tenant vtal. Informe --tenant-id vtal.`,
    );
  }

  const requiresSource = options.phase !== '3';
  const requiresTargetRead = options.phase === '3' || options.phase === 'all';
  const netwinTnsAdmin = process.env.NETWIN_DR_TNS_ADMIN ?? process.env.TNS_ADMIN;
  const sourceConnectString = process.env.NETWIN_DR_ORACLE_CONNECT_STRING;
  const sourceUser = process.env.NETWIN_DR_ORACLE_USER;
  const sourcePassword = process.env.NETWIN_DR_ORACLE_PASSWORD;

  let sourcePool: Pool | null = null;
  if (requiresSource) {
    if (!sourceConnectString || !sourceUser || !sourcePassword) {
      throw new Error(
        'NETWIN_DR_ORACLE_CONNECT_STRING, NETWIN_DR_ORACLE_USER e NETWIN_DR_ORACLE_PASSWORD são obrigatórios para esta fase.',
      );
    }
    sourcePool = await oracledb.createPool({
      connectString: oracleConnectDescriptor(sourceConnectString),
      user: sourceUser,
      password: sourcePassword,
      ...(netwinTnsAdmin ? { configDir: netwinTnsAdmin } : {}),
      poolMin: 1,
      poolMax: 2,
    });
  }

  let targetPool: Pool | null = null;
  if (options.apply || requiresTargetRead) {
    const targetConnectString =
      process.env.TARGET_ORACLE_CONNECT_STRING || process.env.ORACLE_CONNECTION_STRING;
    const targetUser = process.env.TARGET_ORACLE_USER || process.env.ORACLE_USER;
    const targetPassword = process.env.TARGET_ORACLE_PASSWORD || process.env.ORACLE_PASSWORD;

    if (!targetConnectString || !targetUser || !targetPassword) {
      throw new Error(
        'ORACLE_CONNECTION_STRING, ORACLE_USER e ORACLE_PASSWORD são obrigatórios para acessar o destino.',
      );
    }

    targetPool = await oracledb.createPool({
      connectString: targetConnectString,
      user: targetUser,
      password: targetPassword,
      poolMin: 1,
      poolMax: 4,
    });
  }

  return {
    options,
    t,
    getSourceConnection: async () => {
      if (!sourcePool) throw new Error('A Fase 3 não abre conexão com a origem Netwin.');
      const conn = await sourcePool.getConnection();
      // Sem teto, uma query patológica na origem trava a migração indefinidamente e fica
      // indistinguível de uma execução apenas lenta — foi assim que um escopo de UF inteira
      // ficou horas sem fechar um único lote, sem erro nenhum.
      conn.callTimeout = sourceCallTimeoutMs;
      await conn.execute('SET TRANSACTION READ ONLY');
      return guardReadOnlyConnection(conn, 'a origem Netwin read-only');
    },
    getTargetConnection: async () => {
      if (!targetPool || !options.apply) return null;
      return await targetPool.getConnection();
    },
    getTargetReadConnection: async () => {
      if (!targetPool) throw new Error('Conexão de leitura do destino não está disponível.');
      const conn = await targetPool.getConnection();
      if (!options.apply) {
        await conn.execute('SET TRANSACTION READ ONLY');
        return guardReadOnlyConnection(conn, 'o destino da Fase 3 em dry-run');
      }
      return conn;
    },
    close: async () => {
      if (sourcePool) await sourcePool.close(10);
      if (targetPool) await targetPool.close(10);
    },
  };
}

export { quote, ensureControlTables, type TablePrefixer };

/**
 * Executes high-volume batch inserts into Oracle using executeMany with chunking.
 */
export async function bulkInsertRows(
  conn: Connection,
  t: TablePrefixer,
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  chunkSize = 1000,
  ignoredErrors: number[] = [1],
): Promise<number> {
  if (rows.length === 0) return 0;

  const sql = `INSERT INTO ${t(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map((_, i) => `:${i + 1}`).join(',')})`;

  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const data = chunk.map((row) => columns.map((col) => row[col] ?? null));
    const result = await conn.executeMany(sql, data, {
      autoCommit: false,
      batchErrors: true,
    });

    const errors = result.batchErrors ?? [];
    for (const error of errors) {
      // ORA-00001 = unique constraint, ORA-02291 = foreign key integrity
      const num = error.errorNum ?? 0;
      if (!ignoredErrors.includes(num)) {
        throw new Error(`bulkInsertRows ${table}: ORA-${num} ${error.message}`);
      }
    }
    totalInserted += chunk.length - errors.length;
  }

  return totalInserted;
}
