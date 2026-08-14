#!/usr/bin/env node
/**
 * Enriquecimento reutilizável de endereços de pontos de instalação.
 *
 * Uso:
 *   npm run addresses:enrich -- --file legacy-data/onitel.HCs.enriquecido.csv --limit 10
 *   npm run addresses:enrich -- --file outro.csv --all --out outro_enriquecido.csv
 *
 * O script trabalha diretamente no CSV e não grava dados no Nexus. As credenciais
 * de GEONET e Google Maps são carregadas do .env da raiz.
 */

import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';
import ExcelJS from 'exceljs';
import {
  GeonetAddressGateway,
  type GeonetAddressCandidate,
  type GeonetAddressDetail,
} from '../modules/geo/geonet-address-gateway.js';
import { geonetConfigOf } from '../shared/config/env.js';

const SOURCE_COLUMNS = [
  'ID',
  'UF',
  'MUNICIPIO',
  'BAIRRO',
  'CEP',
  'TIPO LOGRADOURO',
  'LOGRADOURO',
  'NUMERO',
  'TIPO COMPLEMENTO',
  'VALOR COMPLEMENTO',
] as const;

const ENRICHMENT_COLUMNS = [
  'GEONET_ID',
  'GEONET_ENDERECO',
  'GEONET_LOCALIZACAO',
  'GEONET_PRECISAO',
  'GMAPS_ID',
  'GMAPS_ENDERECO',
  'GMAPS_LOCALIZACAO',
  'GMAPS_PRECISAO',
  'DNE_LOGRADOURO',
  'DNE_COMPLEMENTO',
  'DNE_BAIRRO',
  'DNE_LOCALIDADE',
] as const;

const GEONET_COLUMNS = [
  'GEONET_ID',
  'GEONET_ENDERECO',
  'GEONET_LOCALIZACAO',
  'GEONET_PRECISAO',
] as const;
const GOOGLE_COLUMNS = [
  'GMAPS_ID',
  'GMAPS_ENDERECO',
  'GMAPS_LOCALIZACAO',
  'GMAPS_PRECISAO',
] as const;

// Colunas de auditoria que o próprio script acrescenta ao final do arquivo:
// a consulta exata enviada a cada provedor e um resumo do processamento da linha.
const LOG_COLUMNS = ['LOG_CONSULTA_GEONET', 'LOG_CONSULTA_GMAPS', 'LOG_GERAL'] as const;
const OUTPUT_COLUMNS = [...ENRICHMENT_COLUMNS, ...LOG_COLUMNS] as const;

type ColumnName = (typeof SOURCE_COLUMNS)[number] | (typeof ENRICHMENT_COLUMNS)[number];
type Row = string[];

export type CsvDocument = {
  bom: boolean;
  lineEnding: '\n' | '\r\n';
  headers: string[];
  records: Row[];
};

export type DneAddress = {
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
};

export type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

export type GoogleGeocodeResult = {
  place_id?: string;
  formatted_address?: string;
  geometry?: { location_type?: string; location?: { lat?: number; lng?: number } };
  types?: string[];
  address_components?: GoogleAddressComponent[];
};

export type GoogleLookup = {
  placeId: string;
  formattedAddress: string;
  location: string;
  precision: string;
};

export type GeonetLookup = {
  id: string;
  formattedAddress: string;
  location: string;
  precision: string;
};

export type AddressServices = {
  viaCep: (cep: string) => Promise<DneAddress | null>;
  geonet: (
    address: string,
    number: string,
    row: Row,
    index: Map<string, number>,
  ) => Promise<GeonetLookup | null>;
  google: (address: string, row: Row, index: Map<string, number>) => Promise<GoogleLookup | null>;
};

export type EnrichmentSummary = {
  selected: number;
  skippedRows: number;
  updatedRows: number;
  viaCep: ProviderSummary;
  geonet: ProviderSummary;
  google: ProviderSummary;
  failures: number;
};

type ProviderSummary = {
  filled: number;
  notFound: number;
  mismatched: number;
  errors: number;
  skipped: number;
};

type Provider = 'viacep' | 'geonet' | 'gmaps';

const ALL_PROVIDERS: readonly Provider[] = ['viacep', 'geonet', 'gmaps'];

// Aceita apelidos comuns em `--only` (ex.: "google" e "dne").
const PROVIDER_ALIASES: Record<string, Provider> = {
  viacep: 'viacep',
  dne: 'viacep',
  geonet: 'geonet',
  gmaps: 'gmaps',
  google: 'gmaps',
  googlemaps: 'gmaps',
};

