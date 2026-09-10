export default {
  test: {
    environment: 'jsdom',
    // Oracle-backed specs share one prefixed schema, so they must never run concurrently.
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 120000,
    hookTimeout: 120000,
    include: ['test/**/*.spec.ts'],
    exclude: ['test/system/**', 'dist/**', 'node_modules/**'],
    setupFiles: ['test/setup.ts'],
  },
};
