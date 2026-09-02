// Posição e contexto do mapa Geo (issue #182) — persistência de viewport (centro/zoom) e do
// "o que está aberto" (endereço buscado, Site ou Recurso selecionado), para sobreviver a um
// reload (F5, restauração de aba, crash, ou o refresh do cliente HMR do Vite em dev — ver
// `web/vite.config.mjs`). É núcleo puro (sem React, sem Google Maps): a cola React fica em
// `hooks/useGeoViewState.ts`.
//
// Escopo deliberadamente restrito a viewport + a seleção central da doca. `dockView` de
// Projeto, `hierarchyCollapsed`, `hierarchyTab`, `stackedPortNode` e `dropSimulation` ficam
// de fora — cada um teria sua própria régua de "quando é seguro restaurar" e não fazem parte
// do sintoma relatado (perder o endereço buscado).
//
// Mesmo padrão de leitura/escrita defensiva de `utils/mapLayers.ts` / `utils/geoSearchScope.ts`:
// qualquer coisa fora do formato esperado (JSON inválido, campo fora de faixa, storage
// indisponível) cai num default seguro — nunca lança, nunca deixa o usuário num estado que não
// escolheu.

import type { DraftAddress } from './googleMaps';

export type MapCamera = { lat: number; lng: number; zoom: number };

// `site`/`resource` guardam só o id (refId, uuid) — nunca o `GeoTreeNode` inteiro, que é
// pesado e pode estar desatualizado. A re-hidratação usa `fetchTreeNode('site:<id>' |
// 'resource:<id>')` (services/geoTreeApi.ts), o mesmo endpoint que já completa a seleção
// feita a partir de uma feature do InfraOverlay (ver GeoPage.selectNodeFromInfraOverlay).
export type GeoViewContext =
  | { kind: 'none' }
  | { kind: 'site'; siteId: string }
  | { kind: 'resource'; resourceId: string }
  | {
      kind: 'address';
      source: 'search' | 'map';
      lat: number;
      lng: number;
      placeId?: string;
      query?: string;
      // Só persistido no localStorage (ver readStoredViewState/writeStoredViewState) — a URL
      // não carrega o DraftAddress inteiro, só o suficiente para re-geocodificar ou casar
      // identidade com o que está salvo (ver resolveInitialViewState).
      address?: DraftAddress;
    };

export type GeoViewState = { v: 1; camera: MapCamera; context: GeoViewContext };

const STORAGE_KEY = 'nexus.geo.viewState';

// Nomes de parâmetro de URL próprios do viewport do mapa — deliberadamente distintos de
// `page`/`siteId`/`resourceId` (ver utils/navigation.ts). `clearNavigationParams()` apaga
// exatamente esses três; se reusássemos os nomes, o deep-link de Recursos/Serviços apagaria
// nosso estado a cada navegação e/ou nossa restauração reacionaria o efeito de deep-link.
const PARAM_LAT_LNG = 'll';
const PARAM_ZOOM = 'z';
const PARAM_SITE = 'site';
const PARAM_RESOURCE = 'res';
const PARAM_ADDRESS = 'addr';
const PARAM_QUERY = 'q';
const PARAM_PLACE = 'place';

const MIN_ZOOM = 1;
const MAX_ZOOM = 21;

// Texto de busca truncado antes de ir para a URL — só é cosmético (reexibir o que o usuário
// digitou), não precisa do texto inteiro para uma pesquisa livre incomum.
const MAX_QUERY_PARAM_LENGTH = 120;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidLat(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90;
}

function isValidLng(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180;
}

function isValidZoom(value: unknown): value is number {
  return isFiniteNumber(value) && value >= MIN_ZOOM && value <= MAX_ZOOM;
}

// Arredonda para a precisão que a URL carrega (~1 m) — o mesmo grau de "bom o bastante" que
// `mapScaleMeters`/`largestNiceValue` já assumem para leitura humana.
function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

