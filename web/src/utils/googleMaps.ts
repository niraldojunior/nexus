// Carregamento e helpers da Google Maps JavaScript API (Geocoder + Places), compartilhados
// entre o mapa (GoogleMapPanel) e a barra de pesquisa (GeoSearchBar) em GeoPage.

declare global {
  interface Window {
    google?: any;
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
  return addressFromGooglePlace({
    formatted_address: place.formatted_address,
    address_components: place.address_components,
    name: query,
    geometry: { location: { lat: () => location.lat(), lng: () => location.lng() } },
  });
}

export function addressFromGooglePlace(place: any): DraftAddress {
  const components = place.address_components ?? [];
  const get = (type: string, short = false) => {
    const component = components.find((item: any) => item.types?.includes(type));
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
  if (!window.google?.maps?.places) return [];
  const service = new window.google.maps.places.AutocompleteService();
  const result = await new Promise<any[]>((resolve) => {
    service.getPlacePredictions(
      { input: query, componentRestrictions: { country: 'br' } },
      (predictions: any[] | null) => resolve(predictions ?? []),
    );
  }).catch(() => []);
  return result.map((prediction) => ({ placeId: prediction.place_id, description: prediction.description }));
}

let placesServiceDiv: HTMLDivElement | null = null;

// `PlacesService` exige um nó do DOM (mesmo sem exibi-lo) — é o jeito da API entregar
// atribuição obrigatória ao Google em resultados de detalhe de lugar.
export async function fetchPlaceDetails(placeId: string): Promise<DraftAddress | null> {
  if (!GOOGLE_MAPS_KEY) return null;
  await loadGoogleMaps(GOOGLE_MAPS_KEY);
  if (!window.google?.maps?.places) return null;
  if (!placesServiceDiv) placesServiceDiv = document.createElement('div');
  const service = new window.google.maps.places.PlacesService(placesServiceDiv);
  const place = await new Promise<any>((resolve) => {
    service.getDetails(
      { placeId, fields: ['address_components', 'formatted_address', 'geometry', 'name'] },
      (result: any, status: string) => resolve(status === 'OK' ? result : null),
    );
  }).catch(() => null);
  if (!place?.geometry?.location) return null;
  return addressFromGooglePlace(place);
}
