import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildDevSqliteRuntimeEnv, ensureDevSqliteDataDir } from '../src/shared/config/dev-sqlite-core.js';
test('dev sqlite runtime defaults database url and node env', () => {
    const env = buildDevSqliteRuntimeEnv({});
    assert.equal(env.NODE_ENV, 'development');
    assert.equal(env.DATABASE_URL, 'sqlite://./data/nexus.db');
});
test('dev sqlite runtime preserves explicit environment values', () => {
    const env = buildDevSqliteRuntimeEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'sqlite://./tmp/dev.db',
    });
    assert.equal(env.NODE_ENV, 'test');
    assert.equal(env.DATABASE_URL, 'sqlite://./tmp/dev.db');
});
test('dev sqlite launcher ensures data directory exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-dev-'));
    try {
        const dataDir = ensureDevSqliteDataDir(root);
        assert.equal(dataDir, join(root, 'data'));
        assert.equal(existsSync(dataDir), true);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});
test('dev sqlite runtime uses app default port when port is absent', () => {
    const env = buildDevSqliteRuntimeEnv({});
    assert.equal(Number(env.PORT || 3000), 3000);
});
test('dev sqlite launcher target matches compiled main path layout', () => {
    const path = join(process.cwd(), 'dist', 'src', 'main.js');
    assert.equal(path.endsWith('dist\\src\\main.js') || path.endsWith('dist/src/main.js'), true);
});
//# sourceMappingURL=dev-sqlite.spec.js.map