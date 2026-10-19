import type { MigrationCharacteristic } from '../netwin-migration-kit.js';
import { normalizeTypeKey } from './concrete-specs.js';

/**
 * Transformações puras do enriquecimento de equipamentos OSP do Netwin (issue #332).
 *
 * Sem I/O: a hidratação read-only vive em `equipment-enrichment-source.ts` e a escrita na Fase 2.B /
 * 2.F. Aqui ficam a allowlist de atributos, a normalização de valores e o merge por ownership, que
 * garante que o migrador só substitui o que ele mesmo administra.
 */

export type CharacteristicValueType = 'string' | 'integer' | 'decimal' | 'boolean' | 'date';

export interface EnrichmentCharacteristicDef {
  /** Nome da characteristic de instância no Nexus. */
  name: string;
  valueType: CharacteristicValueType;
  description: string;
}

/**
 * Characteristics de instância administradas pelo migrador. `serialNumber`, `label` e o projeto
 * resolvido são campos canônicos de PhysicalResource e, por isso, NÃO aparecem aqui. `manufacturer`
 * e `networkType` são nomes proibidos pelo catálogo (ver `assertCanonicalCharacteristics`).
 */
/**
 * Atributos de célula de rádio (Célula 2G/3G/4G). Só os ResourceTypes de célula recebem estas
 * definições de instância (ver `radioCellInstanceDefinitions`); não poluem os demais tipos.
 * `coverageRadius` é o raio de atendimento em metros: fica como characteristic, sem polígono.
 */
export const RADIO_CELL_CHARACTERISTICS: readonly EnrichmentCharacteristicDef[] = [
  { name: 'cellIdentity', valueType: 'string', description: 'CI — identificador da célula.' },
  { name: 'ossName', valueType: 'string', description: 'Nome da célula no OSS.' },
  { name: 'sectorNumber', valueType: 'integer', description: 'Nº do setor.' },
  { name: 'carrierCount', valueType: 'integer', description: 'Nº de portadoras.' },
  { name: 'frequencyBand', valueType: 'string', description: 'Banda de frequência (MHz).' },
  {
    name: 'coverageType',
    valueType: 'string',
    description: 'Tipo de cobertura (macro, micro...).',
  },
  {
    name: 'coverageRadius',
    valueType: 'decimal',
    description: 'Raio de cobertura em metros.',
  },
  { name: 'propagationMedium', valueType: 'string', description: 'Meio de propagação.' },
  { name: 'mobileCountryCode', valueType: 'string', description: 'MCC.' },
  { name: 'mobileNetworkCode', valueType: 'string', description: 'MNC.' },
  { name: 'locationAreaCode', valueType: 'integer', description: 'LAC.' },
  { name: 'locationAreaClass', valueType: 'string', description: 'Classe do LAC.' },
  { name: 'routingAreaCode', valueType: 'string', description: 'RAC.' },
  { name: 'networkColourCode', valueType: 'integer', description: 'NCC.' },
  { name: 'baseColourCode', valueType: 'integer', description: 'BCC.' },
  { name: 'bsic', valueType: 'integer', description: 'BSIC.' },
  { name: 'bcchFrequency', valueType: 'integer', description: 'BCCH.' },
  { name: 'sdcch', valueType: 'string', description: 'SDCCH.' },
  { name: 'pdch', valueType: 'string', description: 'PDCH.' },
  { name: 'edge', valueType: 'boolean', description: 'EDGE habilitado.' },
  { name: 'taLimit', valueType: 'integer', description: 'Limite de TA.' },
  { name: 'tiltElectrical', valueType: 'decimal', description: 'Tilt elétrico.' },
  { name: 'bsPowerNominal', valueType: 'decimal', description: 'Potência BS nominal.' },
  { name: 'bsPowerBcch', valueType: 'decimal', description: 'Potência BS BCCH.' },
  { name: 'chargingArea', valueType: 'string', description: 'Charging area.' },
  { name: 'cgi', valueType: 'string', description: 'CGI — identificador global da célula.' },
  { name: 'sharingType', valueType: 'string', description: 'Tipo de compartilhamento.' },
];

