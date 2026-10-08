/**
 * Cliente do WFS geográfico da ANP (`gishub.anp.gov.br/geoserver/ows`, workspace `BD_ANP`).
 *
 * Público, sem autenticação, GeoJSON em EPSG:4674 (SIRGAS 2000, indistinguível de WGS84 na escala
 * do mapa — o seed já trata o IBGE da mesma forma). Licença declarada pelo portal da ANP: CC BY-ND 3.0.
 *
 * Camadas pequenas (≤ 429 feições) vêm numa única consulta; poços (31 mil) paginam por `startIndex`.
 * O GeoServer da ANP **falha com NullPointerException** quando `startIndex` > 0 vem sem `sortBy`,
 * por isso toda página ordena por uma chave estável.
 */

import type { SigelFeature } from './mapper.js';

const WFS_URL = 'https://gishub.anp.gov.br/geoserver/ows';

/** Camadas `BD_ANP:` consumidas pelo seed. */
export const ANP_LIQUID_TERMINAL_LAYER = 'TERMINAIS_LIQ';
export const ANP_LNG_TERMINAL_LAYER = 'Terminais_GNL';
export const ANP_REFINERY_LAYER = 'REFINARIAS_SIRGAS';
export const ANP_GAS_PROCESSING_LAYER = 'UPGN';
export const ANP_FIELD_LAYER = 'CAMPOS_PRODUCAO_SIRGAS';
export const ANP_BLOCK_LAYER = 'BLOCOS_EXPLORATORIOS_SIRGAS';
export const ANP_WELL_LAYER = 'POCOS_SIRGAS';

const PAGE_SIZE = 2000;
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type WfsPage = {
  features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }>;
  numberMatched?: number;
};

export function anpPageUrl(
  typeName: string,
  options: { startIndex: number; count: number; sortBy?: string | undefined },
): string {
  const search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: `BD_ANP:${typeName}`,
    outputFormat: 'application/json',
    count: String(options.count),
  });
  // `startIndex` sem `sortBy` derruba o GeoServer da ANP (400/NPE), mesmo com valor 0.
  if (options.sortBy || options.startIndex > 0) {
    search.set('startIndex', String(options.startIndex));
  }
  if (options.sortBy) search.set('sortBy', options.sortBy);
  return `${WFS_URL}?${search.toString()}`;
}

/** GET com retry. Exceção do GeoServer chega como XML: corpo que não é JSON vira falha. */
async function getPage(url: string): Promise<WfsPage> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        // O portal gov.br rejeita User-Agent vazio (HTTP 403); o WFS não, mas não custa nada.
        headers: { 'User-Agent': 'Mozilla/5.0 nexus-seed-demo' },
      });
      if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status} ${response.statusText}`), {
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      return (await response.json()) as WfsPage;
    } catch (error) {
      lastError = error;
      const retryable =
        (error as { retryable?: boolean }).retryable !== false || error instanceof SyntaxError;
      if (attempt === MAX_ATTEMPTS || !retryable) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `Falha ao consultar o WFS da ANP (${MAX_ATTEMPTS} tentativas): ${String(lastError)}`,
  );
}

/** Total de feições da camada, só para o log. */
export async function countAnpFeatures(typeName: string): Promise<number> {
  const page = await getPage(anpPageUrl(typeName, { startIndex: 0, count: 1 }));
  return Number(page.numberMatched ?? 0);
}

/**
 * Baixa a camada inteira. `sortBy` é obrigatório para camadas paginadas (ver nota do módulo);
 * o campo de ordenação deve ser único na camada.
 *
 * O id de origem de cada mapeador sai de uma propriedade da própria feição, não do `id` do
 * GeoServer (`fid--…` muda a cada consulta).
 */
export async function fetchAnpFeatures(options: {
  typeName: string;
  sortBy: string;
  limit?: number;
}): Promise<SigelFeature[]> {
  const features: SigelFeature[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const remaining =
      options.limit === undefined
        ? PAGE_SIZE
        : Math.min(PAGE_SIZE, options.limit - features.length);
    if (remaining <= 0) break;

    const page = await getPage(
      anpPageUrl(options.typeName, {
        startIndex: offset,
        count: remaining,
        sortBy: options.sortBy,
      }),
    );
    const received = Array.isArray(page.features) ? page.features : [];
    for (const feature of received) {
      features.push({ properties: feature.properties ?? {}, geometry: feature.geometry });
    }
    if (received.length < remaining) break;
  }
  return features;
}
