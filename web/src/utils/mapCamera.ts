export type MapCameraPoint = { lat: number; lng: number };

export type MapCameraAdapter = {
  getCenter: () => { lat: () => number; lng: () => number } | undefined;
  getZoom: () => number | undefined;
  moveCamera: (options: { center: MapCameraPoint; zoom: number }) => void;
};

export type MapCameraScheduler = {
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
};

type AnimateMapCameraOptions = {
  map: MapCameraAdapter;
  target: MapCameraPoint;
  targetZoom: number;
  durationMs?: number;
  reducedMotion?: boolean;
  scheduler?: MapCameraScheduler;
};

const defaultScheduler: MapCameraScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
};

const easeInOutCubic = (progress: number): number =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

const shortestLongitudeDelta = (start: number, target: number): number =>
  ((((target - start) % 360) + 540) % 360) - 180;

export function animateMapCamera({
  map,
  target,
  targetZoom,
  durationMs = 700,
  reducedMotion = false,
  scheduler = defaultScheduler,
}: AnimateMapCameraOptions): () => void {
  if (reducedMotion) {
    map.moveCamera({ center: target, zoom: targetZoom });
    return () => {};
  }
  const startCenter = map.getCenter()!;
  const startZoom = map.getZoom()!;
  const start = { lat: startCenter.lat(), lng: startCenter.lng() };
  const longitudeDelta = shortestLongitudeDelta(start.lng, target.lng);
  const startedAt = scheduler.now();
  let cancelled = false;
  let frameId = 0;

  const step: FrameRequestCallback = (timestamp) => {
    if (cancelled) return;
    const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / durationMs));
    if (progress === 1) {
      map.moveCamera({ center: target, zoom: targetZoom });
      return;
    }
    const eased = easeInOutCubic(progress);
    map.moveCamera({
      center: {
        lat: start.lat + (target.lat - start.lat) * eased,
        lng: start.lng + longitudeDelta * eased,
      },
      zoom: startZoom + (targetZoom - startZoom) * eased,
    });
    frameId = scheduler.requestFrame(step);
  };

  frameId = scheduler.requestFrame(step);
  return () => {
    cancelled = true;
    scheduler.cancelFrame(frameId);
  };
}
