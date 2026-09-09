// Runs the Oracle-facing specs against a real Oracle instance in a single worker because
// DEV/HML/PRD/TEST share one schema — the whole suite runs under the NEXUS_TEST_ prefix, so
// parallel workers would collide on the same objects.
//
// Prerequisites in .env: ORACLE_CONNECTION_STRING, ORACLE_USER, ORACLE_PASSWORD, and a test prefix
// (ORACLE_OBJECT_PREFIX / ORACLE_TEST_OBJECT_PREFIX ending in _TEST_). The run auto-creates the
// prefixed schema, so the Oracle user needs DDL privileges.

import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  [
    '--use-system-ca',
    'node_modules/vitest/vitest.mjs',
    'run',
    '--pool',
    'threads',
    '--no-file-parallelism',
    '--config',
    'vitest.config.ts',
    ...(process.argv.includes('--coverage') ? ['--coverage'] : []),
    'test/oracle-dialect.spec.ts',
    'test/database-client.contract.spec.ts',
    'test/oracle-roundtrip.spec.ts',
    'test/settings-endpoints.oracle.spec.ts',
    'test/service-repository.oracle.spec.ts',
    'test/resource.oracle.spec.ts',
    'test/search.oracle-repository.spec.ts',
    'test/event-repository.oracle.spec.ts',
    'test/order.unit.spec.ts',
    'test/service.unit.spec.ts',
    'test/shared-persistence.spec.ts',
    'test/geo.integration.spec.ts',
    'test/geo.e2e.spec.ts',
    'test/geo.map-tile.integration.spec.ts',
    'test/geo-project.unit.spec.ts',
    'test/order-management.spec.ts',
    'test/party-management.spec.ts',
    'test/resource-management.spec.ts',
    'test/service-management.spec.ts',
    'test/tmf-functional-routes.integration.spec.ts',
    'test/auth.integration.spec.ts',
    'test/rbac.integration.spec.ts',
    'test/tenant-isolation.integration.spec.ts',
    'test/party-role-type-characteristic.unit.spec.ts',
    'test/mcp.module.spec.ts',
    'test/mcp-http.spec.ts',
    'test/mcp-geo-workflow.spec.ts',
    'test/mcp-stdio-server.integration.spec.ts',
    'test/app-http-routes.integration.spec.ts',
    'test/event-management.spec.ts',
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
