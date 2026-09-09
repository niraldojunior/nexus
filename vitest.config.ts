export default {
  test: {
    environment: 'jsdom',
    // The default suite is database-free. Oracle integration runs through `test:oracle` with a
    // single worker and a dedicated NEXUS_TEST_ object prefix.
    fileParallelism: true,
    // Top-level in Vitest 4 (the old `poolOptions.threads` was removed).
    minWorkers: 1,
    maxWorkers: 4,
    // Oracle round-trips can take longer than pure unit tests.
    testTimeout: 120000,
    hookTimeout: 120000,
    // `--use-system-ca` lets the Oracle driver trust the corporate TLS-inspection chain.
    // --use-system-ca (trust the OS certificate store) must be set on the main node process — it is
    // process-global, so the `test:unit` script launches node with it (see package.json).
    include: ['test/**/*.spec.ts', 'web/src/**/*.test.ts', 'web/src/**/*.test.tsx'],
    exclude: [
      'test/system/**',
      'test/**/*.integration.spec.ts',
      'test/**/*.e2e.spec.ts',
      'test/*-management.spec.ts',
      'test/mcp.module.spec.ts',
      'test/mcp-http.spec.ts',
      'test/mcp-geo-workflow.spec.ts',
      'test/geo-project.unit.spec.ts',
      'test/order.unit.spec.ts',
      'test/service.unit.spec.ts',
      'test/shared-persistence.spec.ts',
      'test/party-role-type-characteristic.unit.spec.ts',
      'test/resource.oracle.spec.ts',
      'test/search.oracle-repository.spec.ts',
      'test/event-repository.oracle.spec.ts',
      'test/database-client.contract.spec.ts',
      'test/oracle-roundtrip.spec.ts',
      'test/service-repository.oracle.spec.ts',
      'test/settings-endpoints.oracle.spec.ts',
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
