import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/shared/http/app.js';

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
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    databaseUrl: `sqlite://${join(root, 'nexus.db')}`,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
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
