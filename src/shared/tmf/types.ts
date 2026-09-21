export type TimePeriod = {
  startDateTime?: string;
  endDateTime?: string;
};

export type CharacteristicValue = string | number | boolean | Record<string, unknown> | null;

/**
 * Nível em que a característica é preenchida. Só tem significado onde o `Characteristic` atua como
 * *definição* (ex.: `ResourceType.resourceTypeCharacteristic`), nunca em arrays de valor
 * (`Resource.characteristic`). Ausência ⇒ `'specification'` (issue #273) — característica legada
 * sem o campo é tratada como especificação, sem backfill.
 */
export type CharacteristicLevel = 'specification' | 'instance';

export type Characteristic = {
  group?: string;
  name: string;
  description?: string;
  value: CharacteristicValue;
  valueType?:
    | 'string'
    | 'integer'
    | 'decimal'
    | 'boolean'
    | 'date'
    | 'image'
    | 'list'
    | 'enum'
    | 'organization'
    | 'json';
  /** Opções permitidas quando `valueType === 'list'` ou `'enum'`, digitadas inline. */
  allowedValues?: string[];
  /**
   * Alternativa a `allowedValues` inline: chave estável (não `id`, que muda a cada publish) de um
   * conjunto publicado em Studio -> Dados de Referência (issue #196). As opções são resolvidas em
   * runtime contra o catálogo publicado — nunca copiadas para cá. Mutuamente exclusivo com
   * `allowedValues`; mantido opcional para não quebrar characteristics existentes com lista inline.
   */
  referenceDataSetKey?: string;
  /** Ver `CharacteristicLevel` (issue #273). Presente apenas quando `'instance'`. */
  characteristicLevel?: CharacteristicLevel;
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
