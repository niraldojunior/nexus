import { afterEach, describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../src/shared/persistence/schema.js';
import { TRUNCATE_SQL, assertNotProductionUrl } from './test-utils.js';

// Regression guards for the incident where a CI run pointed the test suite at the production
// database and the per-test TRUNCATE wiped it: the TRUNCATE resolved unqualified table names
// against `public` because the worker schema was empty. These lock in the two defenses.

describe('TRUNCATE_SQL', () => {
  it('qualifies every table with a per-worker test schema, never the public schema', () => {
    // Physically cannot touch public: every table is prefixed with a "nexus_test_w..." schema.
    for (const table of TABLE_NAMES) {
      expect(TRUNCATE_SQL).toContain(`"nexus_test_w`);
      expect(TRUNCATE_SQL).toMatch(new RegExp(`"nexus_test_w[^"]*"\\."${table}"`));
      // The unqualified form (what caused the incident) must not appear.
      expect(TRUNCATE_SQL).not.toContain(` "${table}"`);
    }
    expect(TRUNCATE_SQL).not.toContain('public.');
  });
});

describe('assertNotProductionUrl', () => {
  const prevProd = process.env.DATABASE_URL_PROD;
  const prevNeonProd = process.env.NEON_DATABASE_URL_PROD;

  afterEach(() => {
    if (prevProd === undefined) delete process.env.DATABASE_URL_PROD;
    else process.env.DATABASE_URL_PROD = prevProd;
    if (prevNeonProd === undefined) delete process.env.NEON_DATABASE_URL_PROD;
    else process.env.NEON_DATABASE_URL_PROD = prevNeonProd;
  });

  it('throws when the test URL is the production database, ignoring credentials and schema param', () => {
    process.env.DATABASE_URL_PROD =
      'postgresql://prod-user:secret@ep-prod-123-pooler.neon.tech/nexus?sslmode=require';
    // Same host + database, different user/password and with a ?schema= appended → still prod.
    expect(() =>
      assertNotProductionUrl(
        'postgresql://someone:else@ep-prod-123-pooler.neon.tech/nexus?sslmode=require&schema=nexus_test_w1',
      ),
    ).toThrow(/produção/);
  });

  it('does not throw for a different database host', () => {
    process.env.DATABASE_URL_PROD =
      'postgresql://prod-user:secret@ep-prod-123-pooler.neon.tech/nexus?sslmode=require';
    expect(() =>
      assertNotProductionUrl(
        'postgresql://dev-user:secret@ep-dev-999-pooler.neon.tech/nexus?sslmode=require',
      ),
    ).not.toThrow();
  });

  it('does not throw when no production URL is configured', () => {
    delete process.env.DATABASE_URL_PROD;
    delete process.env.NEON_DATABASE_URL_PROD;
    expect(() =>
      assertNotProductionUrl('postgresql://u:p@ep-dev-1-pooler.neon.tech/nexus'),
    ).not.toThrow();
  });
});
