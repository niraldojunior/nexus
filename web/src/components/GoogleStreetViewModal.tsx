import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  GOOGLE_MAPS_KEY,
  loadGoogleMaps,
  type GoogleMarkerInstance,
  type GoogleStreetViewPanoramaInstance,
} from '../utils/googleMaps';
import { headingFromPanoramaToTarget, type StreetViewMarker } from '../utils/streetViewPanorama';

export type { StreetViewMarker } from '../utils/streetViewPanorama';

type StreetViewState = 'loading' | 'ready' | 'unavailable' | 'error' | 'not-configured';

const STREET_VIEW_RADIUS_METERS = 100;
const MARKER_SIZE = 40;

export function GoogleStreetViewModal({
  marker,
  onClose,
}: {
  marker: StreetViewMarker;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panoramaElementRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<GoogleStreetViewPanoramaInstance | null>(null);
  const markerRef = useRef<GoogleMarkerInstance | null>(null);
  const [state, setState] = useState<StreetViewState>('loading');
  const [markerLng, markerLat] = marker.point;

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (focusable.length === 1) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setState('loading');

    const cleanupGoogleObjects = () => {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      if (panoramaRef.current) {
        window.google?.maps.event.clearInstanceListeners(panoramaRef.current);
        panoramaRef.current.setVisible(false);
        panoramaRef.current = null;
      }
    };

    if (!GOOGLE_MAPS_KEY) {
      setState('not-configured');
      return cleanupGoogleObjects;
    }

    void loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        if (cancelled) return;
        const maps = window.google?.maps;
        const element = panoramaElementRef.current;
        if (!maps || !element) {
          setState('error');
          return;
        }

        const service = new maps.StreetViewService();
        service.getPanorama(
          {
            location: { lat: markerLat, lng: markerLng },
            radius: STREET_VIEW_RADIUS_METERS,
          },
          (data, status) => {
            if (cancelled) return;
            const panoramaLocation = data?.location?.latLng;
            if (status === 'ZERO_RESULTS') {
              setState('unavailable');
              return;
            }
            if (status !== 'OK' || !panoramaLocation) {
              setState('error');
              return;
            }

            try {
              const panoramaPosition = {
                lat: panoramaLocation.lat(),
                lng: panoramaLocation.lng(),
              };
              const heading = headingFromPanoramaToTarget(panoramaPosition, [markerLng, markerLat]);
              const panorama = new maps.StreetViewPanorama(element, {
                ...(data.location?.pano
                  ? { pano: data.location.pano }
                  : { position: panoramaPosition }),
                disableDefaultUI: true,
                addressControl: false,
                fullscreenControl: false,
                linksControl: false,
                motionTracking: false,
                motionTrackingControl: false,
                panControl: false,
                showRoadLabels: false,
                zoomControl: false,
                clickToGo: true,
                enableCloseButton: false,
                pov: { heading, pitch: 0 },
                zoom: 1,
              });
              panoramaRef.current = panorama;
              markerRef.current = new maps.Marker({
                map: panorama,
                position: { lat: markerLat, lng: markerLng },
                title: marker.title,
                icon: {
                  url: marker.iconUrl,
                  scaledSize: new maps.Size(MARKER_SIZE, MARKER_SIZE),
                  anchor: new maps.Point(MARKER_SIZE / 2, MARKER_SIZE / 2),
                },
              });
              setState('ready');
            } catch {
              cleanupGoogleObjects();
              setState('error');
            }
          },
        );
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
      cleanupGoogleObjects();
    };
  }, [marker.iconUrl, marker.title, markerLat, markerLng]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[min(760px,92vh)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[24px] border border-app-border bg-white shadow-modal"
      >
        <header className="flex items-center justify-between gap-4 border-b border-app-border px-4 py-3 sm:px-5">
          <h2 id={titleId} className="truncate font-display text-lg font-semibold text-app-text">
            Streetview · {marker.title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar Streetview"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition hover:bg-app-accent-soft focus-visible:ring-2 focus-visible:ring-app-focus/30"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-slate-100">
          <div
            ref={panoramaElementRef}
            className="h-full w-full"
            aria-label="Panorama do Streetview"
          />
          {state !== 'ready' ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-sm text-app-muted"
            >
              {state === 'loading' ? 'Carregando Streetview…' : null}
              {state === 'unavailable'
                ? 'Streetview indisponível próximo a esta coordenada.'
                : null}
              {state === 'error' ? 'Não foi possível carregar o Streetview.' : null}
              {state === 'not-configured'
                ? 'Google Maps não está configurado neste ambiente.'
                : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