type CliOptions = {
  file: string;
  output: string;
  start: number;
  limit: number;
  overwrite: boolean;
  threads: number;
  checkpoint: number;
  providers: readonly Provider[];
};

class ProviderError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function parseSemicolonCsv(input: string): CsvDocument {
  const bom = input.charCodeAt(0) === 0xfeff;
  const text = bom ? input.slice(1) : input;
  const lineEnding: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const records: Row[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ';') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('CSV inválido: campo entre aspas não foi fechado.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  if (records.length === 0) throw new Error('CSV vazio.');

  const [headers, ...data] = records;
  if (!headers) throw new Error('CSV sem cabeçalho.');
  return { bom, lineEnding, headers, records: data };
}

export function serializeSemicolonCsv(document: CsvDocument): string {
  const escape = (value: string): string =>
    /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const rows = [document.headers, ...document.records].map((row) => row.map(escape).join(';'));
  return `${document.bom ? '\ufeff' : ''}${rows.join(document.lineEnding)}${document.lineEnding}`;
}

export function worksheetToDocument(worksheet: ExcelJS.Worksheet): CsvDocument {
  const headerRow = worksheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
    String(headerRow.getCell(index + 1).text ?? '').trim(),
  );
  if (headers.length === 0 || headers.every((header) => !header)) {
    throw new Error(`Aba "${worksheet.name}" não possui cabeçalho na primeira linha.`);
  }
  const records: Row[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const source = worksheet.getRow(rowNumber);
    records.push(
      Array.from({ length: headers.length }, (_, index) =>
        String(source.getCell(index + 1).text ?? '').trim(),
      ),
    );
  }
  return { bom: false, lineEnding: '\n', headers, records };
}

export function applyDocumentToWorksheet(
  worksheet: ExcelJS.Worksheet,
  before: CsvDocument,
  after: CsvDocument,
): void {
  const index = ensureLayout(after.headers);
  for (const column of LOG_COLUMNS) {
    const position = index.get(column);
    if (position === undefined) continue;
    const headerCell = worksheet.getRow(1).getCell(position + 1);
    if (String(headerCell.text ?? '').trim() !== column) headerCell.value = column;
  }
  for (let rowIndex = 0; rowIndex < after.records.length; rowIndex += 1) {
    const source = before.records[rowIndex]!;
    const enriched = after.records[rowIndex]!;
    for (const column of OUTPUT_COLUMNS) {
      const position = index.get(column);
      if (position === undefined) continue;
      if (source[position] === enriched[position]) continue;
      worksheet.getRow(rowIndex + 2).getCell(position + 1).value = enriched[position] || null;
    }
  }
}

function parseProviders(value: string): Provider[] {
  const requested = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (requested.length === 0) throw new Error('--only requer ao menos um provedor.');
  const selected = requested.map((token) => {
    const provider = PROVIDER_ALIASES[token];
    if (!provider) throw new Error(`--only não reconhece "${token}". Use viacep, geonet ou gmaps.`);
    return provider;
  });
  return [...new Set(selected)];
}

