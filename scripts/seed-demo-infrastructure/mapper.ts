/**
 * Funções puras do seed de infraestrutura pública (ANEEL SIGEL → Nexus DEMO).
 *
 * Tudo aqui é testável sem banco e sem rede: parsing do `PopupInfo` (HTML), resolução de UF,
 * filtro espacial, normalização de geometria, ids determinísticos e characteristics.
 */

import { createHash } from 'node:crypto';

/** Sistema de origem gravado em `_origin.system` de todo item importado (C5). */
export const ORIGIN_SYSTEM = 'ANEEL_SIGEL';

/**
 * Código da `GeographicSiteSpecification` da subestação.
 *
 * Constante compartilhada de propósito: ela é ao mesmo tempo o `code` gravado no catálogo e o
 * `entity.sourceId` do nó LOCAL publicado no Studio GEO. O `materialize` do adapter NÃO valida nós
 * LOCAL (só COVERAGE e RESOURCE — studio-geo-adapter.ts:1020), então um `sourceId` divergente do
 * `sp.code` publica limpo, o indexador grava `source_model_id = sp.code`, `nodeForMapFeature` não
 * encontra camada e o mapa fica vazio em silêncio. Um símbolo só elimina a classe do bug.
 */
export const SUBSTATION_SITE_SPEC_CODE = 'ENERGY_SUBSTATION';

/** Códigos dos `ResourceType` criados pelo seed — também os `sourceId` dos nós RESOURCE. */
export const SUBSTATION_RESOURCE_TYPE_CODE = 'EnergySubstation';
export const TRANSMISSION_LINE_RESOURCE_TYPE_CODE = 'EnergyTransmissionLine';

/** Entidades de origem (compõem a chave de idempotência e `_origin.entity`). */
export const SUBSTATION_ENTITY = 'SUBSTATION';
export const TRANSMISSION_LINE_ENTITY = 'TRANSMISSION_LINE';

/**
 * Namespace UUID v5 próprio do seed. Não reusa `NEXUS_NETWIN_NAMESPACE`: os espaços de id precisam
 * ser disjuntos para que um `OID` da ANEEL nunca colida com um id do Netwin.
 */
export const DEMO_INFRA_NAMESPACE = '3f6c1a58-9d24-4b77-8e05-2a91c4de7b63';

/** Caixas envolventes por UF, no formato [latMin, latMax, lonMin, lonMax] (iguais a uf-geo.mjs). */
export const UF_BBOX: Record<string, readonly [number, number, number, number]> = {
  RJ: [-23.5, -20.6, -45.0, -40.8],
  SP: [-25.5, -19.6, -53.3, -44.0],
};

export type Bbox = { latMin: number; latMax: number; lonMin: number; lonMax: number };

export const bboxForUf = (uf: string): Bbox => {
  const box = UF_BBOX[uf.toUpperCase()];
  if (!box) throw new Error(`UF sem caixa envolvente conhecida: ${uf}`);
  const [latMin, latMax, lonMin, lonMax] = box;
  return { latMin, latMax, lonMin, lonMax };
};

/** Envelope da união das UFs — é o que vai no parâmetro `geometry` da consulta ArcGIS. */
export function bboxForStates(states: readonly string[]): Bbox {
  if (states.length === 0) throw new Error('Informe ao menos uma UF.');
  return states.map(bboxForUf).reduce((union, box) => ({
    latMin: Math.min(union.latMin, box.latMin),
    latMax: Math.max(union.latMax, box.latMax),
    lonMin: Math.min(union.lonMin, box.lonMin),
    lonMax: Math.max(union.lonMax, box.lonMax),
  }));
}

export const inBbox = (box: Bbox, lon: number, lat: number): boolean =>
  lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax;

/** UFs cuja caixa envolvente contém o ponto. Caixas se sobrepõem, então pode devolver mais de uma. */
export const ufsContaining = (states: readonly string[], lon: number, lat: number): string[] =>
  states.filter((uf) => inBbox(bboxForUf(uf), lon, lat));

// ---------------------------------------------------------------------------
// PopupInfo
// ---------------------------------------------------------------------------

