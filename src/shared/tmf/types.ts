export type TimePeriod = {
  startDateTime?: string;
  endDateTime?: string;
};

export type CharacteristicValue = string | number | boolean | Record<string, unknown> | null;

export type Characteristic = {
  group?: string;
  name: string;
  value: CharacteristicValue;
  valueType?: 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'json';
};

export type EntityRef = {
  id: string;
  '@referredType': string;
  href?: string;
  name?: string;
};

export type RelatedParty = EntityRef & {
  role?: string;
};

export type Pagination = {
  limit?: number;
  offset?: number;
  totalCount?: number;
};

export type TmfEvent = {
  '@type': 'Event';
  id: string;
  eventType: string;
  eventTime: string;
  source: string;
  eventData: Record<string, unknown>;
  correlationId?: string;
};

export type TmfEventQuery = {
  eventType?: string;
  source?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};
