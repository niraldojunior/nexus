import assert from 'node:assert/strict';
import { test } from 'vitest';
import { transformOracleQuery, toBinds } from '../src/shared/persistence/oracle-database.js';
import {
  assertOracleCompatible,
  findPostgresisms,
} from '../src/shared/persistence/oracle-dialect-lint.js';
import {
  ORACLE_JSON_CONSTRAINTS_SQL,
  splitOracleStatements,
} from '../src/shared/persistence/oracle-schema.js';
import {
  prefixed,
  rewriteDdlObjectNames,
  rewriteTableReferences,
} from '../src/shared/persistence/oracle-object-names.js';
import { dialectFor } from '../src/shared/persistence/sql-dialect.js';
import { TABLE_NAMES } from '../src/shared/persistence/schema.js';

const PREFIX = 'NEXUS_TEST_';

// Representative shapes covering every hard construct in the app's SQL. Each is authored the way the
// Oracle path emits it (VALUES already resolved to the DUAL form by the dialect) and must translate
// to Oracle with no Postgres-ism left behind.
const REPRESENTATIVE_SQL: Record<string, string> = {
  eventLookup: `SELECT id FROM tmf_event WHERE json_extract(event_data, '$.entityId') = ? ORDER BY id LIMIT 1`,
  scalarCharacteristic: `SELECT r.id, (SELECT ce->>'value' FROM jsonb_array_elements(NULLIF(r.characteristics, '')::jsonb) AS ce WHERE ce->>'name' = 'substatus' AND ce->>'group' IS NULL LIMIT 1) AS substatus FROM tmf_physical_resource r`,
  derivedTableLimitOffset: `SELECT * FROM (SELECT count(*) AS n FROM tmf_geographic_site) AS t ORDER BY name, id LIMIT ? OFFSET ?`,
  rowNumberDedup: `SELECT id, name FROM ( SELECT dedup.*, ROW_NUMBER() OVER (PARTITION BY id ORDER BY id) AS rn FROM (SELECT r.id, r.name FROM tmf_physical_resource r) dedup ) d WHERE d.rn = 1`,
  recursiveFrontier: `WITH RECURSIVE frontier(root_id, node_id, depth) AS ( SELECT v.id, v.id, 0 FROM (SELECT ? AS id FROM DUAL UNION ALL SELECT ? AS id FROM DUAL) v UNION ALL SELECT f.root_id, e.resource_to_id, f.depth+1 FROM frontier f JOIN tmf_resource_relationship e ON e.resource_from_id = f.node_id ) SELECT root_id, count(DISTINCT node_id) AS n FROM frontier GROUP BY root_id`,
  upsert: `INSERT INTO tmf_party(id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
  viewportLine: `SELECT r.id FROM tmf_logical_resource r JOIN tmf_geographic_location l ON l.id=r.place_id WHERE l.geometry_type='LineString' AND EXISTS (SELECT 1 FROM jsonb_array_elements(l.geometry::jsonb->'coordinates') AS v WHERE (v->>0)::float8 BETWEEN ? AND ? AND (v->>1)::float8 BETWEEN ? AND ?)`,
};

test('every representative query translates to Oracle without a Postgres-ism', () => {
  for (const [name, sql] of Object.entries(REPRESENTATIVE_SQL)) {
    assert.doesNotThrow(
      () => assertOracleCompatible(sql, PREFIX),
      `residual Postgres-ism in ${name}`,
    );
  }
});

test('translator rewrites the hard constructs to their Oracle form', () => {
  const upsert = transformOracleQuery(REPRESENTATIVE_SQL.upsert!, PREFIX);
  assert.match(upsert, /MERGE INTO NEXUS_TEST_tmf_party/);
  assert.doesNotMatch(upsert, /ON CONFLICT/i);

  const limit = transformOracleQuery(REPRESENTATIVE_SQL.derivedTableLimitOffset!, PREFIX);
  assert.match(limit, /OFFSET :\d+ ROWS FETCH NEXT :\d+ ROWS ONLY/);
  assert.doesNotMatch(limit, /\bLIMIT\b/i);
  assert.doesNotMatch(limit, /\)\s+AS\s+t\b/);

  const scalar = transformOracleQuery(REPRESENTATIVE_SQL.scalarCharacteristic!, PREFIX);
  assert.match(scalar, /JSON_TABLE\(r\.characteristics/);
  assert.match(scalar, /ce\.nm = 'substatus'/);
  assert.match(scalar, /ce\.grp IS NULL/);

  const event = transformOracleQuery(REPRESENTATIVE_SQL.eventLookup!, PREFIX);
  assert.match(event, /JSON_VALUE\(event_data, '\$\.entityId'\)/);
  assert.match(event, /FETCH FIRST 1 ROWS ONLY/);
});

test('toBinds is name-keyed so :n binds by name, not by array position (issue #43)', () => {
  // node-oracledb binds an ARRAY by appearance order, ignoring the number in `:n`. Since
  // transformOracleQuery reorders/reuses placeholders (LIMIT/OFFSET → OFFSET/FETCH; IN-list chunking),
  // positional binds land on the wrong value — OFFSET grabbing the LIMIT value returned 0 rows. A
  // name-keyed object makes the driver bind each `:n` to its 1-based value, immune to the reorder.
  const binds = toBinds(['a', 'b', 50, 0]) as Record<string, unknown>;
  assert.deepEqual(Object.keys(binds), ['1', '2', '3', '4']);
  assert.equal(binds['3'], 50);
  assert.equal(binds['4'], 0);

  // Per-value transforms survive: ISO datetime → Date, oversized string → CLOB bind spec.
  const big = 'x'.repeat(40_000);
  const typed = toBinds(['2026-08-13T10:00:00.000Z', big]) as Record<string, { val?: unknown }>;
  assert.ok(typed['1'] instanceof Date);
  assert.equal((typed['2'] as { val?: unknown }).val, big);
});

test('LIMIT/OFFSET rewrite stays aligned with name-keyed binds (issue #43)', () => {
  // FETCH must reference the LIMIT param (:1) and OFFSET the OFFSET param (:2). With name-keyed
  // binds, :1 = limit and :2 = offset regardless of the flipped textual order.
  const sql = transformOracleQuery(REPRESENTATIVE_SQL.derivedTableLimitOffset!, PREFIX);
  assert.match(sql, /OFFSET :2 ROWS FETCH NEXT :1 ROWS ONLY/);
  const binds = toBinds([50, 0]) as Record<string, unknown>;
  assert.equal(binds['1'], 50); // FETCH NEXT :1 → limit
  assert.equal(binds['2'], 0); // OFFSET :2 → offset
});

test('inlineRows differs by dialect: Postgres VALUES (N binds), Oracle JSON_TABLE (1 bind)', () => {
  const pg = dialectFor('postgres').inlineRows(['a', 'b'], 'v', 'id');
  assert.match(pg.sql, /\(VALUES \(\?\), \(\?\)\) AS v\(id\)/);
  assert.deepEqual(pg.binds, ['a', 'b']);

  // Oracle uses a single JSON-array bind (not an N-branch UNION ALL) so it scales to thousands.
  const ora = dialectFor('oracle').inlineRows(['a', 'b'], 'v', 'id');
  assert.match(
    ora.sql,
    /JSON_TABLE\(\?, '\$\[\*\]' COLUMNS \(id VARCHAR2\(4000\) PATH '\$'\)\)\) v/,
  );
  assert.doesNotMatch(ora.sql, /VALUES|DUAL/);
  assert.deepEqual(ora.binds, ['["a","b"]']);

  assert.throws(() => dialectFor('oracle').inlineRows([], 'v', 'id'), /at least one value/);
});

test('newRowId is a bind-free expression, one per dialect (issue #58)', () => {
  assert.equal(dialectFor('postgres').newRowId(), 'gen_random_uuid()::text');
  assert.equal(dialectFor('oracle').newRowId(), 'LOWER(RAWTOHEX(SYS_GUID()))');
});

test('every managed table name is prefixed in a table position', () => {
  for (const table of TABLE_NAMES) {
    const rewritten = rewriteTableReferences(`SELECT 1 FROM ${table} x`, PREFIX);
    assert.equal(rewritten, `SELECT 1 FROM ${prefixed(table, PREFIX)} x`);
  }
});

test('columns and CTE names that share a table name are left alone', () => {
  // `users` and `searches` are table names, but here they are select-list columns — not a table
  // position — so they must not be prefixed. Only the table after FROM is.
  const rewritten = rewriteTableReferences('SELECT users, searches FROM tmf_party', PREFIX);
  assert.equal(rewritten, `SELECT users, searches FROM ${prefixed('tmf_party', PREFIX)}`);

  // A CTE name is not a managed table name, so it is never touched even after FROM.
  const cte = rewriteTableReferences('WITH frontier AS (SELECT 1) SELECT * FROM frontier', PREFIX);
  assert.equal(cte, 'WITH frontier AS (SELECT 1) SELECT * FROM frontier');
});

test('DDL prefixes tables, indexes, constraints and references', () => {
  assert.match(
    rewriteDdlObjectNames('CREATE TABLE tmf_party (id VARCHAR2(36))', PREFIX),
    /CREATE TABLE NEXUS_TEST_tmf_party/,
  );
  assert.match(
    rewriteDdlObjectNames('CREATE INDEX idx_party_name ON tmf_party(name)', PREFIX),
    /CREATE INDEX NEXUS_TEST_idx_party_name ON NEXUS_TEST_tmf_party/,
  );
  assert.match(
    rewriteDdlObjectNames('ALTER TABLE tmf_party ADD CONSTRAINT ck_1 CHECK (name IS JSON)', PREFIX),
    /ALTER TABLE NEXUS_TEST_tmf_party ADD CONSTRAINT NEXUS_TEST_ck_1/,
  );
  assert.match(
    rewriteDdlObjectNames('... REFERENCES tmf_party(id)', PREFIX),
    /REFERENCES NEXUS_TEST_tmf_party/,
  );
});

test('research_session.context is never IS JSON-constrained, but mcp_confirmation.context still is', () => {
  // research_session.context holds the Nexus Copilot system prompt (free-form markdown), so an
  // IS JSON check makes every session INSERT fail with ORA-02290. mcp_confirmation.context genuinely
  // stores JSON, so its constraint must remain — guards against over-broad removal.
  const statements = splitOracleStatements(ORACLE_JSON_CONSTRAINTS_SQL);
  assert.ok(
    !statements.some((s) => /\bresearch_session\b[\s\S]*\(\s*context\s+IS JSON\s*\)/i.test(s)),
    'research_session.context must not carry an IS JSON constraint',
  );
  assert.ok(
    statements.some((s) => /\bmcp_confirmation\b[\s\S]*\(\s*context\s+IS JSON\s*\)/i.test(s)),
    'mcp_confirmation.context should still carry its IS JSON constraint',
  );
});

test('findPostgresisms catches constructs the translator cannot bridge', () => {
  // IS DISTINCT FROM against a column (not a quoted literal) is not handled by the translator.
  assert.throws(
    () => assertOracleCompatible('SELECT 1 FROM tmf_party a WHERE a.x IS DISTINCT FROM a.y'),
    /IS DISTINCT FROM/,
  );
  // A JSON arrow on an unmapped alias survives translation.
  assert.throws(() => assertOracleCompatible(`SELECT foo->>'bar' FROM tmf_party`), /->/);
  // A clean, already-Oracle string reports nothing.
  assert.deepEqual(
    findPostgresisms('SELECT id FROM NEXUS_TEST_tmf_party FETCH FIRST 1 ROWS ONLY'),
    [],
  );
});
