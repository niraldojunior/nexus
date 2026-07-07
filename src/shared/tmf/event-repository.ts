import type { TmfEvent, TmfEventQuery } from './types.js';

export type AppendEventInput = Omit<TmfEvent, '@type' | 'id' | 'eventTime'> & {
  id?: string;
  eventTime?: string;
};

export interface IEventRepository {
  appendEvent(event: TmfEvent): TmfEvent;
  getEvent(id: string): TmfEvent | undefined;
  listEvents(query?: TmfEventQuery): TmfEvent[];
}
