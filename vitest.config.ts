export default {
  test: {
    environment: 'jsdom',
    // The Neon/Postgres-backed suites share a single database; running the files in parallel
    // saturates the connection pool (dropped queries, 500s, deadlock on DROP SCHEMA). Serialize
    // the files to keep the run deterministic.
    fileParallelism: false,
    // DB-backed tests do many Neon HTTP round-trips through the proxy; the default 5s per-test /
    // 10s per-hook budget is far too short. Give them generous ceilings.
    testTimeout: 120000,
    hookTimeout: 120000,
    // TLS note: behind a corporate TLS-inspection proxy Node rejects Neon's self-signed chain.
    // --use-system-ca (trust the OS certificate store) must be set on the main node process — it is
    // process-global, so the `test:unit` script launches node with it (see package.json).
    include: [
      'test/**/*.spec.ts',
      'web/src/**/*.test.ts',
      'web/src/**/*.test.tsx',
    ],
    exclude: [
      'test/system/**',
      'test/*.integration.spec.ts',
      'test/*.e2e.spec.ts',
      'test/*-management.spec.ts',
      'dist/**',
      'node_modules/**',
    ],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'web/src/**/*.{ts,tsx}'],
      exclude: [
        'dist/**',
        'node_modules/**',
        'src/main.ts',
        'web/src/main.tsx',
        '**/*.d.ts',
        '**/*.js',
        '**/*.map',
      ],
    },
  },
};
