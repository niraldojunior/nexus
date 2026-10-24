// Geocoding Google (endereço em texto → coordenada) do lado do servidor. Usa só a chave de backend
// GOOGLE_MAPS_API_KEY: a VITE_GOOGLE_MAPS_API_KEY vai para o bundle do navegador e é restrita à
// JS API do mapa, então não deve ser reaproveitada aqui.

export type GeocodedPoint = { lng: number; lat: number; formattedAddress: string };

export type GeocodingGateway = {
  geocode(parts: unknown[]): Promise<GeocodedPoint | undefined>;
};

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 8_000;

export const createGoogleGeocodingGateway = (
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): GeocodingGateway => {
  const key = env.GOOGLE_MAPS_API_KEY?.trim();
  return {
    // Sem chave, sem texto ou com erro do provedor devolve undefined: quem chama trata como
    // "localização não resolvida", nunca como "endereço não existe".
    async geocode(parts) {
      if (!key) return undefined;
      const address = parts
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(', ');
      if (!address) return undefined;
      try {
        const url = new URL(GEOCODE_URL);
        url.searchParams.set('address', address);
        url.searchParams.set('region', 'br');
        url.searchParams.set('key', key);
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) return undefined;
        const body = (await response.json()) as {
          status?: string;
          results?: Array<{
            formatted_address?: string;
            geometry?: { location?: { lat?: number; lng?: number } };
          }>;
        };
        const first = body.status === 'OK' ? body.results?.[0] : undefined;
        const lat = first?.geometry?.location?.lat;
        const lng = first?.geometry?.location?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
        return { lng, lat, formattedAddress: first?.formatted_address ?? address };
      } catch {
        return undefined;
      }
    },
  };
};
