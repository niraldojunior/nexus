import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { PostgresDatabase } from '../src/shared/persistence/postgres-database.js';
import { PostgresEventRepository } from '../src/shared/tmf/postgres-event-repository.js';
import { createTestDatabase } from './test-utils.js';

afterEach(() => {
  PostgresDatabase.resetForTesting();
});

const setupDatabase = async () => {
  const database = createTestDatabase('nexus-event-repository-');
  const sqlite = PostgresDatabase.getInstance(database.databaseUrl);
  await sqlite.initialize();

  return {
    sqlite,
    cleanup: () => {
      PostgresDatabase.resetForTesting();
      database.cleanup();
    },
  };
};

test('PostgresEventRepository persists, updates and queries TMF688 events', async () => {
  const { sqlite, cleanup } = await setupDatabase();

  try {
    const repository = new PostgresEventRepository(sqlite);

    repository.appendEvent({
      '@type': 'Event',
      id: 'event-1',
      eventType: 'GeographicSiteCreatedEvent',
      eventTime: '2026-07-07T10:00:00.000Z',
      source: 'geo-service',
      eventData: { entityId: 'site-1', status: 'created' },
      correlationId: 'corr-1',
    });
    repository.appendEvent({
      '@type': 'Event',
      id: 'event-2',
      eventType: 'GeographicSiteUpdatedEvent',
      eventTime: '2026-07-07T10:05:00.000Z',
      source: 'geo-service',
      eventData: { entityId: 'site-1', status: 'updated' },
    });
    repository.appendEvent({
      '@type': 'Event',
      id: 'event-1',
      eventType: 'GeographicSiteRetiredEvent',
      eventTime: '2026-07-07T10:10:00.000Z',
      source: 'geo-service',
      eventData: { entityId: 'site-1', status: 'retired' },
      correlationId: 'corr-2',
    });

    const fetched = repository.getEvent('event-1');
    assert.equal(fetched?.eventType, 'GeographicSiteRetiredEvent');
    assert.equal(fetched?.correlationId, 'corr-2');
    assert.equal(fetched?.eventData.status, 'retired');

    const filtered = repository.listEvents({ source: 'geo-service', correlationId: 'corr-2' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, 'event-1');

    const ordered = repository.listEvents({ limit: 2 });
    assert.equal(ordered.length, 2);
    assert.equal(ordered[0]?.id, 'event-1');
    assert.equal(ordered[1]?.id, 'event-2');

    const offset = repository.listEvents({ limit: 1, offset: 1 });
    assert.equal(offset.length, 1);
    assert.equal(offset[0]?.id, 'event-2');
  } finally {
    cleanup();
  }
});
