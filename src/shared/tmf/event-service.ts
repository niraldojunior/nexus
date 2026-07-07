import { createCanonicalId } from '../utils/canonical-id.js';
import type { AppendEventInput, IEventRepository } from './event-repository.js';
import type { TmfEvent, TmfEventQuery } from './types.js';

export class EventService {
  public constructor(private readonly repository: IEventRepository) {}

  public appendEvent(input: AppendEventInput): TmfEvent {
    this.assertEventShape(input.eventType, input.source, input.eventData);

    const event: TmfEvent = {
      '@type': 'Event',
      id: input.id ?? createCanonicalId(),
      eventType: input.eventType.trim(),
      eventTime: input.eventTime ?? new Date().toISOString(),
      source: input.source.trim(),
      eventData: structuredClone(input.eventData),
      ...(input.correlationId ? { correlationId: input.correlationId.trim() } : {}),
    };

    return this.repository.appendEvent(event);
  }

  public getEvent(id: string): TmfEvent | undefined {
    return this.repository.getEvent(id);
  }

  public listEvents(query?: TmfEventQuery): TmfEvent[] {
    return this.repository.listEvents(query);
  }

  private assertEventShape(eventType: string, source: string, eventData: Record<string, unknown>): void {
    if (typeof eventType !== 'string' || eventType.trim().length === 0) {
      throw new Error('eventType is required');
    }
    if (typeof source !== 'string' || source.trim().length === 0) {
      throw new Error('source is required');
    }
    if (!eventData || typeof eventData !== 'object' || Array.isArray(eventData)) {
      throw new Error('eventData must be an object');
    }
  }
}
