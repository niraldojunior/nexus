export type TimePeriod = {
  startDateTime?: string;
  endDateTime?: string;
};

export type CharacteristicValue = string | number | boolean | Record<string, unknown> | null;

export type Characteristic = {
  group?: string;
  name: string;
  description?: string;
  value: CharacteristicValue;
  valueType?: 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'list' | 'enum' | 'json';
  /** Opções permitidas quando `valueType === 'list'` ou `'enum'`, digitadas inline. */
  allowedValues?: string[];
  /**
   * Alternativa a `allowedValues` inline: chave estável (não `id`, que muda a cada publish) de um
   * conjunto publicado em Studio -> Dados de Referência (issue #196). As opções são resolvidas em
   * runtime contra o catálogo publicado — nunca copiadas para cá. Mutuamente exclusivo com
   * `allowedValues`; mantido opcional para não quebrar characteristics existentes com lista inline.
   */
  referenceDataSetKey?: string;
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
