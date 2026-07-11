export default {
  test: {
    environment: 'jsdom',
    // Each Vitest worker now owns its own Neon schema (see test/test-utils.ts) and no longer drops
    // schemas mid-run, so parallel files no longer deadlock. Run files in parallel, but cap the
    // worker count to stay within the direct endpoint's connection budget.
    fileParallelism: true,
    // Cap worker threads so parallel files stay within Neon's connection budget (each worker owns
    // its own schema + pool). Top-level in Vitest 4 (the old `poolOptions.threads` was removed).
    minWorkers: 1,
    maxWorkers: 4,
    // Drops leftover `nexus_test_%` schemas before the run and after it.
    globalSetup: ['test/global-setup.ts'],
    // DB-backed tests still cross the corporate proxy to Neon; keep generous ceilings so slow
    // round-trips never trip the default 5s per-test / 10s per-hook budget.
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
