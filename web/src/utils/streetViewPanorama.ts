export type StreetViewPosition = { lat: number; lng: number };

export type StreetViewMarker = {
  point: [number, number];
  title: string;
  iconUrl: string;
};

export function headingFromPanoramaToTarget(
  panorama: StreetViewPosition,
  target: [number, number],
): number {
  const [targetLng, targetLat] = target;
  if (panorama.lat === targetLat && panorama.lng === targetLng) return 0;

  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const panoramaLat = toRadians(panorama.lat);
  const targetLatRadians = toRadians(targetLat);
  const deltaLng = toRadians(targetLng - panorama.lng);
  const y = Math.sin(deltaLng) * Math.cos(targetLatRadians);
  const x =
    Math.cos(panoramaLat) * Math.sin(targetLatRadians) -
    Math.sin(panoramaLat) * Math.cos(targetLatRadians) * Math.cos(deltaLng);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