const BASE_ENRICHMENT_CHARACTERISTICS: readonly EnrichmentCharacteristicDef[] = [
  { name: 'designation', valueType: 'string', description: 'Designação do equipamento na origem.' },
  {
    name: 'alternateDesignation',
    valueType: 'string',
    description: 'Designação alternativa informada pela origem.',
  },
  {
    name: 'identification',
    valueType: 'string',
    description: 'Identificação informada pela origem.',
  },
  { name: 'onPatternTag', valueType: 'string', description: 'Etiqueta de padrão em campo.' },
  { name: 'thirdTag', valueType: 'string', description: 'Etiqueta de terceiro.' },
  { name: 'tagOnField', valueType: 'string', description: 'Etiqueta aplicada em campo.' },
  { name: 'campaignName', valueType: 'string', description: 'Campanha que originou o registro.' },
  {
    name: 'sicomId',
    valueType: 'string',
    description: 'Identificador SICOM estruturado na origem.',
  },
  { name: 'accessNetwork', valueType: 'string', description: 'Rede de acesso do equipamento.' },
  { name: 'topology', valueType: 'string', description: 'Topologia do equipamento.' },
  { name: 'nomecNumber', valueType: 'integer', description: 'Número NOMEC.' },
  { name: 'networkCell', valueType: 'string', description: 'Célula de rede do equipamento.' },
  { name: 'length', valueType: 'decimal', description: 'Comprimento informado pela origem.' },
  { name: 'width', valueType: 'decimal', description: 'Largura informada pela origem.' },
  { name: 'depth', valueType: 'decimal', description: 'Profundidade informada pela origem.' },
  { name: 'free', valueType: 'boolean', description: 'Equipamento livre.' },
  { name: 'outOfPattern', valueType: 'boolean', description: 'Equipamento fora do padrão.' },
  { name: 'futureInstall', valueType: 'boolean', description: 'Instalação futura.' },
  { name: 'thirdIdentification', valueType: 'boolean', description: 'Identificação de terceiro.' },
  { name: 'controlGroup', valueType: 'string', description: 'Grupo de controle de implantação.' },
  { name: 'controlState', valueType: 'string', description: 'Estado de controle de implantação.' },
  { name: 'controlStateDate', valueType: 'date', description: 'Data do estado de controle.' },
  { name: 'implementationProject', valueType: 'string', description: 'Projeto de implantação.' },
  { name: 'projectState', valueType: 'string', description: 'Estado do projeto na origem.' },
  { name: 'notes', valueType: 'string', description: 'Observações do equipamento na origem.' },
  {
    name: 'sapMaterialCodeOverride',
    valueType: 'string',
    description: 'Material SAP da instância quando diverge do modelo.',
  },
  { name: 'reportedSerialNumber', valueType: 'string', description: 'Série não aplicada.' },
];

export const ENRICHMENT_CHARACTERISTICS: readonly EnrichmentCharacteristicDef[] = [
  ...BASE_ENRICHMENT_CHARACTERISTICS,
  ...RADIO_CELL_CHARACTERISTICS,
];

/** Nomes de characteristic administrados pelo migrador, além de `servingSite` e `_origin.*`. */
export const OWNED_CHARACTERISTIC_NAMES: ReadonlySet<string> = new Set([
  ...ENRICHMENT_CHARACTERISTICS.map((def) => def.name),
  'servingSite',
  'substatus',
  // MDU (#310): prumada do DATASHEET que atende a CDOI.
  'mdu.prumadaId',
  // Legado: datas de estado já foram characteristics; hoje são colunas `*_state_changed_at`.
  'lifecycleStateDate',
  'operationalStateDate',
  'provisionStateDate',
  // Legado: já foi characteristic; hoje é campo canônico e deve sair do JSON.
  'serialNumber',
]);

const isOwnedName = (name: string): boolean =>
  OWNED_CHARACTERISTIC_NAMES.has(name) || name.startsWith('_origin.');

const DEFINITION_BY_NAME = new Map(ENRICHMENT_CHARACTERISTICS.map((def) => [def.name, def]));

/**
 * Atributos dinâmicos da origem (`ISP_CAT_DIN_ATRIBUTO`) aceitos, por chave normalizada.
 * Qualquer atributo fora desta tabela é só contabilizado, nunca importado.
 */
