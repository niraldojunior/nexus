import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config as loadEnv } from 'dotenv';
import { createApp } from '../src/shared/http/app.js';
import { isPostgresDatabaseUrl } from '../src/shared/config/env.js';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';

loadEnv();

export const createTestLogger = () => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

export const createTestConfig = (port: number, databaseUrl: string) => ({
  appName: 'v-tal-nexus',
  authEnabled: true,
  authToken: 'secret',
  databaseUrl,
  logLevel: 'info' as const,
  nodeEnv: 'test' as const,
  port,
});

export const createTestDatabase = (prefix: string): { databaseUrl: string; cleanup: () => void } => {
  const postgresUrl =
    process.env.DATABASE_URL_TEST ??
    process.env.NEON_DATABASE_URL_TEST ??
    process.env.DATABASE_URL_DEV ??
    process.env.NEON_DATABASE_URL_DEV ??
    process.env.DATABASE_URL;

  if (isPostgresDatabaseUrl(postgresUrl)) {
    const schema = createSchemaName(prefix);
    const databaseUrl = appendSchema(postgresUrl, schema);
    process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';
    return {
      databaseUrl,
      cleanup: () => {
        const database = SqliteDatabase.getInstance(databaseUrl);
        try {
          database.exec(`DROP SCHEMA IF EXISTS "${schema.replace(/"/g, '""')}" CASCADE`);
        } finally {
          database.close();
          SqliteDatabase.resetForTesting();
        }
      },
    };
  }

  throw new Error('DATABASE_URL_TEST, NEON_DATABASE_URL_TEST, DATABASE_URL_DEV or NEON_DATABASE_URL_DEV must point to Neon/Postgres for integration tests.');
};

export const createSqliteTestDatabase = (prefix: string): { databaseUrl: string; cleanup: () => void } => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    databaseUrl: `sqlite://${join(root, 'nexus.db')}`,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

const createSchemaName = (prefix: string): string => {
  const normalizedPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'nexus_test';
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${normalizedPrefix}_${suffix}`.slice(0, 63);
};

const appendSchema = (databaseUrl: string, schema: string): string => {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
};

export const requestJson = async (
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ statusCode: number; body: unknown }> => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          authorization: 'Bearer secret',
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            body: text ? JSON.parse(text) : undefined,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

export const startHttpTestApp = async (prefix: string) => {
  const database = createTestDatabase(prefix);
  const server = createApp({ config: createTestConfig(0, database.databaseUrl), logger: createTestLogger() });
  const port = await server.start();

  return {
    port,
    requestJson: (method: string, path: string, body?: unknown) => requestJson(port, method, path, body),
    cleanup: async () => {
      await server.stop();
      database.cleanup();
    },
  };
};
