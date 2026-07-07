import type { SqliteDatabase } from '../persistence/sqlite-database.js';
import type { IEventRepository } from './event-repository.js';
import type { TmfEvent, TmfEventQuery } from './types.js';

export class SqliteEventRepository implements IEventRepository {
  public constructor(private readonly db: SqliteDatabase) {}

  public appendEvent(event: TmfEvent): TmfEvent {
    this.db.run(
      `INSERT INTO tmf_event (id, event_type, event_time, source, event_data, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       event_type = excluded.event_type,
       event_time = excluded.event_time,
       source = excluded.source,
       event_data = excluded.event_data,
       correlation_id = excluded.correlation_id`,
      [
        event.id,
        event.eventType,
        event.eventTime,
        event.source,
        JSON.stringify(event.eventData),
        event.correlationId ?? null,
      ],
    );

    return this.getEvent(event.id) ?? event;
  }

  public getEvent(id: string): TmfEvent | undefined {
    const row = this.db.get<{
      id: string;
      event_type: string;
      event_time: string;
      source: string;
      event_data: string;
      correlation_id?: string | null;
    }>(
      `SELECT id, event_type, event_time, source, event_data, correlation_id
       FROM tmf_event
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapRow(row) : undefined;
  }

  public listEvents(query?: TmfEventQuery): TmfEvent[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.eventType) {
      conditions.push('event_type = ?');
      params.push(query.eventType);
    }
    if (query?.source) {
      conditions.push('source = ?');
      params.push(query.source);
    }
    if (query?.correlationId) {
      conditions.push('correlation_id = ?');
      params.push(query.correlationId);
    }
    if (query?.from) {
      conditions.push('event_time >= ?');
      params.push(query.from);
    }
    if (query?.to) {
      conditions.push('event_time <= ?');
      params.push(query.to);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const limitClause = hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '';
    const offsetClause = hasOffset ? 'OFFSET ?' : '';

    const sql = [
      'SELECT id, event_type, event_time, source, event_data, correlation_id FROM tmf_event',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY event_time DESC, id DESC',
      limitClause,
      offsetClause,
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = this.db.all<{
      id: string;
      event_type: string;
      event_time: string;
      source: string;
      event_data: string;
      correlation_id?: string | null;
    }>(sql, params);

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: {
    id: string;
    event_type: string;
    event_time: string;
    source: string;
    event_data: string;
    correlation_id?: string | null;
  }): TmfEvent {
    const event: TmfEvent = {
      '@type': 'Event',
      id: row.id,
      eventType: row.event_type,
      eventTime: row.event_time,
      source: row.source,
      eventData: JSON.parse(row.event_data || '{}') as Record<string, unknown>,
    };

    if (row.correlation_id) {
      event.correlationId = row.correlation_id;
    }

    return event;
  }
}