/**
 * Campos que o seed extrai do `PopupInfo`. As camadas do SIGEL vêm de KML: não há atributo
 * estruturado de tensão, extensão, agente ou capacidade — só este HTML.
 */
export type PopupFields = {
  nome?: string;
  tensaoKv?: number;
  extensaoKm?: number;
  operador?: string;
  capacidadeMw?: number;
};

const stripTags = (value: string): string => value.replace(/<[^>]*>/g, ' ');

/**
 * Converte número em formato brasileiro. A fonte mistura as duas convenções no mesmo registro
 * (`Tensão: 34,5 Kv` no popup contra `34P5` no `Name`), então a vírgula decimal é obrigatória.
 */
export function parseBrazilianNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  if (cleaned === '') return undefined;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Extrai os pares `<b>Rótulo: </b>valor` do `PopupInfo`.
 *
 * Os valores reais vêm com espaço em excesso à direita (`"B. FLUMINENSE       "`), herdado do KML,
 * daí o `trim` em cada um. `Capacidade: 0 MW` significa capacidade desconhecida, não zero: emitir
 * `0` viraria filtro e popup mentirosos, então o campo é omitido.
 */
export function parsePopupInfo(popupInfo: string | null | undefined): PopupFields {
  if (!popupInfo) return {};
  const text = stripTags(String(popupInfo)).replace(/&nbsp;?/gi, ' ');
  const fields: PopupFields = {};

  const grab = (label: string): string | undefined => {
    // Para no próximo rótulo conhecido (ou no fim), porque o valor pode conter espaços.
    const pattern = new RegExp(
      `${label}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:Nome|Tens[ãa]o|Extens[ãa]o|Agente|Capacidade)\\s*:|$)`,
      'i',
    );
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    return value === undefined || value === '' ? undefined : value;
  };

  const nome = grab('Nome');
  if (nome) fields.nome = nome;

  const tensao = parseBrazilianNumber(grab('Tens[ãa]o')?.replace(/\s*k?v\s*$/i, ''));
  if (tensao !== undefined && tensao > 0) fields.tensaoKv = tensao;

  const extensao = parseBrazilianNumber(grab('Extens[ãa]o')?.replace(/\s*km\s*$/i, ''));
  if (extensao !== undefined && extensao > 0) fields.extensaoKm = extensao;

  const agente = grab('Agente');
  if (agente) fields.operador = agente;

  const capacidade = parseBrazilianNumber(grab('Capacidade')?.replace(/\s*mw\s*$/i, ''));
  // `0 MW` é "não informado" na fonte — ver nota acima.
  if (capacidade !== undefined && capacidade > 0) fields.capacidadeMw = capacidade;

  return fields;
}

// ---------------------------------------------------------------------------
// Nome e UF
// ---------------------------------------------------------------------------

/** Colapsa os espaços múltiplos que a fonte traz (`"Linha LT  230 kV  X / Y  SP"`). */
export const normalizeName = (raw: string | null | undefined): string =>
  String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * UFs declaradas no sufixo do `Name` da linha (`"... C 1  RS"`, `"... MG/SP"`).
 *
 * Devolve `[]` quando não há sufixo reconhecível — 1 das 476 linhas do escopo (`ROCPV-6ARA21SP`)
 * não segue o padrão.
 */
export function ufsFromName(raw: string | null | undefined): string[] {
  const name = normalizeName(raw);
  const match = /\s([A-Z]{2}(?:\/[A-Z]{2})*)$/.exec(name);
  const suffix = match?.[1];
  if (!suffix) return [];
  return suffix.split('/');
}

/**
 * Resolve a UF de uma linha: sufixo do `Name` quando houver, senão as caixas que contêm o primeiro
 * vértice.
 *
 * O sufixo é bi-estadual em 28 de 476 linhas (`MG/SP`, `RJ/SP`, `SP/MS`), e o valor devolvido
 * preserva a composição (`'RJ/SP'`) em vez de escolher uma — a linha é uma só e atravessa as duas.
 */
