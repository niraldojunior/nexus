/**
 * Cliente do serviço ArcGIS REST do SIGEL (ANEEL).
 *
 * Público, sem autenticação. Só duas operações: contar e baixar paginado dentro de um envelope.
 * Nada de abstração de "conector" — o módulo recebe `layerId` e devolve features GeoJSON, o que já
 * basta para gás e ferrovia depois.
 */

import type { Bbox, SigelFeature } from './mapper.js';

/** Serviço de Transmissão do SIGEL (layer 3 = subestações, 1 = linhas, 5 = sistemas isolados). */
export const SIGEL_TRANSMISSION_SERVICE =
  'https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/Transmiss%C3%A3o/MapServer';

export const SUBSTATION_LAYER_ID = 3;
export const TRANSMISSION_LINE_LAYER_ID = 1;
export const ISOLATED_SYSTEM_LAYER_ID = 5;

/** Teto do servidor por requisição (`maxRecordCount`); pedir mais é silenciosamente truncado. */
const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

export type FetchLayerOptions = {
  service?: string;
  layerId: number;
  bbox: Bbox;
  /** Teto de features baixadas; o seed usa para `--limit`. */
  limit?: number;
  returnGeometry?: boolean;
  onPage?: (received: number) => void;
};

const envelope = (bbox: Bbox): string =>
  `${bbox.lonMin},${bbox.latMin},${bbox.lonMax},${bbox.latMax}`;

function queryUrl(
  service: string,
  layerId: number,
  params: Record<string, string | number | boolean>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  return `${service}/${layerId}/query?${search.toString()}`;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * GET com retry. O SIGEL é público e ocasionalmente devolve 429/5xx sob carga; três tentativas com
 * backoff exponencial (honrando `Retry-After`) bastam. Inline de propósito: importar o `withRetry`
 * de `enrich-installation-addresses.ts` arrastaria o `loadEnv()` que ele roda no import.
 */
async function getJson(url: string): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
        throw Object.assign(new Error(`HTTP ${response.status} ${response.statusText}`), {
          retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      const payload = (await response.json()) as Record<string, unknown>;
      // O ArcGIS devolve HTTP 200 com corpo `{error:{...}}` — tratar como falha, não como página.
      if (payload.error) {
        const error = payload.error as { message?: string; code?: number };
        throw new Error(`ArcGIS: ${error.message ?? 'erro desconhecido'} (code ${error.code ?? '?'})`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      const retryable =
        (error as { retryable?: boolean }).retryable !== false || error instanceof TypeError;
      if (attempt === MAX_ATTEMPTS || !retryable) break;
      const hinted = (error as { retryAfterMs?: number }).retryAfterMs;
      await sleep(hinted ?? 500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`Falha ao consultar o SIGEL (${MAX_ATTEMPTS} tentativas): ${String(lastError)}`);
}

/** Contagem de features no envelope — serve só para o log da fase de extração. */
export async function countFeatures(options: {
  service?: string;
  layerId: number;
  bbox: Bbox;
}): Promise<number> {
  const payload = await getJson(
    queryUrl(options.service ?? SIGEL_TRANSMISSION_SERVICE, options.layerId, {
      where: '1=1',
      geometry: envelope(options.bbox),
      geometryType: 'esriGeometryEnvelope',
      inSR: 4326,
      spatialRel: 'esriSpatialRelIntersects',
      returnCountOnly: true,
      f: 'json',
    }),
  );
  return Number(payload.count ?? 0);
}

/**
 * Baixa as features do layer dentro do envelope, paginando por `resultOffset`.
 *
 * `orderByFields=OID` é obrigatório: sem ordenação estável a paginação pode repetir ou perder
 * registros entre páginas.
 */
export async function fetchLayerFeatures(options: FetchLayerOptions): Promise<SigelFeature[]> {
  const service = options.service ?? SIGEL_TRANSMISSION_SERVICE;
  const features: SigelFeature[] = [];
  const limit = options.limit;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const remaining = limit === undefined ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - features.length);
    if (remaining <= 0) break;

    const payload = await getJson(
      queryUrl(service, options.layerId, {
        where: '1=1',
        geometry: envelope(options.bbox),
        geometryType: 'esriGeometryEnvelope',
        inSR: 4326,
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'OID,Name,PopupInfo',
        returnGeometry: options.returnGeometry ?? true,
        outSR: 4326,
        orderByFields: 'OID',
        resultOffset: offset,
        resultRecordCount: remaining,
        f: 'geojson',
      }),
    );

    const page = Array.isArray(payload.features) ? (payload.features as SigelFeature[]) : [];
    features.push(
      ...page.map((feature) => ({
        properties: (feature.properties ?? {}) as Record<string, unknown>,
        geometry: feature.geometry,
      })),
    );
    options.onPage?.(features.length);

    if (page.length < remaining) break;
  }

  return features;
}
