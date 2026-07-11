import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

// Drops the per-worker test schemas (`nexus_test_%`) so the suite starts clean and leaves nothing
// behind. Runs once in the Vitest main process — before any worker (returned teardown runs after).
//
// Uses the Neon HTTP driver (not `pg` over TCP) on purpose: the corporate TLS-inspection proxy
// terminates TLS, which breaks Neon's SNI-based routing for raw Postgres connections. The HTTP
// driver tunnels over HTTPS and works through the proxy (the main process runs with
// `--use-system-ca`, so the proxy's certificate chain is trusted).

const resolvePostgresUrl = (): string | undefined =>
  process.env.DATABASE_URL_TEST ??
  process.env.NEON_DATABASE_URL_TEST ??
  process.env.DATABASE_URL_DEV ??
  process.env.NEON_DATABASE_URL_DEV ??
  process.env.DATABASE_URL;

const withoutSchema = (databaseUrl: string): string => {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  return url.toString();
};

const dropTestSchemas = async (): Promise<void> => {
  loadEnv();
  const raw = resolvePostgresUrl();
  if (!raw) return;
  const sql = neon(withoutSchema(raw));
  const rows = (await sql.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'nexus_test_%'`,
  )) as Array<{ schema_name: string }>;
  for (const { schema_name: schema } of rows) {
    await sql.query(`DROP SCHEMA IF EXISTS "${schema.replace(/"/g, '""')}" CASCADE`);
  }
};

export default async function setup(): Promise<() => Promise<void>> {
  await dropTestSchemas();
  return async () => {
    await dropTestSchemas();
  };
}
