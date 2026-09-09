import { afterEach, describe, expect, it } from 'vitest';
import { assertOracleTestPrefix, isOracleTestConfigured } from './test-utils.js';

// Regression guard: DEV/HML/PRD/TEST share one Oracle schema, distinguished only by an object
// prefix, and the test suite DELETEs every table under that prefix between runs. Locking in
// `assertOracleTestPrefix` here means a future refactor that loosens the check fails fast instead
// of silently risking a DELETE against DEV/HML/PRD data.

describe('assertOracleTestPrefix', () => {
  it('accepts prefixes ending in _TEST_ or _TST_ (case-insensitive)', () => {
    expect(() => assertOracleTestPrefix('NEXUS_TEST_')).not.toThrow();
    expect(() => assertOracleTestPrefix('nexus_test_')).not.toThrow();
    expect(() => assertOracleTestPrefix('NEXUS_TST_')).not.toThrow();
  });

  it('rejects a non-test prefix, naming the risk of wiping DEV/HML/PRD data', () => {
    expect(() => assertOracleTestPrefix('NEXUS_DEV_')).toThrow(/produção|DEV|HML|PRD/i);
    expect(() => assertOracleTestPrefix('NEXUS_PRD_')).toThrow();
  });
});

describe('isOracleTestConfigured', () => {
  const prevConn = process.env.ORACLE_CONNECTION_STRING;
  const prevUser = process.env.ORACLE_USER;
  const prevPassword = process.env.ORACLE_PASSWORD;

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('ORACLE_CONNECTION_STRING', prevConn);
    restore('ORACLE_USER', prevUser);
    restore('ORACLE_PASSWORD', prevPassword);
  });

  it('is false when any of connection string, user or password is missing', () => {
    delete process.env.ORACLE_CONNECTION_STRING;
    delete process.env.ORACLE_USER;
    delete process.env.ORACLE_PASSWORD;
    expect(isOracleTestConfigured()).toBe(false);

    process.env.ORACLE_CONNECTION_STRING = 'localhost:1521/xe';
    process.env.ORACLE_USER = 'nexus';
    delete process.env.ORACLE_PASSWORD;
    expect(isOracleTestConfigured()).toBe(false);
  });

  it('is true once connection string, user and password are all set', () => {
    process.env.ORACLE_CONNECTION_STRING = 'localhost:1521/xe';
    process.env.ORACLE_USER = 'nexus';
    process.env.ORACLE_PASSWORD = 'secret';
    expect(isOracleTestConfigured()).toBe(true);
  });
});
