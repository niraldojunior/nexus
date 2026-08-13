// Voo de câmera do mapa Geo, no espírito do Google Maps: ao focar um item distante, a
// câmera AFASTA, viaja e REAPROXIMA, em vez de saltar seco (o `panTo` nativo só anima
// destinos que já caberiam em ~1 viewport; fora disso ele teleporta). Perto, um `panTo`
// simples já basta.
//
// Toda a animação é feita ENCADEANDO as animações nativas do Google por `idle` — nunca
// interpolando zoom quadro a quadro. Isso mantém cada estágio em ZOOM INTEIRO, que é o
// que evita o borrão: no mapa raster, `setZoom` fracionário é desenhado com um `scale()`
// no contêiner inteiro, borrando tiles e inchando todos os marcadores.
//
// O zoom de chegada só APROXIMA (`Math.max(zoomAtual, alvo)`): quem já estava perto não
// tem o enquadramento roubado.

import type { GoogleMapInstance } from './googleMaps';
import { haversineMeters } from './googleRoutes';
import { metersPerPixel, zoomForScaleMeters } from './mapScale';

export type FlyTarget = {
  point: [number, number];
  // Escala-alvo na régua do mapa (m). `null` = voa sem mexer no zoom (ex.: clique num
  // marcador já visível — o item está na tela, aproximar roubaria o enquadramento).
  scaleMeters: number | null;
  // Extensão (m) que deve caber na tela ao pousar — o maior lado do que se quer enquadrar
  // (ex.: o traçado inteiro do drop, ver dropSimulation.pathSpanMeters). Ao contrário de
  // `scaleMeters`, este ajuste PODE AFASTAR: é o único caso em que o zoom de chegada não
  // é limitado por `Math.max(zoomAtual, …)`. Ignorado quando ausente ou ≤ 0.
  fitSpanMeters?: number;
};

export type FlyOptions = {
  // Avisado com `true` no início de um voo encadeado e `false` no fim (ou ao ser
  // superado/cancelado). O chamador usa isto para não disparar busca por viewport nos
  // `idle` intermediários do voo (ver GeoPage).
  onFlightChange?: (active: boolean) => void;
  // Parte inferior do mapa coberta por um painel mobile. Após pousar, a câmera desloca
  // o centro real para que o alvo fique no centro da área ainda descoberta.
  bottomInsetPx?: number;
};

// Um salto conta como "perto" quando os dois pontos já distam menos que esta fração do
// menor lado do mapa — aí o `panTo` nativo anima suave e não vale a pena afastar.
export const NEAR_TRAVEL_FRACTION = 0.8;

// No estágio de afastamento, enquadramos os dois pontos em ~80% do viewport.
const FIT_FRACTION = 0.8;

// Piso do zoom de afastamento — não faz sentido abrir até o globo por um salto entre
// bairros; e teto é sempre `zoomAtual - 1` (afastar ao menos um passo).
const MIN_FLIGHT_ZOOM = 3;

// Se o `idle` de um estágio não chegar (mapa já no destino, `setZoom` sem efeito), este
// timeout avança o voo assim mesmo, para nunca ficar preso no meio.
const STAGE_TIMEOUT_MS = 1200;

// Fallback do lado do viewport em px quando o elemento do mapa ainda não tem medida
// (ex.: primeiro render, ambiente de teste).
const FALLBACK_VIEWPORT_PX = 800;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export function bottomInsetForOverlay(
  mapRect: { top: number; bottom: number; height: number },
  panelHeightPx: number,
  viewportHeightPx: number,
): number {
  const panelTop = viewportHeightPx - Math.max(0, panelHeightPx);
  const overlap = mapRect.bottom - Math.max(mapRect.top, panelTop);
  return clamp(overlap, 0, mapRect.height);
}

type FlightState = {
  // Invalida os estágios pendentes: um voo novo (ou cancelamento) incrementa o token, e
  // todo estágio agendado confere se ainda é o corrente antes de agir.
  token: number;
  active: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  onFlightChange: ((active: boolean) => void) | undefined;
};

