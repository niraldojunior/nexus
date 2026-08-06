// Carregamento e helpers da Google Maps JavaScript API (Geocoder + Places), compartilhados
// entre o mapa (GoogleMapPanel) e a barra de pesquisa (GeoSearchBar) em GeoPage.

export type GoogleLatLng = { lat: () => number; lng: () => number };
export type GoogleMapMouseEvent = { latLng: GoogleLatLng };
export type GoogleMapBounds = {
  getCenter: () => GoogleLatLng;
  getNorthEast: () => GoogleLatLng;
  getSouthWest: () => GoogleLatLng;
};
export type GoogleMapInstance = {
  addListener: (eventName: string, listener: (event: GoogleMapMouseEvent) => void) => void;
  getBounds: () => GoogleMapBounds | undefined;
  getZoom: () => number | undefined;
  panTo: (position: { lat: number; lng: number }) => void;
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
export type GoogleInfoWindowInstance = {
  close: () => void;
  open: (options: { map: GoogleMapInstance }) => void;
  setContent: (content: Node) => void;
  setOptions: (options: Record<string, unknown>) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
};

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};
type GooglePlace = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  geometry?: { location?: GoogleLatLng };
  name?: string;
};
type GooglePlaceWithGeometry = GooglePlace & { geometry: { location: GoogleLatLng } };
type GooglePlacePrediction = { place_id: string; description: string };
type GoogleMapsApi = {
  maps: {
    Geocoder: new () => {
      geocode: (request: Record<string, unknown>) => Promise<{ results?: GooglePlace[] }>;
    };
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
    Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
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
    SymbolPath: { CIRCLE: unknown };
    event: {
      clearInstanceListeners: (instance: object) => void;
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
};

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__nexusGoogleMapsPromise) return window.__nexusGoogleMapsPromise;

  window.__nexusGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
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
export async function geocodeAddress(query: string): Promise<DraftAddress | null> {
  if (!GOOGLE_MAPS_KEY) return null;
  await loadGoogleMaps(GOOGLE_MAPS_KEY);
  if (!window.google?.maps) return null;
  const geocoder = new window.google.maps.Geocoder();
  const result = await geocoder
    .geocode({
      address: query,
      componentRestrictions: { country: 'br' },
    })
    .catch(() => null);
  const place = result?.results?.[0];
  if (!place) return null;
  const location = place.geometry?.location;
  if (!location) return null;
  return addressFromGooglePlace({
    formatted_address: place.formatted_address,
    address_components: place.address_components,
    name: query,
    geometry: { location: { lat: () => location.lat(), lng: () => location.lng() } },
  });
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
      { placeId, fields: ['address_components', 'formatted_address', 'geometry', 'name'] },
      (result, status) => resolve(status === 'OK' ? result : null),
    );
  }).catch(() => null);
  if (!place?.geometry?.location) return null;
  return addressFromGooglePlace(place as GooglePlaceWithGeometry);
}
