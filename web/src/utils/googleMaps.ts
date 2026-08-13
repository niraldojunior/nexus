// Carregamento e helpers da Google Maps JavaScript API (Geocoder + Places), compartilhados
// entre o mapa (GoogleMapPanel) e a barra de pesquisa (GeoSearchBar) em GeoPage.

export type GoogleLatLng = { lat: () => number; lng: () => number };
export type GoogleMapMouseEvent = { latLng: GoogleLatLng };
export type GoogleMapBounds = {
  getCenter: () => GoogleLatLng;
  getNorthEast: () => GoogleLatLng;
  getSouthWest: () => GoogleLatLng;
};
export type GoogleMapTypeId = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
export type GoogleMapInstance = {
  addListener: (eventName: string, listener: (event: GoogleMapMouseEvent) => void) => void;
  getBounds: () => GoogleMapBounds | undefined;
  getCenter: () => GoogleLatLng | undefined;
  getDiv: () => HTMLElement;
  getZoom: () => number | undefined;
  moveCamera: (options: { center: { lat: number; lng: number }; zoom: number }) => void;
  panBy: (x: number, y: number) => void;
  panTo: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  setMapTypeId: (mapTypeId: GoogleMapTypeId) => void;
};
export type GoogleStreetViewPanoramaInstance = {
  setVisible: (visible: boolean) => void;
};
export type GoogleMarkerInstance = {
  addListener: (eventName: string, listener: () => void) => void;
  setIcon: (icon: unknown) => void;
  setMap: (map: GoogleMapInstance | GoogleStreetViewPanoramaInstance | null) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
  setZIndex: (zIndex: number) => void;
};
export type GoogleStreetViewPanoramaData = {
  location?: {
    latLng?: GoogleLatLng;
    pano?: string;
  };
};
export type GooglePolylineInstance = {
  addListener: (eventName: string, listener: () => void) => void;
  setMap: (map: GoogleMapInstance | null) => void;
  setOptions: (options: Record<string, unknown>) => void;
  setPath: (path: Array<{ lat: number; lng: number }>) => void;
};
export type GoogleCircleInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setCenter: (center: { lat: number; lng: number }) => void;
  setRadius: (radius: number) => void;
  setOptions: (options: Record<string, unknown>) => void;
};
export type GoogleInfoWindowInstance = {
  close: () => void;
  open: (options: { map: GoogleMapInstance }) => void;
  setContent: (content: Node) => void;
  setOptions: (options: Record<string, unknown>) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
};

