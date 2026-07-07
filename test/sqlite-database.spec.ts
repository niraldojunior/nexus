import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { afterEach, test } from 'vitest';
import { SqliteDatabase } from '../src/shared/persistence/sqlite-database.js';

afterEach(() => {
  SqliteDatabase.resetForTesting();
});

test('SqliteDatabase normalizes sqlite URLs and initializes idempotently', async () => {
  const relativePath = './data/test-sqlite-database-spec.db';
  const sqlite = SqliteDatabase.getInstance(`sqlite://${relativePath}`);

  try {
    await sqlite.initialize();
    await sqlite.initialize();

    const dbList = sqlite
      .getDatabase()
      .prepare('PRAGMA database_list')
      .all() as Array<{ file: string }>;
    const mainDb = dbList.find((entry) => entry.file);

    assert.ok(mainDb);
    assert.ok(mainDb?.file.endsWith('data\\test-sqlite-database-spec.db') || mainDb?.file.endsWith('data/test-sqlite-database-spec.db'));
    assert.equal(existsSync(mainDb?.file ?? ''), true);
  } finally {
    SqliteDatabase.resetForTesting();
    rmSync('./data/test-sqlite-database-spec.db', { force: true });
  }
});

test('SqliteDatabase resetForTesting allows a fresh singleton instance', () => {
  const first = SqliteDatabase.getInstance(':memory:');
  const second = SqliteDatabase.getInstance(':memory:');

  assert.strictEqual(first, second);

  SqliteDatabase.resetForTesting();

  const third = SqliteDatabase.getInstance(':memory:');
  assert.notStrictEqual(first, third);

  SqliteDatabase.resetForTesting();
});
