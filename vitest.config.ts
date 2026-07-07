export default {
  test: {
    environment: 'jsdom',
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