// Camadas de desenho do OverlayView. A cobertura GPON vai em `overlayLayer` — abaixo dos
// marcadores, para não roubar o clique/hover que hoje consulta o endereço do ponto.
export type GoogleMapPanes = {
  overlayLayer: HTMLElement;
  overlayMouseTarget: HTMLElement;
};
export type GoogleMapProjection = {
  fromLatLngToDivPixel: (latLng: GoogleLatLng) => { x: number; y: number } | null;
};
// OverlayView é a base a estender para desenhar num <canvas> próprio sobre o mapa. A subclasse
// adiciona `onAdd`/`draw`/`onRemove` (que o Google chama no ciclo de vida) como métodos próprios;
// aqui declaramos só o que a subclasse consome da base.
export interface GoogleOverlayView {
  setMap: (map: GoogleMapInstance | null) => void;
  getPanes: () => GoogleMapPanes | null;
  getProjection: () => GoogleMapProjection | null;
}

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};
type GooglePlace = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  geometry?: { location?: GoogleLatLng; location_type?: string };
  name?: string;
  place_id?: string;
};
type GooglePlaceWithGeometry = GooglePlace & { geometry: { location: GoogleLatLng } };
type GooglePlacePrediction = { place_id: string; description: string };
export type GoogleMapsApi = {
  maps: {
    Geocoder: new () => {
      geocode: (request: Record<string, unknown>) => Promise<{ results?: GooglePlace[] }>;
    };
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
    Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
    Circle: new (options: Record<string, unknown>) => GoogleCircleInstance;
    InfoWindow: new (options: Record<string, unknown>) => GoogleInfoWindowInstance;
    StreetViewService: new () => {
      getPanorama: (
        request: { location: { lat: number; lng: number }; radius: number },
        callback: (data: GoogleStreetViewPanoramaData | null, status: string) => void,
      ) => void;
    };
    StreetViewPanorama: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => GoogleStreetViewPanoramaInstance;
    Size: new (width: number, height: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    LatLng: new (lat: number, lng: number) => GoogleLatLng;
    OverlayView: { new (): GoogleOverlayView; prototype: GoogleOverlayView };
    SymbolPath: { CIRCLE: unknown };
    event: {
      clearInstanceListeners: (instance: object) => void;
      // Dispara uma única vez e se auto-remove — usado pela câmera para encadear os
      // estágios de um voo longo no `idle` (fim de cada animação nativa), ver mapCamera.
      addListenerOnce: (instance: object, eventName: string, handler: () => void) => void;
    };
    places?: {
      AutocompleteService: new () => {
        getPlacePredictions: (
          request: Record<string, unknown>,
          callback: (predictions: GooglePlacePrediction[] | null) => void,
        ) => void;
      };
      PlacesService: new (element: HTMLElement) => {
        getDetails: (
          request: Record<string, unknown>,
          callback: (result: GooglePlace | null, status: string) => void,
        ) => void;
      };
    };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __nexusGoogleMapsPromise?: Promise<void>;
    // Callback global do padrão `loading=async` do Google: a API o chama quando o core
    // termina de carregar (ver loadGoogleMaps).
    __nexusGoogleMapsReady?: () => void;
  }
}

export type DraftAddress = {
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country: string;
  coordinates: [number, number];
  label: string;
  // Preenchidos apenas quando a resolução veio do Geocoder/Places do Google —
  // ausentes num rascunho criado a partir de clique no mapa (ver reverseGeocode).
  placeId?: string;
  precision?: string;
};

// Resultado tipado da geocodificação: em vez de engolir a falha num `null`, carrega o
// status devolvido pelo Google para o chamador poder mostrar o erro ao usuário.
export type GeocodeOutcome =
  { ok: true; address: DraftAddress } | { ok: false; status: string; message: string };

const GEOCODE_ERROR_MESSAGES: Record<string, string> = {
  ZERO_RESULTS: 'Nenhum endereço encontrado para esta pesquisa.',
  REQUEST_DENIED: 'O serviço de geocodificação do Google não está habilitado para esta chave.',
  OVER_QUERY_LIMIT: 'Limite de consultas ao Google Maps excedido. Tente novamente em instantes.',
  INVALID_REQUEST: 'Pesquisa inválida.',
  UNKNOWN_ERROR: 'Erro desconhecido ao consultar o Google Maps.',
  NO_API_KEY: 'Chave do Google Maps não configurada.',
  NETWORK_ERROR: 'Falha ao carregar o Google Maps.',
};

export function geocodeErrorMessage(status: string): string {
  return GEOCODE_ERROR_MESSAGES[status] ?? `Erro ao consultar o Google Maps (${status}).`;
}

function geocodeOutcomeFromCatch(error: unknown): { ok: false; status: string; message: string } {
  const status =
    (error as { code?: string })?.code ?? (error as { status?: string })?.status ?? 'UNKNOWN_ERROR';
  return { ok: false, status, message: geocodeErrorMessage(status) };
}

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__nexusGoogleMapsPromise) return window.__nexusGoogleMapsPromise;

  window.__nexusGoogleMapsPromise = new Promise((resolve, reject) => {
    // Padrão recomendado pelo Google: `loading=async` + `callback`. Sem eles, o console
    // acusa "loaded directly without loading=async". O callback global é registrado ANTES
    // de anexar o script; a API o chama quando o core carrega, e ele resolve a promise e se
    // remove do window. `defer` sai — é ignorado (e desnecessário) num script `async`.
    window.__nexusGoogleMapsReady = () => {
      resolve();
      delete window.__nexusGoogleMapsReady;
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=__nexusGoogleMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error('Falha ao carregar Google Maps.'));
    document.head.appendChild(script);
  });

  return window.__nexusGoogleMapsPromise;
}

export async function reverseGeocode(lat: number, lng: number): Promise<DraftAddress | null> {
  if (!window.google?.maps) return null;
  const geocoder = new window.google.maps.Geocoder();
  const result = await geocoder.geocode({ location: { lat, lng } });
  const place = result.results?.[0];
  if (!place) return null;
  return addressFromGooglePlace({
    formatted_address: place.formatted_address,
    address_components: place.address_components,
    geometry: { location: { lat: () => lat, lng: () => lng } },
  });
}

// Geocodifica um texto livre (endereço digitado) em um DraftAddress posicionável no mapa.
// Devolve o status do Google em caso de falha (ver GeocodeOutcome) em vez de engolir o erro —
// é o que permite ao chamador mostrar por que a pesquisa não achou nada.
export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
  if (!GOOGLE_MAPS_KEY) {
    return { ok: false, status: 'NO_API_KEY', message: geocodeErrorMessage('NO_API_KEY') };
  }
  await loadGoogleMaps(GOOGLE_MAPS_KEY).catch(() => undefined);
  if (!window.google?.maps) {
    return { ok: false, status: 'NETWORK_ERROR', message: geocodeErrorMessage('NETWORK_ERROR') };
  }
  const geocoder = new window.google.maps.Geocoder();
  try {
    const result = await geocoder.geocode({
      address: query,
      componentRestrictions: { country: 'br' },
    });
    const place = result.results?.[0];
    const location = place?.geometry?.location;
    if (!place || !location) {
      return { ok: false, status: 'ZERO_RESULTS', message: geocodeErrorMessage('ZERO_RESULTS') };
    }
    return {
      ok: true,
      address: addressFromGooglePlace({
        formatted_address: place.formatted_address,
        address_components: place.address_components,
        name: query,
        place_id: place.place_id,
        geometry: {
          location: { lat: () => location.lat(), lng: () => location.lng() },
          location_type: place.geometry?.location_type,
        },
      }),
    };
  } catch (error) {
    return geocodeOutcomeFromCatch(error);
  }
}

