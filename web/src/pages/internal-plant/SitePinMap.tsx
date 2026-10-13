import { useEffect, useRef, useState } from 'react';
import { GOOGLE_MAPS_KEY, loadGoogleMaps, type GoogleMarkerInstance } from '../../utils/googleMaps';

export function SitePinMap({
  point,
  label = 'Mapa do local',
}: {
  point: { lat: number; lng: number };
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!GOOGLE_MAPS_KEY);
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !ref.current) return;
    let cancelled = false;
    let marker: GoogleMarkerInstance | undefined;
    void loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        const maps = window.google?.maps;
        if (cancelled || !ref.current || !maps) return;
        const map = new maps.Map(ref.current, {
          center: point,
          zoom: 16,
          disableDefaultUI: true,
          gestureHandling: 'none',
          clickableIcons: false,
        });
        marker = new maps.Marker({ position: point, map });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [point.lat, point.lng]);
  if (failed) {
    return (
      <p className="text-[0.8rem] text-app-muted">
        {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
      </p>
    );
  }
  return (
    <div
      ref={ref}
      aria-label={label}
      className="h-44 w-full overflow-hidden rounded-[10px] border border-app-border"
    />
  );
}