export function parseCliArgs(args: string[]): CliOptions | 'help' {
  let file = '';
  let output = '';
  let limit: number | undefined;
  let all = false;
  let start = 1;
  let overwrite = false;
  let threads = 1;
  let checkpoint = 200;
  let providers: readonly Provider[] = ALL_PROVIDERS;

  const requiredValue = (index: number, flag: string): string => {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requer um valor.`);
    return value;
  };
  const positiveInteger = (value: string, flag: string): number => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new Error(`${flag} deve ser um inteiro positivo.`);
    }
    return parsed;
  };
  const nonNegativeInteger = (value: string, flag: string): number => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`${flag} deve ser um inteiro maior ou igual a zero.`);
    }
    return parsed;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--help' || arg === '-h') return 'help';
    if (arg === '--file') {
      file = requiredValue(index, arg);
      index += 1;
    } else if (arg === '--out') {
      output = requiredValue(index, arg);
      index += 1;
    } else if (arg === '--limit') {
      limit = positiveInteger(requiredValue(index, arg), arg);
      index += 1;
    } else if (arg === '--start') {
      start = positiveInteger(requiredValue(index, arg), arg);
      index += 1;
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--overwrite') {
      overwrite = true;
    } else if (arg === '--threads') {
      threads = positiveInteger(requiredValue(index, arg), arg);
      index += 1;
    } else if (arg === '--checkpoint') {
      checkpoint = nonNegativeInteger(requiredValue(index, arg), arg);
      index += 1;
    } else if (arg === '--only') {
      providers = parseProviders(requiredValue(index, arg));
      index += 1;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  if (!file) throw new Error('--file é obrigatório.');
  if (all === (limit !== undefined))
    throw new Error('Informe exatamente um entre --limit N e --all.');
  return {
    file,
    output: output || file,
    start,
    limit: limit ?? Number.MAX_SAFE_INTEGER,
    overwrite,
    threads,
    checkpoint,
    providers,
  };
}

export const usage = (): string =>
  [
    'Uso:',
    '  npm run addresses:enrich -- --file <arquivo.csv> --limit <N> [--start <N>] [--threads <N>] [--only <provedores>] [--out <destino.csv>] [--overwrite]',
    '  npm run addresses:enrich -- --file <arquivo.csv> --all [--threads <N>] [--only <provedores>] [--out <destino.csv>] [--overwrite]',
    '',
    '--limit conta registros lógicos a partir de --start (padrão: 1).',
    '--threads define quantas linhas são consultadas simultaneamente (padrão: 1).',
    '--checkpoint salva o arquivo a cada N linhas atualizadas (padrão: 200; 0 desliga).',
    '--only executa apenas os provedores informados (viacep, geonet, gmaps; separados por vírgula).',
    '--overwrite força a reescrita das células mesmo que já estejam preenchidas.',
    'Sem --overwrite, linhas já completas (GEONET_ID, GMAPS_ID e DNE_LOGRADOURO dos provedores',
    'ativos preenchidos) são ignoradas; nas demais, só células vazias são preenchidas.',
  ].join('\n');

const headerIndexOf = (headers: string[]): Map<string, number> =>
  new Map(headers.map((header, index) => [header.trim(), index]));

function ensureLayout(headers: string[]): Map<string, number> {
  const index = headerIndexOf(headers);
  const missing = [...SOURCE_COLUMNS, ...ENRICHMENT_COLUMNS].filter((column) => !index.has(column));
  if (missing.length > 0) {
    throw new Error(`CSV incompatível. Colunas ausentes: ${missing.join(', ')}.`);
  }
  return index;
}

// Acrescenta as colunas de log ao final do cabeçalho quando ainda não existem,
// para que o script funcione com arquivos que não as tenham. As linhas ganham
// as células vazias correspondentes no passo de padding do enrichRecords.
function ensureLogColumns(document: CsvDocument): void {
  const existing = new Set(document.headers.map((header) => header.trim()));
  for (const column of LOG_COLUMNS) {
    if (!existing.has(column)) document.headers.push(column);
  }
}

const valueOf = (row: Row, index: Map<string, number>, column: ColumnName): string =>
  row[index.get(column)!]?.trim() ?? '';

const normalized = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

const normalizedCep = (value: string): string => value.replace(/\D/g, '');

const sameText = (left: string | undefined, right: string): boolean =>
  left !== undefined && left !== '' && normalized(left) === normalized(right);

function rowStreet(row: Row, index: Map<string, number>): string {
  const kind = valueOf(row, index, 'TIPO LOGRADOURO');
  const street = valueOf(row, index, 'LOGRADOURO');
  if (!kind || !street || normalized(street).startsWith(normalized(kind))) return street;
  return `${kind} ${street}`;
}

export function buildSearchAddress(
  row: Row,
  index: Map<string, number>,
  dne?: DneAddress | null,
): { geonetAddress: string; googleAddress: string; number: string } {
  const useDne = Boolean(dne?.logradouro && isDneCoherent(dne, row, index));
  const street = useDne ? dne!.logradouro : rowStreet(row, index);
  const neighborhood = useDne && dne!.bairro ? dne!.bairro : valueOf(row, index, 'BAIRRO');
  const city = useDne && dne!.localidade ? dne!.localidade : valueOf(row, index, 'MUNICIPIO');
  const uf = valueOf(row, index, 'UF').toUpperCase();
  const cep = normalizedCep(valueOf(row, index, 'CEP'));
  const number = valueOf(row, index, 'NUMERO');
  const geonetAddress = [street, neighborhood, city, uf, cep, 'Brasil'].filter(Boolean).join(', ');
  const googleAddress = [street, number, neighborhood, city, uf, cep, 'Brasil']
    .filter(Boolean)
    .join(', ');
  return { geonetAddress, googleAddress, number };
}

export function isDneCoherent(dne: DneAddress, row: Row, index: Map<string, number>): boolean {
  return (
    sameText(dne.uf, valueOf(row, index, 'UF')) &&
    sameText(dne.localidade, valueOf(row, index, 'MUNICIPIO'))
  );
}

function isGeonetCoherent(
  candidate: GeonetAddressCandidate,
  row: Row,
  index: Map<string, number>,
): boolean {
  return (
    Boolean(candidate.addressId) &&
    sameText(candidate.state, valueOf(row, index, 'UF')) &&
    sameText(candidate.city, valueOf(row, index, 'MUNICIPIO'))
  );
}

export function selectGeonetCandidate(
  candidates: GeonetAddressCandidate[],
  row: Row,
  index: Map<string, number>,
): GeonetAddressCandidate | null {
  const cep = normalizedCep(valueOf(row, index, 'CEP'));
  const number = normalized(valueOf(row, index, 'NUMERO'));
  const street = normalized(rowStreet(row, index));
  let selected: GeonetAddressCandidate | null = null;
  let highScore = -1;

  candidates.forEach((candidate) => {
    if (!isGeonetCoherent(candidate, row, index)) return;
    const candidateStreet = normalized(candidate.street ?? '');
    let score = 0;
    if (normalizedCep(candidate.postcode ?? '') === cep) score += 8;
    if (normalized(candidate.streetNr ?? '') === number) score += 4;
    if (candidateStreet === street) score += 4;
    else if (
      candidateStreet &&
      street &&
      (candidateStreet.includes(street) || street.includes(candidateStreet))
    ) {
      score += 2;
    }
    if (score > highScore) {
      selected = candidate;
      highScore = score;
    }
  });
  return selected;
}

const componentOf = (
  result: GoogleGeocodeResult,
  type: string,
): GoogleAddressComponent | undefined =>
  result.address_components?.find((component) => component.types?.includes(type));

function googleCityOf(result: GoogleGeocodeResult): string | undefined {
  return (
    componentOf(result, 'locality')?.long_name ??
    componentOf(result, 'administrative_area_level_2')?.long_name ??
    componentOf(result, 'administrative_area_level_3')?.long_name
  );
}

function isGoogleCoherent(
  result: GoogleGeocodeResult,
  row: Row,
  index: Map<string, number>,
): boolean {
  const state = componentOf(result, 'administrative_area_level_1')?.short_name;
  return (
    Boolean(result.place_id && result.formatted_address) &&
    sameText(state, valueOf(row, index, 'UF')) &&
    sameText(googleCityOf(result), valueOf(row, index, 'MUNICIPIO'))
  );
}

export function selectGoogleResult(
  results: GoogleGeocodeResult[],
  row: Row,
  index: Map<string, number>,
): GoogleGeocodeResult | null {
  const cep = normalizedCep(valueOf(row, index, 'CEP'));
  const number = normalized(valueOf(row, index, 'NUMERO'));
  let selected: GoogleGeocodeResult | null = null;
  let highScore = -1;

  results.forEach((result) => {
    if (!isGoogleCoherent(result, row, index)) return;
    let score = 0;
    if (normalizedCep(componentOf(result, 'postal_code')?.long_name ?? '') === cep) score += 8;
    if (normalized(componentOf(result, 'street_number')?.long_name ?? '') === number) score += 4;
    if (result.types?.includes('street_address')) score += 3;
    else if (result.types?.includes('route')) score += 2;
    const precision = result.geometry?.location_type;
    if (precision === 'ROOFTOP') score += 3;
    else if (precision === 'RANGE_INTERPOLATED') score += 2;
    else if (precision) score += 1;
    if (score > highScore) {
      selected = result;
      highScore = score;
    }
  });
  return selected;
}

export async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderError ? error.retryable : isTransientError(error);
      if (!retryable || attempt === attempts) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function isTransientError(error: unknown): boolean {
  const candidate = error as { statusCode?: unknown; name?: unknown };
  const status = Number(candidate?.statusCode);
  return (
    status === 429 ||
    status >= 500 ||
    candidate?.name === 'TimeoutError' ||
    candidate?.name === 'TypeError'
  );
}

const cached = <T>(
  cache: Map<string, Promise<T>>,
  key: string,
  request: () => Promise<T>,
): Promise<T> => {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = request().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
};

function allPresent(row: Row, index: Map<string, number>, columns: readonly string[]): boolean {
  return columns.every((column) => Boolean(row[index.get(column)!]?.trim()));
}

// Campo-sinal que marca cada provedor como "feito" para uma linha. O gate de
// skip usa apenas estes campos (não o conjunto completo de colunas do provedor).
const GATE_COLUMN: Record<Provider, ColumnName> = {
  viacep: 'DNE_LOGRADOURO',
  geonet: 'GEONET_ID',
  gmaps: 'GMAPS_ID',
};

// A linha é trabalhada quando --overwrite está ligado ou quando, entre os
// provedores ativos, algum campo-sinal está vazio. Se todos os relevantes já
// estão preenchidos, a linha é replicada intacta (nada é consultado nem escrito).
function rowNeedsWork(
  row: Row,
  index: Map<string, number>,
  providers: readonly Provider[],
  overwrite: boolean,
): boolean {
  if (overwrite) return true;
  return providers.some((provider) => !valueOf(row, index, GATE_COLUMN[provider]));
}

function applyValues(
  row: Row,
  index: Map<string, number>,
  values: Record<string, string>,
  overwrite: boolean,
): boolean {
  let changed = false;
  for (const [column, value] of Object.entries(values)) {
    const position = index.get(column)!;
    if (overwrite || !row[position]?.trim()) {
      if (row[position] !== value) changed = true;
      row[position] = value;
    }
  }
  return changed;
}

const emptyProviderSummary = (): ProviderSummary => ({
  filled: 0,
  notFound: 0,
  mismatched: 0,
  errors: 0,
  skipped: 0,
});

export async function enrichRecords(
  document: CsvDocument,
  services: AddressServices,
  options: Pick<CliOptions, 'start' | 'limit' | 'overwrite' | 'threads'> & {
    providers?: readonly Provider[];
    checkpointEvery?: number;
    onCheckpoint?: () => Promise<void>;
  },
  logger: Pick<Console, 'warn' | 'log'> = console,
): Promise<EnrichmentSummary> {
  ensureLogColumns(document);
  const index = ensureLayout(document.headers);
  document.records.forEach((row) => {
    while (row.length < document.headers.length) row.push('');
  });
  const summary: EnrichmentSummary = {
    selected: 0,
    skippedRows: 0,
    updatedRows: 0,
    viaCep: emptyProviderSummary(),
    geonet: emptyProviderSummary(),
    google: emptyProviderSummary(),
    failures: 0,
  };
  const first = options.start - 1;
  const last = Math.min(document.records.length, first + options.limit);
  const providers = options.providers ?? ALL_PROVIDERS;
  const runViaCep = providers.includes('viacep');
  const runGeonet = providers.includes('geonet');
  const runGoogle = providers.includes('gmaps');
  const viaCepCache = new Map<string, Promise<DneAddress | null>>();
  const geonetCache = new Map<string, Promise<GeonetLookup | null>>();
  const googleCache = new Map<string, Promise<GoogleLookup | null>>();

  // Checkpoint: grava o arquivo a cada N linhas efetivamente atualizadas.
  // Só uma gravação por vez (guard `flushing`) — evita colisão do arquivo .tmp
  // e reescritas sobrepostas quando há várias threads. Linhas puladas/inalteradas
  // não contam, para não reescrever o arquivo à toa numa reexecução.
  let dirtySinceFlush = 0;
  let flushing = false;
  const runCheckpoint = async (rowChanged: boolean): Promise<void> => {
    if (!options.onCheckpoint || !options.checkpointEvery || options.checkpointEvery <= 0) return;
    if (rowChanged) dirtySinceFlush += 1;
    if (dirtySinceFlush < options.checkpointEvery || flushing) return;
    dirtySinceFlush = 0;
    flushing = true;
    try {
      await options.onCheckpoint();
      logger.log(`Checkpoint: progresso salvo (${summary.updatedRows} atualizada(s)).`);
    } catch (error) {
      logger.warn(`Checkpoint falhou (não salvou desta vez): ${messageOf(error)}`);
    } finally {
      flushing = false;
    }
  };

  const processRow = async (rowNumber: number): Promise<void> => {
    const row = document.records[rowNumber]!;
    summary.selected += 1;
    if (!rowNeedsWork(row, index, providers, options.overwrite)) {
      summary.skippedRows += 1;
      return; // replica a linha atual: não toca em células nem em logs
    }
    let changed = false;
    let viaCepOutcome = 'ignorado';
    let geonetOutcome = 'ignorado';
    let googleOutcome = 'ignorado';
    let geonetQuery = '';
    let googleQuery = '';
    const rowId = valueOf(row, index, 'ID') || `linha ${rowNumber + 2}`;
    const cep = normalizedCep(valueOf(row, index, 'CEP'));
    let dne: DneAddress | null = {
      logradouro: valueOf(row, index, 'DNE_LOGRADOURO'),
      complemento: valueOf(row, index, 'DNE_COMPLEMENTO'),
      bairro: valueOf(row, index, 'DNE_BAIRRO'),
      localidade: valueOf(row, index, 'DNE_LOCALIDADE'),
      uf: valueOf(row, index, 'UF'),
    };

    // Se o DNE_LOGRADOURO já veio preenchido na origem, mantém os campos DNE
    // existentes e ignora os demais (não consulta o ViaCEP para reescrevê-los).
    if (!runViaCep) {
      viaCepOutcome = 'desativado';
    } else if (options.overwrite || !dne.logradouro) {
      try {
        const result = await cached(viaCepCache, cep, () => services.viaCep(cep));
        if (!result) {
          summary.viaCep.notFound += 1;
          viaCepOutcome = 'não encontrado';
          dne = null;
        } else if (!isDneCoherent(result, row, index)) {
          const fileCity = valueOf(row, index, 'MUNICIPIO');
          const fileUf = valueOf(row, index, 'UF');
          changed =
            applyValues(
              row,
              index,
              {
                DNE_LOGRADOURO: result.logradouro,
                DNE_COMPLEMENTO: result.complemento,
                DNE_BAIRRO: result.bairro,
                DNE_LOCALIDADE: result.localidade,
              },
              options.overwrite,
            ) || changed;
          dne = result;
          summary.viaCep.mismatched += 1;
          viaCepOutcome = `preenchido (divergente: ViaCEP ${result.localidade}/${result.uf} vs arquivo ${fileCity}/${fileUf})`;
          logger.warn(
            `[${rowId}] ViaCEP retornou UF/Município divergente (ViaCEP ${result.localidade}/${result.uf} vs arquivo ${fileCity}/${fileUf}); dados preenchidos mesmo assim.`,
          );
        } else {
          changed =
            applyValues(
              row,
              index,
              {
                DNE_LOGRADOURO: result.logradouro,
                DNE_COMPLEMENTO: result.complemento,
                DNE_BAIRRO: result.bairro,
                DNE_LOCALIDADE: result.localidade,
              },
              options.overwrite,
            ) || changed;
          dne = result;
          summary.viaCep.filled += 1;
          viaCepOutcome = 'preenchido';
        }
      } catch (error) {
        summary.viaCep.errors += 1;
        summary.failures += 1;
        viaCepOutcome = 'erro';
        dne = null;
        logger.warn(`[${rowId}] ViaCEP falhou: ${messageOf(error)}`);
      }
    } else {
      summary.viaCep.skipped += 1;
      viaCepOutcome = 'DNE já preenchido';
    }

    const query = buildSearchAddress(row, index, dne);
    if (!runGeonet) {
      geonetOutcome = 'desativado';
    } else if (options.overwrite || !allPresent(row, index, GEONET_COLUMNS)) {
      geonetQuery = query.number
        ? `${query.geonetAddress} | nº ${query.number}`
        : query.geonetAddress;
      try {
        const result = await cached(geonetCache, `${query.geonetAddress}|${query.number}`, () =>
          services.geonet(query.geonetAddress, query.number, row, index),
        );
        if (!result) {
          summary.geonet.notFound += 1;
          geonetOutcome = 'não encontrado';
        } else {
          changed =
            applyValues(
              row,
              index,
              {
                GEONET_ID: result.id,
                GEONET_ENDERECO: result.formattedAddress,
                GEONET_LOCALIZACAO: result.location,
                GEONET_PRECISAO: result.precision,
              },
              options.overwrite,
            ) || changed;
          summary.geonet.filled += 1;
          geonetOutcome = 'encontrado';
        }
      } catch (error) {
        summary.geonet.errors += 1;
        summary.failures += 1;
        const reason = geonetErrorDetail(error);
        geonetOutcome = `erro (${reason})`;
        logger.warn(`[${rowId}] GEONET falhou ao consultar "${geonetQuery}": ${reason}`);
      }
    } else {
      summary.geonet.skipped += 1;
    }

    if (!runGoogle) {
      googleOutcome = 'desativado';
    } else if (options.overwrite || !allPresent(row, index, GOOGLE_COLUMNS)) {
      googleQuery = query.googleAddress;
      try {
        const result = await cached(googleCache, query.googleAddress, () =>
          services.google(query.googleAddress, row, index),
        );
        if (!result) {
          summary.google.notFound += 1;
          googleOutcome = 'não encontrado';
        } else {
          changed =
            applyValues(
              row,
              index,
              {
                GMAPS_ID: result.placeId,
                GMAPS_ENDERECO: result.formattedAddress,
                GMAPS_LOCALIZACAO: result.location,
                GMAPS_PRECISAO: result.precision,
              },
              options.overwrite,
            ) || changed;
          summary.google.filled += 1;
          googleOutcome = 'encontrado';
        }
      } catch (error) {
        summary.google.errors += 1;
        summary.failures += 1;
        googleOutcome = 'erro';
        logger.warn(`[${rowId}] Google Maps falhou: ${messageOf(error)}`);
      }
    } else {
      summary.google.skipped += 1;
    }

    const rowSummary = `ViaCEP=${viaCepOutcome}; GEONET=${geonetOutcome}; Google=${googleOutcome}; linha ${changed ? 'atualizada' : 'inalterada'}.`;
    row[index.get('LOG_CONSULTA_GEONET')!] = geonetQuery;
    row[index.get('LOG_CONSULTA_GMAPS')!] = googleQuery;
    row[index.get('LOG_GERAL')!] = rowSummary;
    logger.log(`[${rowId}] ${rowSummary}`);
    if (changed) summary.updatedRows += 1;
    await runCheckpoint(changed);
  };

  // Pool de concorrência: `threads` workers puxam linhas de um cursor
  // compartilhado, mantendo N consultas em voo ao mesmo tempo. O cache em
  // `cached()` continua deduplicando consultas idênticas entre os workers.
  const workers = Math.min(Math.max(1, options.threads), Math.max(1, last - first));
  logger.log(
    `Processando ${last - first} registro(s) com ${workers} thread(s) simultânea(s); provedores: ${providers.join(', ')}.`,
  );
  let cursor = first;
  const runWorker = async (): Promise<void> => {
    while (cursor < last) {
      const rowNumber = cursor;
      cursor += 1;
      await processRow(rowNumber);
    }
  };
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
  return summary;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

// Motivo detalhado de uma falha do GEONET: mensagem + código e status HTTP
// (as falhas chegam como AppError com `code`/`statusCode`, ex.: GEONET_RATE_LIMITED).
function geonetErrorDetail(error: unknown): string {
  const candidate = error as { code?: unknown; statusCode?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : undefined;
  const status = Number(candidate.statusCode);
  const tags = [
    code,
    Number.isFinite(status) && status > 0 ? `HTTP ${status}` : undefined,
  ].filter(Boolean);
  return tags.length > 0 ? `${messageOf(error)} [${tags.join(', ')}]` : messageOf(error);
}

function googleApiKeyOf(env: NodeJS.ProcessEnv): string | undefined {
  const key = env.GOOGLE_MAPS_API_KEY?.trim() || env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  return key || undefined;
}

function retryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function jsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export function createAddressServices(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): AddressServices {
  const geonetConfig = geonetConfigOf(env);
  if (!geonetConfig) {
    throw new Error(
      'GEONET não configurado: informe GEONET_API_BASE_URL, TOKEN_URL, CLIENT_ID e CLIENT_SECRET.',
    );
  }
  const googleApiKey = googleApiKeyOf(env);
  if (!googleApiKey)
    throw new Error(
      'Google Maps não configurado: informe GOOGLE_MAPS_API_KEY ou VITE_GOOGLE_MAPS_API_KEY.',
    );
  const gateway = new GeonetAddressGateway(geonetConfig, fetchImpl);

  return {
    viaCep: async (cep) =>
      withRetry(async () => {
        const response = await fetchImpl(
          `https://viacep.com.br/ws/${encodeURIComponent(cep)}/json/`,
          {
            signal: AbortSignal.timeout(10_000),
          },
        );
        const body = asRecord(await jsonResponse(response));
        if (!response.ok) {
          throw new ProviderError(`HTTP ${response.status}.`, retryableHttpStatus(response.status));
        }
        if (!body || body.erro === true) return null;
        return {
          logradouro: stringOf(body.logradouro),
          complemento: stringOf(body.complemento),
          bairro: stringOf(body.bairro),
          localidade: stringOf(body.localidade),
          uf: stringOf(body.uf),
        };
      }),
    geonet: async (address, number, row, index) =>
      lookupGeonet(gateway, address, number, row, index),
    google: async (address, row, index) =>
      lookupGoogle(address, googleApiKey, row, index, fetchImpl),
  };
}