function normalizeCamera(value: unknown): MapCamera | null {
  if (typeof value !== 'object' || value === null) return null;
  const { lat, lng, zoom } = value as Record<string, unknown>;
  if (!isValidLat(lat) || !isValidLng(lng) || !isValidZoom(zoom)) return null;
  return { lat: roundCoord(lat), lng: roundCoord(lng), zoom: Math.round(zoom) };
}

function normalizeContext(value: unknown): GeoViewContext | null {
  if (typeof value !== 'object' || value === null) return { kind: 'none' };
  const raw = value as Record<string, unknown>;
  switch (raw.kind) {
    case 'none':
      return { kind: 'none' };
    case 'site':
      return typeof raw.siteId === 'string' && raw.siteId
        ? { kind: 'site', siteId: raw.siteId }
        : null;
    case 'resource':
      return typeof raw.resourceId === 'string' && raw.resourceId
        ? { kind: 'resource', resourceId: raw.resourceId }
        : null;
    case 'address': {
      if (!isValidLat(raw.lat) || !isValidLng(raw.lng)) return null;
      if (raw.source !== 'search' && raw.source !== 'map') return null;
      const context: GeoViewContext = {
        kind: 'address',
        source: raw.source,
        lat: raw.lat,
        lng: raw.lng,
      };
      if (typeof raw.placeId === 'string') context.placeId = raw.placeId;
      if (typeof raw.query === 'string') context.query = raw.query;
      if (typeof raw.address === 'object' && raw.address !== null) {
        context.address = raw.address as DraftAddress;
      }
      return context;
    }
    default:
      return { kind: 'none' };
  }
}

// Lê o estado salvo; qualquer coisa fora do formato esperado (JSON inválido, versão
// desconhecida, campo fora de faixa, storage indisponível) devolve `null` — quem chama decide
// o default (ver resolveInitialViewState). Nunca lança.
export function readStoredViewState(): GeoViewState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { v, camera, context } = parsed as Record<string, unknown>;
    if (v !== 1) return null;
    const normalizedCamera = normalizeCamera(camera);
    const normalizedContext = normalizeContext(context);
    if (!normalizedCamera || !normalizedContext) return null;
    return { v: 1, camera: normalizedCamera, context: normalizedContext };
  } catch {
    return null;
  }
}

export function writeStoredViewState(state: GeoViewState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage indisponível (modo privado, cota): a posição só não persiste entre sessões —
    // a URL segue funcionando sozinha.
  }
}

// Parseia os parâmetros de viewport de uma querystring (ex.: `location.search`). `camera` vem
// `null` se `ll`/`z` estiverem ausentes ou malformados — quem chama decide se cai no storage ou
// no default. `context` nunca é `null`: ausência de contexto é `{kind:'none'}` legítimo.
export function parseGeoViewParams(search: string): {
  camera: MapCamera | null;
  context: GeoViewContext;
} {
  const params = new URLSearchParams(search);
  const camera = parseCameraParams(params);
  const context = parseContextParams(params);
  return { camera, context };
}

function parseCameraParams(params: URLSearchParams): MapCamera | null {
  const ll = params.get(PARAM_LAT_LNG);
  const z = params.get(PARAM_ZOOM);
  if (!ll || !z) return null;
  const [latStr, lngStr] = ll.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  const zoom = Number(z);
  return normalizeCamera({ lat, lng, zoom });
}

function parseContextParams(params: URLSearchParams): GeoViewContext {
  const siteId = params.get(PARAM_SITE);
  if (siteId) return normalizeContext({ kind: 'site', siteId }) ?? { kind: 'none' };

  const resourceId = params.get(PARAM_RESOURCE);
  if (resourceId) {
    return normalizeContext({ kind: 'resource', resourceId }) ?? { kind: 'none' };
  }

  const addr = params.get(PARAM_ADDRESS);
  if (addr) {
    const [latStr, lngStr] = addr.split(',');
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (isValidLat(lat) && isValidLng(lng)) {
      const context: GeoViewContext = { kind: 'address', source: 'search', lat, lng };
      const query = params.get(PARAM_QUERY);
      const placeId = params.get(PARAM_PLACE);
      if (query) context.query = query;
      if (placeId) context.placeId = placeId;
      return context;
    }
  }

  return { kind: 'none' };
}

