type Awaitable<T> = T | Promise<T>;

import type { TmfEvent, TmfEventQuery } from './types.js';

export type AppendEventInput = Omit<TmfEvent, '@type' | 'id' | 'eventTime'> & {
  id?: string;
  eventTime?: string;
};

export interface IEventRepository {
  appendEvent(event: TmfEvent): Awaitable<TmfEvent>;
  getEvent(id: string): Awaitable<TmfEvent | undefined>;
  listEvents(query?: TmfEventQuery): Awaitable<TmfEvent[]>;
}
