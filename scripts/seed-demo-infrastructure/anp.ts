/**
 * Enriquecimento de gasodutos com as autorizações de gás natural da ANP (dados abertos).
 *
 * Fonte: CSV público, UTF-8, separador vírgula, aspas duplas, campos com quebra de linha.
 * A ANP não publica geometria nem o OID do IBGE — a única chave comum é o **nome**. Por isso a
 * junção é só por nome normalizado **exato** e conservadora: instalação ambígua ou campo em
 * conflito entre registros nunca é aplicado. Cobertura baixa é esperada e fica no relatório.
 */

import type { Characteristic, MappedLine } from './mapper.js';
import { knownText } from './mapper.js';

export const ANP_ORIGIN_SYSTEM = 'ANP_AUTORIZACOES_GAS';
export const ANP_GAS_AUTHORIZATIONS_URL =
  'https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/autorizacoes-gas-natural/autorizacoes-construcao-operacao-gas-natural.csv';

const REQUEST_TIMEOUT_MS = 120_000;

export type AnpAuthorization = {
  empresa?: string | undefined;
  tipoDeInstalacao?: string | undefined;
  nomeDaInstalacao?: string | undefined;
  gasoduto?: string | undefined;
};

/** Tipos de instalação que descrevem trecho de duto (ignora compressão, city-gate, GNL etc.). */
const PIPELINE_INSTALLATION = /^(gasoduto de transporte|gasoduto de transfer[eê]ncia)/i;

/** Parser de CSV (RFC 4180): aspas escapadas por `""` e quebra de linha dentro de campo. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseAnpGasAuthorizations(text: string): AnpAuthorization[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const index = (name: string): number => header.findIndex((col) => col.trim() === name);
  const columns = {
    empresa: index('Empresa'),
    tipo: index('TipoDeInstalacao'),
    nome: index('NomeDaInstalacao'),
    gasoduto: index('Gasoduto'),
  };
  if (Object.values(columns).some((position) => position < 0)) {
    throw new Error('CSV da ANP sem as colunas esperadas (Empresa, TipoDeInstalacao, ...)');
  }
  const pick = (row: string[], position: number): string | undefined => knownText(row[position]);
  return rows
    .filter((row) => row.length >= header.length - 1)
    .map((row) => ({
      empresa: pick(row, columns.empresa),
      tipoDeInstalacao: pick(row, columns.tipo),
      nomeDaInstalacao: pick(row, columns.nome),
      gasoduto: pick(row, columns.gasoduto),
    }));
}

export const normalizeKey = (value: string | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export async function fetchAnpGasAuthorizations(
  url: string = ANP_GAS_AUTHORIZATIONS_URL,
): Promise<AnpAuthorization[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`ANP respondeu HTTP ${response.status}`);
  return parseAnpGasAuthorizations(await response.text());
}

export type AnpEnrichmentReport = {
  authorizations: number;
  pipelineAuthorizations: number;
  enriched: number;
  noMatch: number;
  ambiguous: number;
  conflictingFields: number;
};

type AnpGroup = { empresas: Set<string>; tipos: Set<string>; installations: Set<string> };

/** Índice por nome normalizado (`NomeDaInstalacao` e `Gasoduto`), só instalações de duto. */
export function buildAnpIndex(authorizations: readonly AnpAuthorization[]): Map<string, AnpGroup> {
  const index = new Map<string, AnpGroup>();
  for (const item of authorizations) {
    if (!item.tipoDeInstalacao || !PIPELINE_INSTALLATION.test(item.tipoDeInstalacao)) continue;
    const installation = normalizeKey(item.nomeDaInstalacao) || normalizeKey(item.gasoduto);
    for (const key of new Set([normalizeKey(item.nomeDaInstalacao), normalizeKey(item.gasoduto)])) {
      if (key === '') continue;
      const group = index.get(key) ?? {
        empresas: new Set<string>(),
        tipos: new Set<string>(),
        installations: new Set<string>(),
      };
      if (item.empresa) group.empresas.add(item.empresa);
      group.tipos.add(item.tipoDeInstalacao.replace(/;$/, '').trim());
      group.installations.add(installation);
      index.set(key, group);
    }
  }
  return index;
}

/**
 * Acrescenta characteristics da ANP aos gasodutos cujo nome casa exatamente com uma única
 * instalação. Não altera ids: a identidade continua sendo a do IBGE.
 */
export function enrichGasPipelines(
  lines: readonly MappedLine[],
  authorizations: readonly AnpAuthorization[],
): { lines: MappedLine[]; report: AnpEnrichmentReport } {
  const index = buildAnpIndex(authorizations);
  const report: AnpEnrichmentReport = {
    authorizations: authorizations.length,
    pipelineAuthorizations: authorizations.filter(
      (item) => item.tipoDeInstalacao && PIPELINE_INSTALLATION.test(item.tipoDeInstalacao),
    ).length,
    enriched: 0,
    noMatch: 0,
    ambiguous: 0,
    conflictingFields: 0,
  };

  const enrichedLines = lines.map((line): MappedLine => {
    const group = index.get(normalizeKey(line.name.replace(/ \(parte \d+\)$/, '')));
    if (!group) {
      report.noMatch += 1;
      return line;
    }
    if (group.installations.size !== 1) {
      report.ambiguous += 1;
      return line;
    }
    const added: Characteristic[] = [];
    const single = (name: string, values: Set<string>): void => {
      if (values.size === 1) {
        added.push({ name, value: [...values][0] as string, valueType: 'string' });
      } else if (values.size > 1) report.conflictingFields += 1;
    };
    single('operador', group.empresas);
    single('tipoInstalacao', group.tipos);
    if (added.length === 0) return line;
    report.enriched += 1;
    return {
      ...line,
      characteristics: [
        ...line.characteristics.filter(
          (c) => c.name !== '_origin.extra' && !added.some((a) => a.name === c.name),
        ),
        ...added,
        {
          name: '_origin.extra',
          value: { sources: [{ system: ANP_ORIGIN_SYSTEM, matchedBy: 'nome-exato' }] },
          valueType: 'json',
        } as Characteristic,
      ],
    };
  });
  return { lines: enrichedLines, report };
}