export function resolveUf(
  name: string | null | undefined,
  states: readonly string[],
  vertices: ReadonlyArray<readonly [number, number]> = [],
): string | undefined {
  const declared = ufsFromName(name);
  if (declared.length > 0) return declared.join('/');
  // Sem sufixo, a UF vem da geometria — e de TODOS os vértices, não só do primeiro: uma rota pode
  // começar fora das caixas e entrar no escopo depois (é o caso de `ROCPV-6ARA21SP`).
  const containing = new Set<string>();
  for (const [lon, lat] of vertices) {
    for (const uf of ufsContaining(states, lon, lat)) containing.add(uf);
  }
  return containing.size > 0 ? [...containing].join('/') : undefined;
}

/**
 * Decide se uma linha pertence ao escopo pedido.
 *
 * O envelope retangular da consulta ArcGIS não basta: das 476 linhas que ele devolve para RJ+SP,
 * 175 têm sufixo exclusivamente PR, MG, MS ou ES — atravessam o retângulo sem tocar o escopo. E a
 * caixa de SP contém Telêmaco Borba (PR), então nem o teste de ponto resolve. Quando a fonte
 * declara a UF, ela é a autoridade; só na ausência do sufixo o critério cai para a geometria.
 */
export function lineInScope(
  name: string | null | undefined,
  states: readonly string[],
  vertices: ReadonlyArray<readonly [number, number]>,
): boolean {
  const wanted = new Set(states.map((uf) => uf.toUpperCase()));
  const declared = ufsFromName(name);
  if (declared.length > 0) return declared.some((uf) => wanted.has(uf));
  return vertices.some(([lon, lat]) => ufsContaining(states, lon, lat).length > 0);
}

/**
 * Decide se uma subestação pertence ao escopo. A camada de subestações não traz UF alguma (nem no
 * `Name`, nem no `PopupInfo`), então aqui o critério é necessariamente espacial — 14 das 145 que o
 * envelope devolve caem fora das caixas de RJ e SP.
 */
export const substationInScope = (
  states: readonly string[],
  lon: number,
  lat: number,
): boolean => ufsContaining(states, lon, lat).length > 0;

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

export type Point = { type: 'Point'; coordinates: [number, number] };
export type LineString = { type: 'LineString'; coordinates: Array<[number, number]> };

const isFinitePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

export function toGeoJsonPoint(coordinates: unknown): Point | undefined {
  if (!isFinitePair(coordinates)) return undefined;
  return { type: 'Point', coordinates: [coordinates[0], coordinates[1]] };
}

/**
 * Normaliza a geometria de uma linha preservando **todos** os vértices.
 *
 * `tmf_geographic_location.geometry_type` só aceita `Point|LineString|Polygon`, então uma
 * `MultiLineString` é devolvida como N partes — uma Location e um recurso por parte, com
 * `_origin.id` sufixado — em vez de ser achatada. Nunca reduzir a rota aos extremos: a geometria
 * original é requisito da entrega.
 *
 * Vértices repetidos são mantidos como vêm (a fonte tem casos reais, p.ex. OID 35 repete o 1º
 * vértice na 3ª posição); só partes com menos de 2 pontos são descartadas, porque o indexador do
 * mapa as rejeita de todo modo (build-map-features.mjs:341).
 */
