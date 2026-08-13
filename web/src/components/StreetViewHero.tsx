import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchStreetViewAvailability, streetViewStaticUrl } from '../utils/streetViewStatic';
import { isValidStreetViewPoint } from '../utils/streetViewTargets';
import type { StreetViewMarker } from '../utils/streetViewPanorama';
import { GoogleStreetViewModal } from './GoogleStreetViewModal';

const HERO_WIDTH = 640;
const HERO_HEIGHT = 416;

/**
 * Foto de Street View no topo de um painel de detalhe (Site, Recurso ou Endereço) —
 * estilo Google Maps. Altura fixa mesmo sem foto (loading, sem cobertura ou API
 * desabilitada), para a foto não pular de lugar sob a barra de pesquisa ancorada
 * ao trocar de item. Clicar na foto abre o modal interativo de Street View — é a
 * única porta para o panorama nos painéis (ver GoogleStreetViewModal).
 */
export function StreetViewHero({ marker }: { marker: StreetViewMarker | null }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const requestTokenRef = useRef(0);
  const point = marker && isValidStreetViewPoint(marker.point) ? marker.point : null;
  const [lng, lat] = point ?? [null, null];

  useEffect(() => {
    setImageUrl(null);
    if (!point) return;
    const token = ++requestTokenRef.current;
    void fetchStreetViewAvailability(point).then((availability) => {
      if (requestTokenRef.current !== token || availability.status !== 'ok') return;
      setImageUrl(
        streetViewStaticUrl(point, availability, { width: HERO_WIDTH, height: HERO_HEIGHT }),
      );
    });
  }, [lng, lat]);

  return (
    <div className="relative h-[229px] w-full shrink-0 bg-slate-100">
      <div className="absolute inset-0 overflow-hidden">
        {imageUrl && marker ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label={`Abrir Streetview de ${marker.title}`}
            className="block h-full w-full"
          >
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-app-muted">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            <span className="text-[0.72rem] font-medium">Sem imagem de Street View</span>
          </div>
        )}
      </div>
      {modalOpen && marker ? (
        <GoogleStreetViewModal marker={marker} onClose={() => setModalOpen(false)} />
      ) : null}
    </div>
  );
}