// Resolve o endereço escolhido no dropdown de sugestões (AutocompleteService) pelo seu
// placeId. Tenta o Geocoder primeiro — é o caminho que também traz a Precisão
// (`location_type`) — e cai para o Places Details (fetchPlaceDetails) se o Geocoder
// falhar por qualquer motivo: a Geocoding API pode estar desabilitada nesta chave (ver
// memória do projeto "google-maps-apis-desabilitadas"), enquanto o Places Details é o
// que já alimenta o dropdown e continua disponível.
export async function resolveAddressByPlaceId(placeId: string): Promise<GeocodeOutcome> {
  if (!GOOGLE_MAPS_KEY) {
    return { ok: false, status: 'NO_API_KEY', message: geocodeErrorMessage('NO_API_KEY') };
  }
  await loadGoogleMaps(GOOGLE_MAPS_KEY).catch(() => undefined);
  const maps = window.google?.maps;
  if (maps) {
    try {
      const geocoder = new maps.Geocoder();
      const result = await geocoder.geocode({ placeId });
      const place = result.results?.[0];
      const location = place?.geometry?.location;
      if (place && location) {
        return {
          ok: true,
          address: addressFromGooglePlace({
            formatted_address: place.formatted_address,
            address_components: place.address_components,
            place_id: place.place_id ?? placeId,
            geometry: {
              location: { lat: () => location.lat(), lng: () => location.lng() },
              location_type: place.geometry?.location_type,
            },
          }),
        };
      }
    } catch {
      // cai no fallback abaixo
    }
  }
  const details = await fetchPlaceDetails(placeId);
  if (details) return { ok: true, address: details };
  return { ok: false, status: 'ZERO_RESULTS', message: geocodeErrorMessage('ZERO_RESULTS') };
}

export function addressFromGooglePlace(place: GooglePlaceWithGeometry): DraftAddress {
  const components = place.address_components ?? [];
  const get = (type: string, short = false) => {
    const component = components.find((item) => item.types?.includes(type));
    return short ? component?.short_name : component?.long_name;
  };
  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();
  const route = get('route') ?? place.name ?? 'Endereco selecionado';
  const streetNr = get('street_number');
  const city = get('administrative_area_level_2') ?? get('locality');
  const state = get('administrative_area_level_1', true);
  const postcode = get('postal_code');
  return {
    street: route,
    streetNr,
    city,
    stateOrProvince: state,
    postcode,
    country: get('country', true) ?? 'BR',
    coordinates: [lng, lat],
    label: place.formatted_address ?? [route, streetNr, city, state].filter(Boolean).join(', '),
    placeId: place.place_id,
    precision: place.geometry.location_type,
  };
}

// Sugestões de endereço para autocomplete — usa o `AutocompleteService` (JS API) para
// alimentar um dropdown próprio, em vez do widget que se anexa direto num <input>.
export type AddressPrediction = { placeId: string; description: string };

export async function fetchAddressPredictions(query: string): Promise<AddressPrediction[]> {
  if (!GOOGLE_MAPS_KEY || !query.trim()) return [];
  await loadGoogleMaps(GOOGLE_MAPS_KEY);
  const places = window.google?.maps.places;
  if (!places) return [];
  const service = new places.AutocompleteService();
  const result = await new Promise<GooglePlacePrediction[]>((resolve) => {
    service.getPlacePredictions(
      { input: query, componentRestrictions: { country: 'br' } },
      (predictions) => resolve(predictions ?? []),
    );
  }).catch(() => []);
  return result.map((prediction) => ({
    placeId: prediction.place_id,
    description: prediction.description,
  }));
}

let placesServiceDiv: HTMLDivElement | null = null;

// `PlacesService` exige um nó do DOM (mesmo sem exibi-lo) — é o jeito da API entregar
// atribuição obrigatória ao Google em resultados de detalhe de lugar.
export async function fetchPlaceDetails(placeId: string): Promise<DraftAddress | null> {
  if (!GOOGLE_MAPS_KEY) return null;
  await loadGoogleMaps(GOOGLE_MAPS_KEY);
  const places = window.google?.maps.places;
  if (!places) return null;
  if (!placesServiceDiv) placesServiceDiv = document.createElement('div');
  const service = new places.PlacesService(placesServiceDiv);
  const place = await new Promise<GooglePlace | null>((resolve) => {
    service.getDetails(
      {
        placeId,
        fields: ['address_components', 'formatted_address', 'geometry', 'name', 'place_id'],
      },
      (result, status) => resolve(status === 'OK' ? result : null),
    );
  }).catch(() => null);
  if (!place?.geometry?.location) return null;
  return addressFromGooglePlace({
    ...place,
    place_id: place.place_id ?? placeId,
  } as GooglePlaceWithGeometry);
}