// Estado do voo por instância de mapa — WeakMap para não vazar quando o mapa é
// descartado. A instância do Google é objeto estável, boa chave.
const flights = new WeakMap<GoogleMapInstance, FlightState>();

// Zoom (inteiro) que faz `spanMeters` caber em ~FIT_FRACTION do viewport. Base comum do
// zoom de partida (enquadrar origem+destino antes de viajar) e do enquadramento de chegada
// por `fitSpanMeters`. Sempre inteiro (o fracionário borraria o mapa raster — ver mapScale).
function zoomToFit(spanMeters: number, lat: number, viewportPx: number): number {
  const targetMetersPerPixel = spanMeters / (FIT_FRACTION * viewportPx);
  // metersPerPixel(0, lat) = C (constante da projeção na latitude): 2^z = C / mppAlvo.
  return Math.floor(Math.log2(metersPerPixel(0, lat) / targetMetersPerPixel));
}

// Zoom de chegada. `fitSpanMeters > 0` enquadra a extensão pedida na área DESCOBERTA
// (viewport menos o painel) e PODE AFASTAR. Senão, `scaleMeters` só aproxima
// (`Math.max` com o atual); `scaleMeters: null` mantém o zoom. Sempre inteiro.
function arrivalZoomFor(
  target: FlyTarget,
  currentZoom: number,
  lat: number,
  fitViewportPx: number,
): number {
  if (target.fitSpanMeters !== undefined && target.fitSpanMeters > 0) {
    return clamp(zoomToFit(target.fitSpanMeters, lat, fitViewportPx), MIN_FLIGHT_ZOOM, 21);
  }
  if (target.scaleMeters === null) return currentZoom;
  return Math.max(currentZoom, Math.round(zoomForScaleMeters(target.scaleMeters, lat)));
}

// Zoom que enquadra os dois pontos em ~FIT_FRACTION do viewport, para o salto nascer com
// origem e destino à vista antes de viajar. Nunca abaixo de MIN_FLIGHT_ZOOM nem acima de
// `currentZoom - 1` (afastar ao menos um passo).
function departureZoomFor(
  distanceMeters: number,
  lat: number,
  viewportPx: number,
  currentZoom: number,
): number {
  return clamp(
    zoomToFit(distanceMeters, lat, viewportPx),
    MIN_FLIGHT_ZOOM,
    Math.max(1, currentZoom - 1),
  );
}

// Encerra qualquer voo em curso neste mapa e abre um novo "turno" (token). Retorna o
// estado e o token corrente; os estágios conferem o token para se auto-cancelar quando
// superados por um voo mais novo.
function beginFlight(
  map: GoogleMapInstance,
  options?: FlyOptions,
): { state: FlightState; token: number } {
  const state = flights.get(map) ?? {
    token: 0,
    active: false,
    timer: undefined,
    onFlightChange: undefined,
  };
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }
  if (state.active) state.onFlightChange?.(false);
  state.token += 1;
  state.active = false;
  state.onFlightChange = options?.onFlightChange;
  flights.set(map, state);
  return { state, token: state.token };
}

// Executa os estágios em sequência, cada um avançando no `idle` seguinte (fim da
// animação nativa) ou no timeout de segurança. Sinaliza voo ativo no início e no fim.
function runStages(
  map: GoogleMapInstance,
  state: FlightState,
  token: number,
  stages: Array<() => void>,
): void {
  const maps = window.google?.maps;
  if (!maps) {
    // Sem API (teste sem mock de eventos): aplica tudo direto, sem encadear.
    for (const stage of stages) stage();
    return;
  }

  state.active = true;
  state.onFlightChange?.(true);

  let index = 0;
  const finish = () => {
    if (state.token !== token) return;
    state.active = false;
    state.timer = undefined;
    state.onFlightChange?.(false);
  };

  const runNext = () => {
    if (state.token !== token) return; // superado ou cancelado
    if (index >= stages.length) {
      finish();
      return;
    }
    const stage = stages[index++];
    let advanced = false;
    const advance = () => {
      if (advanced || state.token !== token) return;
      advanced = true;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = undefined;
      }
      runNext();
    };
    maps.event.addListenerOnce(map, 'idle', advance);
    state.timer = setTimeout(advance, STAGE_TIMEOUT_MS);
    stage();
  };

  runNext();
}