async function lookupGeonet(
  gateway: GeonetAddressGateway,
  address: string,
  number: string,
  row: Row,
  index: Map<string, number>,
): Promise<GeonetLookup | null> {
  return withRetry(async () => {
    try {
      const candidate = selectGeonetCandidate(await gateway.search(address, number), row, index);
      if (!candidate?.addressId) return null;
      return toGeonetLookup(candidate, await gateway.detail(candidate.addressId));
    } catch (error) {
      const status = Number((error as { statusCode?: unknown })?.statusCode);
      if (status === 404) return null;
      throw error;
    }
  });
}

function toGeonetLookup(
  candidate: GeonetAddressCandidate,
  detail: GeonetAddressDetail | null,
): GeonetLookup {
  return {
    id: candidate.addressId!,
    formattedAddress: detail?.formattedAddress || candidate.formattedAddress,
    location: coordinatesToCell(detail?.coordinates),
    precision: detail?.geolocationMethod ?? '',
  };
}

function coordinatesToCell(coordinates: [number, number] | undefined): string {
  return coordinates ? JSON.stringify(coordinates) : '';
}

async function lookupGoogle(
  address: string,
  apiKey: string,
  row: Row,
  index: Map<string, number>,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleLookup | null> {
  return withRetry(async () => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('region', 'br');
    url.searchParams.set('components', 'country:BR');
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('key', apiKey);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    const body = asRecord(await jsonResponse(response));
    if (!response.ok)
      throw new ProviderError(`HTTP ${response.status}.`, retryableHttpStatus(response.status));
    const status = stringOf(body?.status);
    if (status === 'ZERO_RESULTS') return null;
    if (status !== 'OK') {
      throw new ProviderError(
        stringOf(body?.error_message) || `status ${status || 'desconhecido'}.`,
        status === 'OVER_QUERY_LIMIT' || status === 'UNKNOWN_ERROR',
      );
    }
    const rawResults = Array.isArray(body?.results) ? body.results : [];
    const result = selectGoogleResult(rawResults as GoogleGeocodeResult[], row, index);
    if (!result?.place_id || !result.formatted_address) return null;
    const location = result.geometry?.location;
    return {
      placeId: result.place_id,
      formattedAddress: result.formatted_address,
      location: coordinatesToCell(
        Number.isFinite(location?.lng) && Number.isFinite(location?.lat)
          ? [location!.lng!, location!.lat!]
          : undefined,
      ),
      precision: result.geometry?.location_type ?? '',
    };
  });
}