const DYNAMIC_ATTRIBUTE_TO_CHARACTERISTIC = new Map<string, string>([
  ['comprimento', 'length'],
  ['largura', 'width'],
  ['profundidade', 'depth'],
  ['network', 'accessNetwork'],
  ['topology', 'topology'],
  ['nomecnumber', 'nomecNumber'],
  ['onpatterntag', 'onPatternTag'],
  ['thirdtag', 'thirdTag'],
  ['tagonfield', 'tagOnField'],
  ['namecampid', 'campaignName'],
  ['sicomid', 'sicomId'],
  ['free', 'free'],
  ['outofpattern', 'outOfPattern'],
  ['futureinstall', 'futureInstall'],
  ['thirdidentification', 'thirdIdentification'],
  ['grupocontrole', 'controlGroup'],
  ['estadocontrole', 'controlState'],
  ['datoestadocontrole', 'controlStateDate'],
  ['dataestadocontrole', 'controlStateDate'],
  // Célula de rádio. As chaves são os rótulos da tela Netwin, normalizados; nomes que a origem
  // use diferente aparecem em `unmappedDynamic` no relatório e entram aqui depois.
  ['ci', 'cellIdentity'],
  ['cellid', 'cellIdentity'],
  ['ossname', 'ossName'],
  ['nsetor', 'sectorNumber'],
  ['sectornumber', 'sectorNumber'],
  ['nportadoras', 'carrierCount'],
  ['banda', 'frequencyBand'],
  ['band', 'frequencyBand'],
  ['tipocobertura', 'coverageType'],
  ['raiodecobertura', 'coverageRadius'],
  ['raiocobertura', 'coverageRadius'],
  ['raiodecoberturam', 'coverageRadius'],
  ['coverageradius', 'coverageRadius'],
  ['meiopropagacao', 'propagationMedium'],
  ['mcc', 'mobileCountryCode'],
  ['mnc', 'mobileNetworkCode'],
  ['lac', 'locationAreaCode'],
  ['lacclasse', 'locationAreaClass'],
  ['rac', 'routingAreaCode'],
  ['ncc', 'networkColourCode'],
  ['bcc', 'baseColourCode'],
  ['bsic', 'bsic'],
  ['bcch', 'bcchFrequency'],
  ['sdcch', 'sdcch'],
  ['pdch', 'pdch'],
  ['edge', 'edge'],
  ['talimit', 'taLimit'],
  ['tiltletrico', 'tiltElectrical'],
  ['tilteletrico', 'tiltElectrical'],
  ['potenciabsnominal', 'bsPowerNominal'],
  ['potenciabsbcch', 'bsPowerBcch'],
  ['chargingarea', 'chargingArea'],
  ['cgi', 'cgi'],
  ['compartilhamento', 'sharingType'],
]);

/** Atributos dinâmicos que não viram characteristic, mas alimentam lookups (célula/estação). */
export const DYNAMIC_LOOKUP_ATTRIBUTES = {
  cell: 'cell',
  supplierStation: 'supplierstationid',
} as const;

/** Nome da characteristic de destino para um atributo dinâmico, ou `null` se fora da allowlist. */
export function dynamicAttributeTarget(attributeName: string | null | undefined): string | null {
  const key = normalizeTypeKey(attributeName);
  return key ? (DYNAMIC_ATTRIBUTE_TO_CHARACTERISTIC.get(key) ?? null) : null;
}

/** Chave normalizada de um atributo dinâmico usada nos lookups de célula/estação. */
export const dynamicLookupKey = (attributeName: string | null | undefined): string =>
  normalizeTypeKey(attributeName);

const PLACEHOLDER_TEXT = new Set([
  '',
  'desconhecido',
  'n/a',
  'na',
  'null',
  'nulo',
  '-',
  '--',
  'sem',
]);

/** Texto aparado, ou `null` para vazio/placeholder. */
export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return PLACEHOLDER_TEXT.has(text.toLowerCase()) ? null : text;
}

/** Série utilizável: sem placeholders e sem sequências triviais (`0000`, `-`, `N/A`...). */
export function normalizeSerial(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  if (/^0+$/.test(text) || /^[-_.\s]+$/.test(text)) return null;
  return text.slice(0, 255);
}

