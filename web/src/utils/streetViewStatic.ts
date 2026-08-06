import { GOOGLE_MAPS_KEY } from './googleMaps';
import { headingFromPanoramaToTarget } from './streetViewPanorama';

// A Street View Static API devolve HTTP 200 com uma imagem cinza "sem cobertura"
// quando não há panorama perto do ponto — não dá para detectar isso por onError da
// <img>. O endpoint de metadata resolve isso: é gratuito (não consome cota) e devolve
// o status real, além da posição exata do panorama (não necessariamente igual ao ponto
// pedido) — é essa posição que serve de origem para apontar a câmera ao alvo.
export type StreetViewAvailability =
  | { status: 'ok'; panoramaPoint: [number, number]; panoId?: string }
  | { status: 'unavailable' } // ZERO_RESULTS — sem cobertura perto do ponto
  | { status: 'error'; code: string }; // ex.: REQUEST_DENIED se a API não estiver habilitada

const METADATA_RADIUS_METERS = 100;

export async function fetchStreetViewAvailability(
  point: [number, number],
): Promise<StreetViewAvailability> {
  if (!GOOGLE_MAPS_KEY) return { status: 'error', code: 'NO_API_KEY' };
  const [lng, lat] = point;
  const url =
    `https://maps.googleapis.com/maps/api/streetview/metadata` +
    `?location=${lat},${lng}&radius=${METADATA_RADIUS_METERS}&key=${encodeURIComponent(GOOGLE_MAPS_KEY)}`;
  try {
    const response = await fetch(url);
    const data = (await response.json()) as {
      status?: string;
      pano_id?: string;
      location?: { lat?: number; lng?: number };
    };
    if (data.status === 'OK' && data.location?.lat !== undefined && data.location?.lng !== undefined) {
      return {
        status: 'ok',
        panoramaPoint: [data.location.lng, data.location.lat],
        panoId: data.pano_id,
      };
    }
    if (data.status === 'ZERO_RESULTS') return { status: 'unavailable' };
    return { status: 'error', code: data.status ?? 'UNKNOWN_ERROR' };
  } catch {
    return { status: 'error', code: 'NETWORK_ERROR' };
  }
}

// Monta a URL da foto estática, apontada do panorama real (não do ponto pedido, que
// pode cair no meio da rua) para o alvo — mesmo cálculo de heading que o modal
// interativo usa (ver GoogleStreetViewModal). Prefere `pano` a `location` quando
// disponível, pelo mesmo motivo do modal: fixa o panorama exato devolvido pela
// metadata, em vez de deixar a Static API escolher de novo por proximidade.
export function streetViewStaticUrl(
  target: [number, number],
  panorama: { panoramaPoint: [number, number]; panoId?: string },
  opts: { width: number; height: number },
): string {
  const heading = headingFromPanoramaToTarget(
    { lat: panorama.panoramaPoint[1], lng: panorama.panoramaPoint[0] },
    target,
  );
  const params = new URLSearchParams({
    size: `${opts.width}x${opts.height}`,
    heading: heading.toFixed(1),
    pitch: '0',
    fov: '80',
    key: GOOGLE_MAPS_KEY ?? '',
  });
  if (panorama.panoId) {
    params.set('pano', panorama.panoId);
  } else {
    params.set('location', `${panorama.panoramaPoint[1]},${panorama.panoramaPoint[0]}`);
  }
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}