// Constrói o conjunto de parâmetros de viewport a escrever na URL — o inverso de
// `parseGeoViewParams`. Contexto `none` não escreve nenhum dos três params de seleção.
export function geoViewSearchParams(state: GeoViewState): URLSearchParams {
  const params = new URLSearchParams();
  params.set(PARAM_LAT_LNG, `${roundCoord(state.camera.lat)},${roundCoord(state.camera.lng)}`);
  params.set(PARAM_ZOOM, String(Math.round(state.camera.zoom)));

  const { context } = state;
  if (context.kind === 'site') {
    params.set(PARAM_SITE, context.siteId);
  } else if (context.kind === 'resource') {
    params.set(PARAM_RESOURCE, context.resourceId);
  } else if (context.kind === 'address') {
    params.set(PARAM_ADDRESS, `${roundCoord(context.lat)},${roundCoord(context.lng)}`);
    if (context.query) params.set(PARAM_QUERY, context.query.slice(0, MAX_QUERY_PARAM_LENGTH));
    if (context.placeId) params.set(PARAM_PLACE, context.placeId);
  }
  return params;
}

// Grava os parâmetros de viewport na URL atual via `history.replaceState` — nunca `pushState`
// (não deve poluir o histórico de voltar/avançar do navegador). Preserva qualquer outro
// parâmetro já presente (ex.: `page`/`siteId` de um deep-link em trânsito) e o caminho atual.
export function writeGeoViewParams(state: GeoViewState): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const next = geoViewSearchParams(state);
  for (const key of [
    PARAM_LAT_LNG,
    PARAM_ZOOM,
    PARAM_SITE,
    PARAM_RESOURCE,
    PARAM_ADDRESS,
    PARAM_QUERY,
    PARAM_PLACE,
  ]) {
    url.searchParams.delete(key);
  }
  for (const [key, value] of next) url.searchParams.set(key, value);
  window.history.replaceState({}, '', url.toString());
}

// Remove os parâmetros de viewport da URL — usado ao navegar para fora de `/geo`.
export function clearGeoViewParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const key of [
    PARAM_LAT_LNG,
    PARAM_ZOOM,
    PARAM_SITE,
    PARAM_RESOURCE,
    PARAM_ADDRESS,
    PARAM_QUERY,
    PARAM_PLACE,
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, '', url.toString());
}

function contextIdentity(context: GeoViewContext): string {
  switch (context.kind) {
    case 'site':
      return `site:${context.siteId}`;
    case 'resource':
      return `resource:${context.resourceId}`;
    case 'address':
      return context.placeId
        ? `place:${context.placeId}`
        : `addr:${roundCoord(context.lat)},${roundCoord(context.lng)}`;
    default:
      return 'none';
  }
}

// Precedência de restauração na montagem da página: parâmetros de URL vencem o localStorage
// (um link compartilhado ou um F5 devem refletir exatamente aquela URL); o storage completa o
// payload rico do endereço (`DraftAddress`) só quando a identidade bate — caso contrário o
// `DraftAddress` salvo pertence a outra seleção e seria enganoso reusá-lo. Sem URL nem storage,
// devolve `null`: quem chama cai no default de sempre (`DEFAULT_CENTER`/zoom 15, sem contexto).
export function resolveInitialViewState(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): GeoViewState | null {
  const fromUrl = parseGeoViewParams(search);
  const stored = readStoredViewState();

  if (fromUrl.camera) {
    let context = fromUrl.context;
    if (
      context.kind === 'address' &&
      stored?.context.kind === 'address' &&
      contextIdentity(context) === contextIdentity(stored.context)
    ) {
      context = { ...context, address: stored.context.address };
    }
    return { v: 1, camera: fromUrl.camera, context };
  }

  return stored;
}