/** `0/1`, `true/false`, `S/N`, `Y/N`; nulo/vazio/indecifrável → `null` (omitido, não `false`). */
export function toNetwinBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  const text = cleanText(value)?.toLowerCase();
  if (!text) return null;
  if (['1', 'true', 's', 'sim', 'y', 'yes'].includes(text)) return true;
  if (['0', 'false', 'n', 'nao', 'não', 'no'].includes(text)) return false;
  return null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function isoDateOrNull(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Datas da origem (`Date`, `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD[...]`) → `YYYY-MM-DD` ou `null`. */
export function parseNetwinDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Oracle DATE chega como instante local; o componente de data local é o valor de negócio.
    return isoDateOrNull(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const text = cleanText(value);
  if (!text) return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(text);
  if (match) return isoDateOrNull(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(text);
  if (match) return isoDateOrNull(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

/** Número decimal (aceita vírgula decimal); inválido → `null`. */
export function parseNetwinNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cleanText(value);
  if (!text) return null;
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Converte o valor bruto para o tipo declarado; `null` quando não há valor aproveitável. */
export function coerceCharacteristicValue(
  valueType: CharacteristicValueType,
  raw: unknown,
): string | number | boolean | null {
  switch (valueType) {
    case 'boolean':
      return toNetwinBoolean(raw);
    case 'date':
      return parseNetwinDate(raw);
    case 'integer': {
      const n = parseNetwinNumber(raw);
      return n === null ? null : Math.trunc(n);
    }
    case 'decimal':
      return parseNetwinNumber(raw);
    case 'string':
      return cleanText(raw);
  }
}

/** Definitions de instância a registrar no ResourceType (allowlist tipada). */
export function enrichmentInstanceDefinitions(): MigrationCharacteristic[] {
  return BASE_ENRICHMENT_CHARACTERISTICS.map((def) => ({
    name: def.name,
    description: def.description,
    value: '',
    valueType: def.valueType,
    characteristicLevel: 'instance' as const,
  }));
}

/** Definitions de instância exclusivas dos tipos de célula de rádio. */
export function radioCellInstanceDefinitions(): MigrationCharacteristic[] {
  return RADIO_CELL_CHARACTERISTICS.map((def) => ({
    name: def.name,
    description: def.description,
    value: '',
    valueType: def.valueType,
    characteristicLevel: 'instance' as const,
  }));
}

/** Monta uma characteristic tipada da allowlist; `null` se o valor não for aproveitável. */
export function buildCharacteristic(name: string, raw: unknown): MigrationCharacteristic | null {
  const def = DEFINITION_BY_NAME.get(name);
  if (!def) return null;
  const value = coerceCharacteristicValue(def.valueType, raw);
  return value === null ? null : { name, value, valueType: def.valueType };
}

// ---- merge por ownership ------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function parseArray(json: string | null | undefined): JsonRecord[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object')
      : [];
  } catch {
    return [];
  }
}

/**
 * Substitui apenas as characteristics administradas pelo migrador. As demais (Studio, UI, outras
 * cargas) sobrevivem na ordem original; valores administrados que sumiram da origem são removidos.
 */
export function mergeOwnedCharacteristics(
  currentJson: string | null | undefined,
  produced: readonly MigrationCharacteristic[],
): MigrationCharacteristic[] {
  const foreign = parseArray(currentJson).filter((item) => {
    const name = typeof item.name === 'string' ? item.name : '';
    const group = typeof item.group === 'string' ? item.group : '';
    // `_origin` pode vir como nome com prefixo ou como group + name curto.
    return !(isOwnedName(name) || group === '_origin');
  });
  return [...(foreign as MigrationCharacteristic[]), ...produced];
}

export interface PartyReference {
  id: string;
  '@referredType': string;
  role?: string;
  [key: string]: unknown;
}

/** Papéis que o migrador administra na instância. Entrada sem papel é a legada do migrador. */
const OWNED_PARTY_ROLES: ReadonlySet<string | undefined> = new Set([
  'infrastructure_owner',
  undefined,
]);

/**
 * Substitui apenas `infrastructure_owner` (e a entrada legada sem papel criada pelo migrador),
 * preservando `vendor` e qualquer outro papel já associado ao recurso.
 */
export function mergeOwnedRelatedParties(
  currentJson: string | null | undefined,
  owner: PartyReference | null,
): PartyReference[] {
  const foreign = (parseArray(currentJson) as unknown as PartyReference[]).filter(
    (party) => !OWNED_PARTY_ROLES.has(typeof party.role === 'string' ? party.role : undefined),
  );
  return owner ? [owner, ...foreign] : foreign;
}

// ---- série ---------------------------------------------------------------------------------------

export interface SerialCandidate {
  resourceId: string;
  sourceId: number;
  rawSerial: unknown;
}

export interface SerialResolution {
  serialNumber: string | null;
  /** Valor da origem preservado quando o canônico não pôde ser aplicado. */
  reportedSerialNumber: string | null;
  conflict: 'duplicate-in-page' | 'taken-in-target' | null;
}

/**
 * Resolve o `serial_number` (UNIQUE global) antes do write para que um conflito nunca aborte o
 * lote. Dentro do conjunto novo vence o menor `sourceId`; contra o destino, `takenBy` mapeia
 * série → id do recurso que já a detém (o próprio recurso não é conflito).
 */
export function resolveSerials(
  candidates: readonly SerialCandidate[],
  takenBy: ReadonlyMap<string, string>,
): Map<string, SerialResolution> {
  const result = new Map<string, SerialResolution>();
  const ordered = [...candidates].sort((a, b) => a.sourceId - b.sourceId);
  const winners = new Map<string, string>();
  for (const candidate of ordered) {
    const serial = normalizeSerial(candidate.rawSerial);
    if (!serial) {
      result.set(candidate.resourceId, {
        serialNumber: null,
        reportedSerialNumber: null,
        conflict: null,
      });
      continue;
    }
    const holder = takenBy.get(serial);
    if (holder !== undefined && holder !== candidate.resourceId) {
      result.set(candidate.resourceId, {
        serialNumber: null,
        reportedSerialNumber: serial,
        conflict: 'taken-in-target',
      });
      continue;
    }
    const winner = winners.get(serial);
    if (winner !== undefined && winner !== candidate.resourceId) {
      result.set(candidate.resourceId, {
        serialNumber: null,
        reportedSerialNumber: serial,
        conflict: 'duplicate-in-page',
      });
      continue;
    }
    winners.set(serial, candidate.resourceId);
    result.set(candidate.resourceId, {
      serialNumber: serial,
      reportedSerialNumber: null,
      conflict: null,
    });
  }
  return result;
}

// ---- payload -------------------------------------------------------------------------------------

export interface EquipmentEnrichmentInput {
  /** `OSP_EQUIPMENT.NAME`, usado para omitir label/designação redundantes. */
  name: string;
  label: unknown;
  description?: unknown;
  designation?: unknown;
  alternateDesignation?: unknown;
  identification?: unknown;
  observations?: unknown;
  sapMaterialCode?: unknown;
  modelSapMaterialCode?: unknown;
  projectState?: unknown;
  /** Nome do projeto estruturado (`PROJECT.NAME`), nunca extraído das observações. */
  projectName?: unknown;
  /** Atributos dinâmicos já filtrados pela allowlist: nome da characteristic → valor bruto. */
  dynamic: ReadonlyMap<string, unknown>;
  /** Célula legível (`OSP_CELL.NAME`), não o ID. */
  cellName?: unknown;
  /** Id Nexus do site da estação abastecedora, quando resolvido. */
  servingSiteId?: string | null;
}

export interface EquipmentEnrichment {
  label: string | null;
  /** Characteristics administradas a gravar (sem `_origin`, que o chamador compõe). */
  characteristics: MigrationCharacteristic[];
  servingSiteId: string | null;
}

const sameText = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && normalizeTypeKey(a) === normalizeTypeKey(b);

/** Constrói o payload puro de enriquecimento de um equipamento. */
export function buildEquipmentEnrichment(input: EquipmentEnrichmentInput): EquipmentEnrichment {
  const name = cleanText(input.name);
  const label = cleanText(input.label);
  const canonicalLabel = label && !sameText(label, name) ? label.slice(0, 255) : null;

  const produced: MigrationCharacteristic[] = [];
  const push = (characteristicName: string, raw: unknown): void => {
    const characteristic = buildCharacteristic(characteristicName, raw);
    if (characteristic) produced.push(characteristic);
  };

  // Identificações: omite o que apenas repete nome/label.
  const redundant = (value: unknown): unknown => {
    const text = cleanText(value);
    return sameText(text, name) || sameText(text, label) ? null : text;
  };
  push('designation', redundant(input.designation));
  push('alternateDesignation', redundant(input.alternateDesignation));
  push('identification', redundant(input.identification));

  push('notes', input.observations);
  push('projectState', input.projectState);
  push('implementationProject', input.projectName);
  push('networkCell', input.cellName);

  // Material SAP da instância só quando difere do modelo.
  const instanceSap = cleanText(input.sapMaterialCode);
  if (instanceSap && !sameText(instanceSap, cleanText(input.modelSapMaterialCode))) {
    push('sapMaterialCodeOverride', instanceSap);
  }

  const alreadyPushed = new Set(produced.map((item) => item.name));
  for (const [characteristicName, raw] of input.dynamic) {
    if (alreadyPushed.has(characteristicName)) continue;
    const characteristic = buildCharacteristic(characteristicName, raw);
    if (!characteristic) continue;
    alreadyPushed.add(characteristicName);
    produced.push(characteristic);
  }

  return {
    label: canonicalLabel,
    characteristics: produced,
    servingSiteId: input.servingSiteId ?? null,
  };
}

/** Characteristic `servingSite` (extensão V.tal) no formato lido por `servingSiteIdOf`. */
export const servingSiteCharacteristic = (siteId: string): MigrationCharacteristic => ({
  name: 'servingSite',
  value: siteId,
  valueType: 'string',
});