export function toGeoJsonLines(geometry: unknown): LineString[] {
  const geo = geometry as { type?: unknown; coordinates?: unknown } | null | undefined;
  if (!geo || typeof geo.type !== 'string') return [];

  const parts: unknown[] =
    geo.type === 'LineString'
      ? [geo.coordinates]
      : geo.type === 'MultiLineString' && Array.isArray(geo.coordinates)
        ? geo.coordinates
        : [];

  const lines: LineString[] = [];
  for (const part of parts) {
    if (!Array.isArray(part)) continue;
    const coordinates = part.filter(isFinitePair).map(([lon, lat]) => [lon, lat] as [number, number]);
    if (coordinates.length < 2) continue;
    lines.push({ type: 'LineString', coordinates });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Identidade determinística
// ---------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID v5 (SHA-1) — mesmo algoritmo de `src/scripts/netwin-migration/identity.ts`, reescrito aqui
 * porque aquele módulo carrega o namespace do Netwin junto.
 */
export function deterministicUuid(namespaceUuid: string, name: string): string {
  if (!UUID_PATTERN.test(namespaceUuid)) {
    throw new Error(`Namespace UUID inválido: ${namespaceUuid}`);
  }
  const namespaceBytes = Buffer.from(namespaceUuid.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(namespaceBytes).update(Buffer.from(name, 'utf8')).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // `bytes[n]!` em vez de `bytes[n]`: o buffer tem 16 bytes garantidos, mas
  // `noUncheckedIndexedAccess` não enxerga isso.
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Id estável de um item importado. A chave é `sistema:entidade:id-externo` — reexecutar o seed no
 * mesmo escopo atualiza as mesmas linhas, nunca duplica.
 */
export const demoId = (entity: string, sourceId: string | number, part?: number): string =>
  deterministicUuid(
    DEMO_INFRA_NAMESPACE,
    `${ORIGIN_SYSTEM}:${entity}:${sourceId}${part === undefined ? '' : `:${part}`}`,
  );

/** `_origin.id` acompanha o sufixo de parte, para que cada parte tenha origem rastreável única. */
export const originId = (sourceId: string | number, part?: number): string =>
  part === undefined ? String(sourceId) : `${sourceId}:${part}`;

// ---------------------------------------------------------------------------
// Characteristics
// ---------------------------------------------------------------------------

export type Characteristic = {
  name: string;
  value: string | number | boolean | Record<string, unknown> | null;
  valueType?: string;
};

/**
 * Características reservadas de origem (C5).
 *
 * Helper próprio porque `netwinOriginCharacteristics` do kit hardcoda
 * `_origin.system = 'Netwin'` (netwin-migration-kit.ts:197).
 */
export const originCharacteristics = (
  entity: string,
  sourceId: string | number,
  extra?: Record<string, unknown>,
): Characteristic[] => [
  { name: '_origin.system', value: ORIGIN_SYSTEM, valueType: 'string' },
  { name: '_origin.entity', value: entity, valueType: 'string' },
  { name: '_origin.id', value: String(sourceId), valueType: 'string' },
  ...(extra && Object.keys(extra).length > 0
    ? [{ name: '_origin.extra', value: extra, valueType: 'json' } as Characteristic]
    : []),
];

/**
 * Characteristics de instância de um item importado, mais `_origin.*`.
 *
 * `municipio` **não** é emitida: a fonte não tem o dado e inventar `''`/`'N/D'` poluiria filtro e
 * popup. Todo campo ausente é simplesmente omitido — nunca um placeholder.
 */
export function buildCharacteristics(input: {
  entity: string;
  sourceId: string | number;
  part?: number | undefined;
  fields: PopupFields;
  uf?: string | undefined;
}): Characteristic[] {
  const { entity, sourceId, part, fields, uf } = input;
  const characteristics: Characteristic[] = [];

  if (fields.tensaoKv !== undefined) {
    characteristics.push({ name: 'tensaoKv', value: fields.tensaoKv, valueType: 'number' });
  }
  if (fields.extensaoKm !== undefined) {
    characteristics.push({ name: 'extensaoKm', value: fields.extensaoKm, valueType: 'number' });
  }
  if (fields.capacidadeMw !== undefined) {
    characteristics.push({
      name: 'capacidadeMw',
      value: fields.capacidadeMw,
      valueType: 'number',
    });
  }
  if (fields.operador !== undefined) {
    characteristics.push({ name: 'operador', value: fields.operador, valueType: 'string' });
  }
  if (uf !== undefined) {
    characteristics.push({ name: 'uf', value: uf, valueType: 'string' });
  }

  return [...characteristics, ...originCharacteristics(entity, originId(sourceId, part))];
}

// ---------------------------------------------------------------------------
// Registros mapeados
// ---------------------------------------------------------------------------

export type SigelFeature = {
  properties: Record<string, unknown>;
  geometry: unknown;
};

export type MappedSubstation = {
  sourceId: string;
  locationId: string;
  siteId: string;
  resourceId: string;
  name: string;
  point: Point;
  uf?: string | undefined;
  characteristics: Characteristic[];
};

export type MappedLine = {
  sourceId: string;
  originId: string;
  locationId: string;
  resourceId: string;
  name: string;
  line: LineString;
  uf?: string | undefined;
  characteristics: Characteristic[];
};

const oidOf = (properties: Record<string, unknown>): string | undefined => {
  const raw = properties.OID ?? properties.oid ?? properties.FID ?? properties.objectid;
  if (raw === null || raw === undefined || raw === '') return undefined;
  return String(raw);
};

/** Mapeia uma subestação (layer 3). Devolve `undefined` quando fora de escopo ou sem geometria. */
export function mapSubstation(
  feature: SigelFeature,
  states: readonly string[],
): MappedSubstation | undefined {
  const sourceId = oidOf(feature.properties);
  if (!sourceId) return undefined;

  const point = toGeoJsonPoint((feature.geometry as { coordinates?: unknown })?.coordinates);
  if (!point) return undefined;

  const [lon, lat] = point.coordinates;
  if (!substationInScope(states, lon, lat)) return undefined;

  const fields = parsePopupInfo(feature.properties.PopupInfo as string | undefined);
  // `Name` vem como "Subestação B. FLUMINENSE"; o popup traz só "B. FLUMINENSE". O `Name` é mais
  // informativo na tela, com o popup como reserva quando ele falta.
  const name = normalizeName(feature.properties.Name as string | undefined) || fields.nome || `Subestação ${sourceId}`;
  const uf = ufsContaining(states, lon, lat).join('/') || undefined;

  return {
    sourceId,
    locationId: demoId(SUBSTATION_ENTITY, sourceId),
    siteId: demoId(`${SUBSTATION_ENTITY}:SITE`, sourceId),
    resourceId: demoId(`${SUBSTATION_ENTITY}:RESOURCE`, sourceId),
    name,
    point,
    uf,
    characteristics: buildCharacteristics({
      entity: SUBSTATION_ENTITY,
      sourceId,
      fields,
      uf,
    }),
  };
}

/**
 * Mapeia uma linha de transmissão (layer 1). Uma feature multipart devolve N registros — um por
 * parte — porque o schema não aceita `MultiLineString`.
 */
export function mapTransmissionLine(
  feature: SigelFeature,
  states: readonly string[],
): MappedLine[] {
  const sourceId = oidOf(feature.properties);
  if (!sourceId) return [];

  const lines = toGeoJsonLines(feature.geometry);
  if (lines.length === 0) return [];

  const rawName = feature.properties.Name as string | undefined;
  const allVertices = lines.flatMap((line) => line.coordinates);
  if (!lineInScope(rawName, states, allVertices)) return [];

  const fields = parsePopupInfo(feature.properties.PopupInfo as string | undefined);
  const name = normalizeName(rawName) || `Linha de Transmissão ${sourceId}`;
  const multipart = lines.length > 1;

  return lines.map((line, index) => {
    const part = multipart ? index + 1 : undefined;
    const uf = resolveUf(rawName, states, line.coordinates);
    return {
      sourceId,
      originId: originId(sourceId, part),
      locationId: demoId(TRANSMISSION_LINE_ENTITY, sourceId, part),
      resourceId: demoId(`${TRANSMISSION_LINE_ENTITY}:RESOURCE`, sourceId, part),
      name: multipart ? `${name} (parte ${index + 1})` : name,
      line,
      uf,
      characteristics: buildCharacteristics({
        entity: TRANSMISSION_LINE_ENTITY,
        sourceId,
        part,
        fields,
        uf,
      }),
    };
  });
}

/** Remove duplicatas por id, mantendo a primeira ocorrência — a fonte pode repetir `OID`. */
export function dedupeById<T extends { resourceId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (seen.has(item.resourceId)) continue;
    seen.add(item.resourceId);
    unique.push(item);
  }
  return unique;
}
