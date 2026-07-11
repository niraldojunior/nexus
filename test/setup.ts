import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { config as loadEnv } from 'dotenv';
import { truncateTestSchema } from './test-utils.js';

loadEnv();
process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';
// Keep the per-worker database instance (worker thread + pool + schema) warm across tests instead
// of tearing it down after every test. Data isolation is handled by the TRUNCATE in afterEach
// below; the schema itself is dropped once at the end of the run (test/global-teardown.ts).
process.env.DATABASE_REUSE_TEST_INSTANCE = process.env.DATABASE_REUSE_TEST_INSTANCE ?? 'true';
// Neon HTTP round-trips through the corporate proxy are slow; give the bridge and the connection
// generous timeouts for tests without changing production defaults.
process.env.DATABASE_BRIDGE_TIMEOUT_MS = process.env.DATABASE_BRIDGE_TIMEOUT_MS ?? '120000';
process.env.DATABASE_CONNECTION_TIMEOUT_MS = process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '60000';

// Reset data between tests without recreating the schema: one TRUNCATE covering every table (1
// round-trip). No-op until a test in this worker has actually initialized the shared schema.
afterEach(() => {
  truncateTestSchema();
});
