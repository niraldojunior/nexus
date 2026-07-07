import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { EventService } from '../src/shared/tmf/event-service.js';

const createRepository = () => {
  const events = new Map<string, ReturnType<EventService['appendEvent']>>();
  return {
    appendEvent: vi.fn((event) => {
      events.set(event.id, event);
      return event;
    }),
    getEvent: vi.fn((id: string) => events.get(id)),
    listEvents: vi.fn(() => Array.from(events.values())),
  };
};

test('EventService trims canonical fields, clones event data and delegates persistence', () => {
  const repository = createRepository();
  const service = new EventService(repository);
  const payload = { entityId: 'geo-1', nested: { status: 'active' } };

  const event = service.appendEvent({
    id: 'event-1',
    eventType: '  GeographicSiteCreatedEvent  ',
    source: '  geo-service  ',
    eventData: payload,
    correlationId: '  corr-1  ',
    eventTime: '2026-07-07T10:00:00.000Z',
  });

  payload.nested.status = 'mutated';

  assert.equal(event.id, 'event-1');
  assert.equal(event.eventType, 'GeographicSiteCreatedEvent');
  assert.equal(event.source, 'geo-service');
  assert.equal(event.correlationId, 'corr-1');
  assert.equal(event.eventTime, '2026-07-07T10:00:00.000Z');
  const storedPayload = event.eventData as { nested: { status: string } };
  assert.equal(storedPayload.nested.status, 'active');
  assert.equal(repository.appendEvent.mock.calls.length, 1);
});

test('EventService rejects malformed event payloads', () => {
  const service = new EventService(createRepository());

  assert.throws(
    () =>
      service.appendEvent({
        eventType: ' ',
        source: 'geo-service',
        eventData: {},
      }),
    /eventType is required/,
  );

  assert.throws(
    () =>
      service.appendEvent({
        eventType: 'Created',
        source: ' ',
        eventData: {},
      }),
    /source is required/,
  );

  assert.throws(
    () =>
      service.appendEvent({
        eventType: 'Created',
        source: 'geo-service',
        eventData: [] as unknown as Record<string, unknown>,
      }),
    /eventData must be an object/,
  );
});
