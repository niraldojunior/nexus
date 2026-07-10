import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isPostgresDatabaseUrl, loadConfig } from '../src/shared/config/env.js';

test('loadConfig applies Nexus defaults', () => {
  const config = loadConfig({ DATABASE_URL_DEV: 'postgresql://dev.example' });

  assert.equal(config.appName, 'v-tal-nexus');
  assert.equal(config.port, 4001);
  assert.equal(config.authEnabled, true);
});

test('loadConfig normalizes explicit environment values', () => {
  const config = loadConfig({
    APP_NAME: 'nexus-test',
    AUTH_ENABLED: 'off',
    AUTH_TOKEN: 'token-abc',
    DATABASE_URL_PROD: 'postgresql://prod.example',
    DATABASE_URL_DEV: 'postgresql://dev.example',
    LOG_LEVEL: 'debug',
    NODE_ENV: 'production',
    PORT: '4100',
  });

  assert.equal(config.appName, 'nexus-test');
  assert.equal(config.authEnabled, false);
  assert.equal(config.authToken, 'token-abc');
  assert.equal(config.databaseUrl, 'postgresql://prod.example');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.port, 4100);
});

test('loadConfig prefers the dev Neon database outside production when DATABASE_URL is absent', () => {
  const config = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    NODE_ENV: 'development',
  });

  assert.equal(config.databaseUrl, 'postgresql://dev.example');
});

test('loadConfig uses the preview Neon database in Vercel preview deployments', () => {
  const config = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    DATABASE_URL_PROD: 'postgresql://prod.example',
    VERCEL_ENV: 'preview',
  });

  assert.equal(config.databaseUrl, 'postgresql://dev.example');
});

test('loadConfig uses the production Neon database in Vercel production deployments', () => {
  const config = loadConfig({
    DATABASE_URL_DEV: 'postgresql://dev.example',
    DATABASE_URL_PROD: 'postgresql://prod.example',
    VERCEL_ENV: 'production',
  });

  assert.equal(config.databaseUrl, 'postgresql://prod.example');
});

test('loadConfig falls back for invalid values', () => {
  const config = loadConfig({
    AUTH_ENABLED: 'maybe',
    DATABASE_URL_DEV: 'postgresql://dev.example',
    LOG_LEVEL: 'verbose',
    NODE_ENV: 'qa',
    PORT: '-1',
  });

  assert.equal(config.authEnabled, false);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.port, 4001);
});

test('loadConfig requires a Neon/Postgres database url', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL_DEV/);
  assert.throws(() => loadConfig({ DATABASE_URL_DEV: 'sqlite://./data/nexus.db' }), /postgres/);
});

test('database url helpers identify Neon and reject sqlite as the default stack', () => {
  assert.equal(isPostgresDatabaseUrl('postgresql://example'), true);
  assert.equal(isPostgresDatabaseUrl('postgres://example'), true);
  assert.equal(isPostgresDatabaseUrl('sqlite://./data/nexus.db'), false);
});
