import '@testing-library/jest-dom/vitest';
import { config as loadEnv } from 'dotenv';

loadEnv();
process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';
// Neon HTTP round-trips through the corporate proxy are slow; give the bridge and the connection
// generous timeouts for tests without changing production defaults.
process.env.DATABASE_BRIDGE_TIMEOUT_MS = process.env.DATABASE_BRIDGE_TIMEOUT_MS ?? '120000';
process.env.DATABASE_CONNECTION_TIMEOUT_MS = process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '60000';
