#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { buildDevSqliteRuntimeEnv } from './dist/src/shared/config/dev-sqlite-core.js';

// Load .env file into process.env
loadEnv();

console.log('=== Environment Variables Check ===\n');

// Check loaded env
const env = buildDevSqliteRuntimeEnv(process.env);

console.log('✓ process.env.OPENAI_API_KEY loaded:', process.env.OPENAI_API_KEY ? 'Yes' : 'No');
if (process.env.OPENAI_API_KEY) {
  console.log('  Value:', process.env.OPENAI_API_KEY.substring(0, 20) + '...');
}

console.log('\n✓ env.OPENAI_API_KEY in buildDevSqliteRuntimeEnv:', env.OPENAI_API_KEY ? 'Yes' : 'No');
if (env.OPENAI_API_KEY) {
  console.log('  Value:', env.OPENAI_API_KEY.substring(0, 20) + '...');
}

console.log('\n✓ Other env vars:');
console.log('  NODE_ENV:', env.NODE_ENV);
console.log('  PORT:', env.PORT);
console.log('  DATABASE_URL:', env.DATABASE_URL);
console.log('  AUTH_TOKEN:', env.AUTH_TOKEN);

if (!env.OPENAI_API_KEY) {
  console.log('\n❌ ERROR: OPENAI_API_KEY not found in environment!');
  process.exit(1);
}

console.log('\n✅ All environment variables loaded correctly!');
