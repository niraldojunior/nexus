// Cliente da Routes API v2 do Google (`routes.googleapis.com`) — rota a pé entre um
// endereço e as caixas de distribuição em volta, usada pela aba Viabilidade do painel
// de Endereço (ver hooks/useAddressViability).
//
// Não confundir com a Directions API legada, que continua negada para esta chave: a
// Routes API é um produto distinto no Cloud Console e responde a `computeRoutes` e
// `computeRouteMatrix` com CORS liberado para o browser — daí não haver proxy no
// backend, no mesmo espírito do Geocoder/Places em `googleMaps.ts`.
//
// A distância a pé é o proxy do lançamento real de cabo: o drop segue a rua e o poste,
// não a linha reta entre os dois pontos.

import { GOOGLE_MAPS_KEY } from './googleMaps';
import type { MapBounds } from '../services/geoTreeApi';

const ROUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Só o que a lista precisa: a matriz não devolve traçado (é o que a torna barata).
const MATRIX_FIELD_MASK = 'originIndex,destinationIndex,distanceMeters,duration,condition';
const ROUTE_FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';

// Raio médio da Terra, em metros (WGS-84).
const EARTH_RADIUS_M = 6_371_008.8;

// Coordenada no formato do inventário e do GeoJSON: [lng, lat].
export type LngLat = [number, number];

export type WalkLeg = { distanceMeters: number; durationSeconds: number };
export type WalkRoute = WalkLeg & { path: LngLat[] };

type MatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
};

const waypoint = ([lng, lat]: LngLat) => ({
  waypoint: { location: { latLng: { latitude: lat, longitude: lng } } },
});

// `duration` vem como string de segundos no formato Protobuf (`"276s"`).
const parseDuration = (raw: string | undefined): number => {
  if (!raw) return 0;
  const seconds = Number.parseFloat(raw.replace(/s$/, ''));
  return Number.isFinite(seconds) ? seconds : 0;
};

async function postRoutes<T>(url: string, fieldMask: string, body: unknown): Promise<T | null> {
  if (!GOOGLE_MAPS_KEY) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Chave sem a API habilitada, cota estourada ou rede fora do ar: quem chama cai
    // no fallback de linha reta em vez de perder o candidato (ver useAddressViability).
    return null;
  }
}

/**
 * Distância a pé de uma origem para N destinos numa única chamada. O índice do array
 * devolvido é o índice do destino em `destinations`; `null` onde o Google não achou
 * rota (`condition` diferente de `ROUTE_EXISTS`) ou a chamada inteira falhou.
 *
 * A resposta da API **não vem ordenada** — ela é um stream de elementos que chegam na
 * ordem em que ficam prontos —, por isso o resultado é reindexado por
 * `destinationIndex` em vez de posicional.
 */
export async function computeWalkRouteMatrix(
  origin: LngLat,
  destinations: LngLat[],
): Promise<Array<WalkLeg | null>> {
  const empty = destinations.map(() => null);
  if (!destinations.length) return [];

  const elements = await postRoutes<MatrixElement[]>(ROUTE_MATRIX_URL, MATRIX_FIELD_MASK, {
    origins: [waypoint(origin)],
    destinations: destinations.map(waypoint),
    travelMode: 'WALK',
  });
  if (!Array.isArray(elements)) return empty;

  const legs: Array<WalkLeg | null> = [...empty];
  for (const element of elements) {
    const index = element.destinationIndex;
    if (index === undefined || index < 0 || index >= destinations.length) continue;
    if (element.condition !== 'ROUTE_EXISTS' || element.distanceMeters === undefined) continue;
    legs[index] = {
      distanceMeters: element.distanceMeters,
      durationSeconds: parseDuration(element.duration),
    };
  }
  return legs;
}

/**
 * Rota a pé única, com o traçado. Só é chamada no clique numa CDO da lista — a matriz
 * acima resolve a ordenação sem trazer geometria, e é a geometria que custa caro.
 */
export async function computeWalkRoute(origin: LngLat, destination: LngLat): Promise<WalkRoute | null> {
  const payload = await postRoutes<{
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  }>(COMPUTE_ROUTES_URL, ROUTE_FIELD_MASK, {
    origin: { location: { latLng: { latitude: origin[1], longitude: origin[0] } } },
    destination: { location: { latLng: { latitude: destination[1], longitude: destination[0] } } },
    travelMode: 'WALK',
  });

  const route = payload?.routes?.[0];
  const encoded = route?.polyline?.encodedPolyline;
  if (!route || !encoded || route.distanceMeters === undefined) return null;

  const path = decodePolyline(encoded);
  if (path.length < 2) return null;

  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: parseDuration(route.duration),
    path,
  };
}

/**
 * Decodifica uma polyline codificada do Google (o formato de `encodedPolyline`) em
 * coordenadas `[lng, lat]`.
 *
 * Implementado aqui em vez de carregar a biblioteca `geometry` do SDK
 * (`google.maps.geometry.encoding.decodePath`) para manter o módulo puro: assim a aba
 * de Viabilidade é testável no Vitest/jsdom sem subir o Google Maps.
 */
export function decodePolyline(encoded: string): LngLat[] {
  const path: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Cada valor é a diferença para o ponto anterior, em blocos de 5 bits com o bit 6
    // marcando continuação, e com sinal em complemento de dois no bit menos significativo.
    const readValue = (): number => {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };

    lat += readValue();
    lng += readValue();
    path.push([lng / 1e5, lat / 1e5]);
  }

  return path;
}

/** Distância em linha reta entre dois pontos `[lng, lat]`, em metros. */
export function haversineMeters([fromLng, fromLat]: LngLat, [toLng, toLat]: LngLat): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Caixa que circunscreve o círculo de `radiusMeters` em volta do ponto — é o bbox que
 * se manda ao servidor (`/v1/geo/tree/viewport`), que só sabe filtrar por retângulo. O
 * recorte circular fica por conta do `haversineMeters` no cliente.
 */
export function bboxAround([lng, lat]: LngLat, radiusMeters: number): MapBounds {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  // O grau de longitude encolhe com o cosseno da latitude; perto do polo o denominador
  // tende a zero, então o bbox degenera para o mundo inteiro em vez de estourar.
  const cos = Math.cos((lat * Math.PI) / 180);
  const lngDelta = Math.abs(cos) < 1e-6 ? 180 : latDelta / cos;
  return {
    minLng: lng - lngDelta,
    minLat: lat - latDelta,
    maxLng: lng + lngDelta,
    maxLat: lat + latDelta,
  };
}
