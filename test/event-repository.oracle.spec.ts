import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import { OracleEventRepository } from '../src/shared/tmf/oracle-event-repository.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// Oracle round-trip coverage for TMF688 event persistence. `appendEvent` upserts via an
// `INSERT ... ON CONFLICT DO UPDATE` that the Oracle dialect translator rewrites into a `MERGE`
// (see transformUpsertToMerge in oracle-database.ts) — that translation only proves itself against
// a real Oracle instance, so this runs the same way as oracle-roundtrip.spec.ts: skips unless
// ORACLE_* is configured. Run with `npm run test:oracle`.
const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

test.skipIf(!oracleConfigured)(
  'OracleEventRepository persists, updates and queries TMF688 events',
  async () => {
    const client = await getOracleTestClient();
    const repository = new OracleEventRepository(client);

    await repository.appendEvent({
      '@type': 'Event',
      id: 'event-1',
      eventType: 'GeographicSiteCreatedEvent',
      eventTime: '2026-07-07T10:00:00.000Z',
      source: 'geo-service',
      eventData: { entityId: 'site-1', status: 'created' },
      correlationId: 'corr-1',
    });
    await repository.appendEvent({
      '@type': 'Event',
      id: 'event-2',
      eventType: 'GeographicSiteUpdatedEvent',
      eventTime: '2026-07-07T10:05:00.000Z',
      source: 'geo-service',
      eventData: { entityId: 'site-1', status: 'updated' },
    });
    await repository.appendEvent({
      '@type': 'Event',
      id: 'event-1',
      eventType: 'GeographicSiteRetiredEvent',
      eventTime: '2026-07-07T10:10:00.000Z',
      source: 'geo-service',
      eventData: { entityId: 'site-1', status: 'retired' },
      correlationId: 'corr-2',
    });

    const fetched = await repository.getEvent('event-1');
    assert.equal(fetched?.eventType, 'GeographicSiteRetiredEvent');
    assert.equal(fetched?.correlationId, 'corr-2');
    assert.equal(fetched?.eventData.status, 'retired');

    const filtered = await repository.listEvents({
      source: 'geo-service',
      correlationId: 'corr-2',
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, 'event-1');

    const ordered = await repository.listEvents({ limit: 2 });
    assert.equal(ordered.length, 2);
    assert.equal(ordered[0]?.id, 'event-1');
    assert.equal(ordered[1]?.id, 'event-2');

    const offset = await repository.listEvents({ limit: 1, offset: 1 });
    assert.equal(offset.length, 1);
    assert.equal(offset[0]?.id, 'event-2');
  },
);
