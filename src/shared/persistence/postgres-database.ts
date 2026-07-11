import { isPostgresDatabaseUrl } from '../config/env.js';
import { PostgresSyncBridge } from './postgres-sync-bridge.js';

export type RunResult = { changes: number; lastInsertRowid?: number | bigint };

/**
 * Database singleton facade.
 *
 * Every instance runs over Neon/Postgres via the {@link PostgresSyncBridge} worker. The
 * repositories still emit SQLite-dialect SQL (a legacy of the pre-Neon codebase); the worker
 * rewrites it to Postgres at runtime (see `postgres-sync-worker.ts`). Only Postgres connection
 * strings are accepted — the app config guarantees this (see `resolveDatabaseUrl`).
 */
export class PostgresDatabase {
  private static instances = new Map<string, PostgresDatabase>();
  private postgresBridge: PostgresSyncBridge | null;
  private initialized = false;

  private constructor(private readonly dbPath: string) {
    if (!isPostgresDatabaseUrl(dbPath)) {
      throw new Error(
        `PostgresDatabase requires a postgres:// or postgresql:// connection string, received: ${dbPath}`,
      );
    }
    this.postgresBridge = new PostgresSyncBridge(dbPath);
  }

  static getInstance(dbPath?: string): PostgresDatabase {
    const resolvedPath = normalizeDatabasePath(dbPath);
    const existing = PostgresDatabase.instances.get(resolvedPath);
    if (existing) {
      return existing;
    }

    const instance = new PostgresDatabase(resolvedPath);
    PostgresDatabase.instances.set(resolvedPath, instance);
    return instance;
  }

  static resetForTesting(): void {
    // In reuse mode the per-worker instance (worker thread + pool + schema) is kept warm across
    // tests; data isolation is handled by a TRUNCATE in the global afterEach and the schema is
    // dropped once at the end of the run. Tearing the instance down here would force a fresh worker,
    // pool connect and full DDL on every test — exactly the per-test cost we are removing.
    if (process.env.DATABASE_REUSE_TEST_INSTANCE === 'true') return;
    for (const instance of PostgresDatabase.instances.values()) {
      if (instance.postgresBridge) {
        instance.postgresBridge.close();
        instance.postgresBridge = null;
      }
    }
    PostgresDatabase.instances.clear();
  }

  private getBridge(): PostgresSyncBridge {
    if (!this.postgresBridge) {
      throw new Error('Database not initialized');
    }
    return this.postgresBridge;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.getBridge().initialize();
    this.initialized = true;
  }

  close(): void {
    if (this.postgresBridge) {
      this.postgresBridge.close();
      this.postgresBridge = null;
    }
    PostgresDatabase.instances.delete(this.dbPath);
  }

  run(sql: string, params?: any[]): RunResult {
    return this.getBridge().run(sql, params ?? []);
  }

  get<T>(sql: string, params?: any[]): T | undefined {
    return this.getBridge().get<T>(sql, params ?? []);
  }

  all<T>(sql: string, params?: any[]): T[] {
    return this.getBridge().all<T>(sql, params ?? []);
  }

  exec(sql: string): void {
    this.getBridge().exec(sql);
  }

  transaction<T>(fn: () => T): T {
    return this.getBridge().transaction(fn);
  }
}

const normalizeDatabasePath = (dbPath?: string): string => {
  if (!dbPath) {
    throw new Error('A postgres:// or postgresql:// connection string is required.');
  }
  return dbPath;
};
