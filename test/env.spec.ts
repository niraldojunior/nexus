import assert from 'node:assert/strict';
import { test } from 'vitest';
import { loadConfig } from '../src/shared/config/env.js';

test('loadConfig applies Nexus defaults', () => {
  const config = loadConfig({});

  assert.equal(config.appName, 'v-tal-nexus');
  assert.equal(config.port, 4001);
  assert.equal(config.authEnabled, true);
});

test('loadConfig normalizes explicit environment values', () => {
  const config = loadConfig({
    APP_NAME: 'nexus-test',
    AUTH_ENABLED: 'off',
    AUTH_TOKEN: 'token-abc',
    DATABASE_URL: 'sqlite://./tmp/custom.db',
    LOG_LEVEL: 'debug',
    NODE_ENV: 'production',
    PORT: '4100',
  });

  assert.equal(config.appName, 'nexus-test');
  assert.equal(config.authEnabled, false);
  assert.equal(config.authToken, 'token-abc');
  assert.equal(config.databaseUrl, 'sqlite://./tmp/custom.db');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.port, 4100);
});

test('loadConfig falls back for invalid values', () => {
  const config = loadConfig({
    AUTH_ENABLED: 'maybe',
    LOG_LEVEL: 'verbose',
    NODE_ENV: 'qa',
    PORT: '-1',
  });

  assert.equal(config.authEnabled, false);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.port, 4001);
});
