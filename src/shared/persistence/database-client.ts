export type DatabaseProvider = 'postgres' | 'oracle';

export type DatabaseRunResult = {
  changes: number;
  lastInsertRowid?: number | bigint;
};

export interface DatabaseExecutor {
  execute(sql: string, params?: unknown[]): Promise<DatabaseRunResult>;
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  queryMany<T>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;

  // Compatibility names used by the existing repository adapters while their
  // public contracts move from synchronous values to Promises.
  run(sql: string, params?: unknown[]): Promise<DatabaseRunResult>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface DatabaseSession extends DatabaseExecutor {
  readonly provider: DatabaseProvider;
}

export type DatabaseHealth = {
  provider: DatabaseProvider;
  healthy: boolean;
  serverVersion?: string;
};

export interface DatabaseClient extends DatabaseSession {
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<DatabaseHealth>;
  transaction<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T>;
}

export type DatabasePoolConfig = {
  min: number;
  max: number;
  increment: number;
  queueTimeoutMs: number;
  connectionTimeoutMs: number;
  /**
   * Oracle-only: seconds between pool health pings (oracledb `poolPingInterval`). Ignored by the
   * Postgres pool, which does its own liveness checks.
   */
  pingIntervalSeconds?: number;
};