/**
 * Move a câmera até `target`, animando de verdade: perto, um `panTo` (mais o zoom de
 * chegada se preciso); longe, afasta → viaja → reaproxima, cada estágio em zoom inteiro.
 * Um voo novo cancela o anterior neste mapa.
 */
export function flyTo(map: GoogleMapInstance, target: FlyTarget, options?: FlyOptions): void {
  const [lng, lat] = target.point;
  const { state, token } = beginFlight(map, options);
  const div = map.getDiv?.();
  const mapWidth = div?.clientWidth || FALLBACK_VIEWPORT_PX;
  const mapHeight = div?.clientHeight || FALLBACK_VIEWPORT_PX;
  const bottomInsetPx = clamp(options?.bottomInsetPx ?? 0, 0, mapHeight);
  const offsetStage = () => map.panBy(0, bottomInsetPx / 2);

  // Menor lado do viewport, para medir o salto em pixels. `fitViewportPx` desconta o
  // painel (altura coberta), para o enquadramento por `fitSpanMeters` caber na área ainda
  // visível — o `offsetStage` reposiciona o centro depois de pousar.
  const viewportPx = Math.min(mapWidth, mapHeight) || FALLBACK_VIEWPORT_PX;
  const fitViewportPx =
    Math.max(1, Math.min(mapWidth, mapHeight - bottomInsetPx)) || FALLBACK_VIEWPORT_PX;

  const center = map.getCenter();
  const currentZoom = map.getZoom();
  // Sem estado de câmera ainda: posiciona direto, sem voo encadeado.
  if (!center || currentZoom === undefined || currentZoom === null) {
    map.panTo({ lat, lng });
    if (target.fitSpanMeters !== undefined && target.fitSpanMeters > 0) {
      map.setZoom(clamp(zoomToFit(target.fitSpanMeters, lat, fitViewportPx), MIN_FLIGHT_ZOOM, 21));
    } else if (target.scaleMeters !== null) {
      map.setZoom(Math.round(zoomForScaleMeters(target.scaleMeters, lat)));
    }
    if (bottomInsetPx > 0) offsetStage();
    return;
  }

  const arrivalZoom = arrivalZoomFor(target, currentZoom, lat, fitViewportPx);

  const distanceMeters = haversineMeters([center.lng(), center.lat()], target.point);
  const travelPx = distanceMeters / metersPerPixel(currentZoom, lat);

  if (travelPx <= NEAR_TRAVEL_FRACTION * viewportPx) {
    // `!==` (não `>`): um enquadramento por `fitSpanMeters` pode precisar AFASTAR, e o
    // ramo perto também tem de aplicar esse zoom menor.
    if (arrivalZoom !== currentZoom) {
      const stages = [() => map.panTo({ lat, lng }), () => map.setZoom(arrivalZoom)];
      if (bottomInsetPx > 0) stages.push(offsetStage);
      runStages(map, state, token, stages);
    } else if (bottomInsetPx > 0) {
      runStages(map, state, token, [() => map.panTo({ lat, lng }), offsetStage]);
    } else {
      // Só desloca; deixa o `idle` normal seguir para a busca de infra por viewport.
      map.panTo({ lat, lng });
    }
    return;
  }

  const departureZoom = departureZoomFor(distanceMeters, lat, viewportPx, currentZoom);
  const stages = [
    () => map.setZoom(departureZoom),
    () => map.panTo({ lat, lng }),
    () => map.setZoom(arrivalZoom),
  ];
  if (bottomInsetPx > 0) stages.push(offsetStage);
  runStages(map, state, token, stages);
}

/** Cancela um voo em curso (ex.: no desmonte do painel do mapa). */
export function cancelFlight(map: GoogleMapInstance): void {
  const state = flights.get(map);
  if (!state) return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }
  state.token += 1;
  if (state.active) {
    state.active = false;
    state.onFlightChange?.(false);
  }
}