async function atomicWrite(path: string, contents: string | Uint8Array): Promise<void> {
  const absolutePath = resolve(path);
  const temporaryPath = `${absolutePath}.enrichment-${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function printSummary(summary: EnrichmentSummary): void {
  const format = (name: string, provider: ProviderSummary): string =>
    `${name}: preenchidos=${provider.filled}, não encontrados=${provider.notFound}, divergentes preenchidos=${provider.mismatched}, erros=${provider.errors}, ignorados=${provider.skipped}`;
  console.log(
    `Registros selecionados: ${summary.selected}; ignorados (já completos): ${summary.skippedRows}; atualizados: ${summary.updatedRows}.`,
  );
  console.log(format('ViaCEP', summary.viaCep));
  console.log(format('GEONET', summary.geonet));
  console.log(format('Google Maps', summary.google));
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = milliseconds / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${remainder}s`);
  return parts.join(' ');
}

export async function runCli(options: CliOptions): Promise<EnrichmentSummary> {
  const startedAt = Date.now();
  loadEnv({ quiet: true });
  const services = createAddressServices(process.env);
  const inputType = extname(options.file).toLowerCase();
  const outputType = extname(options.output).toLowerCase();
  if (inputType !== outputType) {
    throw new Error('A extensão de --out deve ser igual à extensão do arquivo de entrada.');
  }

  let summary: EnrichmentSummary;
  if (inputType === '.csv') {
    const document = parseSemicolonCsv(await readFile(options.file, 'utf8'));
    const onCheckpoint = (): Promise<void> =>
      atomicWrite(options.output, serializeSemicolonCsv(document));
    summary = await enrichRecords(document, services, {
      ...options,
      checkpointEvery: options.checkpoint,
      onCheckpoint,
    });
    await atomicWrite(options.output, serializeSemicolonCsv(document));
  } else if (inputType === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(options.file);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('A planilha não contém abas.');
    const document = worksheetToDocument(worksheet);
    const before: CsvDocument = {
      ...document,
      headers: [...document.headers],
      records: document.records.map((row) => [...row]),
    };
    const onCheckpoint = async (): Promise<void> => {
      applyDocumentToWorksheet(worksheet, before, document);
      await atomicWrite(options.output, new Uint8Array(await workbook.xlsx.writeBuffer()));
    };
    summary = await enrichRecords(document, services, {
      ...options,
      checkpointEvery: options.checkpoint,
      onCheckpoint,
    });
    applyDocumentToWorksheet(worksheet, before, document);
    await atomicWrite(options.output, new Uint8Array(await workbook.xlsx.writeBuffer()));
  } else {
    throw new Error('Formato não suportado. Use CSV (.csv) ou Excel (.xlsx).');
  }
  printSummary(summary);
  console.log(`Tempo total de processamento: ${formatDuration(Date.now() - startedAt)}.`);
  return summary;
}

async function main(): Promise<void> {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options === 'help') {
      console.log(usage());
      return;
    }
    const summary = await runCli(options);
    if (summary.failures > 0) process.exitCode = 2;
  } catch (error) {
    console.error(`Falha no enriquecimento: ${messageOf(error)}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
