/**
 * Cliente do WFS do IBGE (`geoservicos.ibge.gov.br/geoserver/wfs`, workspace `CCAR`).
 *
 * Público, sem autenticação, saída GeoJSON. As camadas usadas pelo seed são pequenas (108, 683 e
 * 131 feições), então o filtro por UF é feito no cliente (`mapper.ts`) em vez de por `bbox`: a ordem
 * dos eixos de `bbox` no CRS EPSG:4674 varia entre versões do WFS, e errá-la devolveria vazio sem erro.
 */

import type { SigelFeature } from './mapper.js';

const WFS_URL = 'https://geoservicos.ibge.gov.br/geoserver/wfs';

/** Camadas `CCAR:` consumidas pelo seed. */
export const IBGE_GAS_PIPELINE_LAYER = 'BC250_2023_Trecho_Duto_L';
export const IBGE_RAIL_SEGMENT_LAYER = 'BC250_2023_Trecho_Ferroviario_L';
export const IBGE_RAIL_STATION_LAYER = 'BCIM_Edif_Metro_Ferroviaria_P';

const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type WfsPage = {
  features?: Array<{ id?: string; properties?: Record<string, unknown>; geometry?: unknown }>;
  numberMatched?: number;
};

function pageUrl(typeName: string, startIndex: number, count: number): string {
  const search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: `CCAR:${typeName}`,
    outputFormat: 'application/json',
    startIndex: String(startIndex),
    count: String(count),
  });
  return `${WFS_URL}?${search.toString()}`;
}

/**
 * GET com retry. Exceções do GeoServer chegam como XML, então corpo que não é JSON vira falha,
 * não página vazia.
 */
async function getPage(url: string): Promise<WfsPage> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status} ${response.statusText}`), {
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      return (await response.json()) as WfsPage;
    } catch (error) {
      lastError = error;
      const retryable =
        (error as { retryable?: boolean }).retryable !== false || error instanceof TypeError;
      if (attempt === MAX_ATTEMPTS || !retryable) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `Falha ao consultar o WFS do IBGE (${MAX_ATTEMPTS} tentativas): ${String(lastError)}`,
  );
}

/** Total de feições da camada (`numberMatched` de uma página de 1) — só para o log. */
export async function countIbgeFeatures(typeName: string): Promise<number> {
  const page = await getPage(pageUrl(typeName, 0, 1));
  return Number(page.numberMatched ?? 0);
}

/**
 * Baixa a camada inteira, paginando por `startIndex`.
 *
 * O id de origem é o sufixo numérico do `id` da feição (`BC250_2023_Trecho_Duto_L.95` → `95`),
 * exposto em `properties.OID` para que os mapeadores leiam o mesmo campo das camadas da ANEEL.
 */
export async function fetchIbgeFeatures(options: {
  typeName: string;
  limit?: number;
}): Promise<SigelFeature[]> {
  const features: SigelFeature[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const remaining =
      options.limit === undefined ? PAGE_SIZE : Math.min(PAGE_SIZE, options.limit - features.length);
    if (remaining <= 0) break;

    const page = await getPage(pageUrl(options.typeName, offset, remaining));
    const received = Array.isArray(page.features) ? page.features : [];
    for (const feature of received) {
      const sourceId = String(feature.id ?? '').split('.').pop();
      features.push({
        properties: { ...(feature.properties ?? {}), ...(sourceId ? { OID: sourceId } : {}) },
        geometry: feature.geometry,
      });
    }
    if (received.length < remaining) break;
  }
  return features;
}
