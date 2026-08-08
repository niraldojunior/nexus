import { describe, expect, it, vi } from 'vitest';
import { animateMapCamera, type MapCameraAdapter, type MapCameraScheduler } from './mapCamera';

function createScheduler() {
  let callback: FrameRequestCallback | null = null;
  const scheduler: MapCameraScheduler = {
    now: () => 0,
    requestFrame: vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    }),
    cancelFrame: vi.fn(),
  };
  return {
    scheduler,
    frameAt(timestamp: number) {
      const next = callback;
      callback = null;
      if (!next) throw new Error('Nenhum frame agendado.');
      next(timestamp);
    },
  };
}

function createMap(center = { lat: -22.9, lng: -43.1 }, zoom = 14) {
  const moveCamera = vi.fn();
  const map: MapCameraAdapter = {
    getCenter: () => ({ lat: () => center.lat, lng: () => center.lng }),
    getZoom: () => zoom,
    moveCamera,
  };
  return { map, moveCamera };
}

describe('animateMapCamera', () => {
  it('interpola centro e zoom no mesmo frame e termina exatamente no destino', () => {
    const { scheduler, frameAt } = createScheduler();
    const { map, moveCamera } = createMap();

    animateMapCamera({
      map,
      target: { lat: -22.8, lng: -43 },
      targetZoom: 18,
      durationMs: 700,
      scheduler,
    });

    frameAt(350);
    const intermediate = moveCamera.mock.calls[0]?.[0];
    expect(intermediate.center.lat).toBeGreaterThan(-22.9);
    expect(intermediate.center.lat).toBeLessThan(-22.8);
    expect(intermediate.center.lng).toBeGreaterThan(-43.1);
    expect(intermediate.center.lng).toBeLessThan(-43);
    expect(intermediate.zoom).toBeGreaterThan(14);
    expect(intermediate.zoom).toBeLessThan(18);

    frameAt(700);
    expect(moveCamera).toHaveBeenLastCalledWith({
      center: { lat: -22.8, lng: -43 },
      zoom: 18,
    });
  });

  it('cancela frames pendentes sem aplicar movimentos tardios', () => {
    const { scheduler, frameAt } = createScheduler();
    const { map, moveCamera } = createMap();

    const cancel = animateMapCamera({
      map,
      target: { lat: -22.8, lng: -43 },
      targetZoom: 18,
      scheduler,
    });

    cancel();
    frameAt(350);

    expect(scheduler.cancelFrame).toHaveBeenCalledWith(1);
    expect(moveCamera).not.toHaveBeenCalled();
  });

  it('aplica o estado final imediatamente quando movimento reduzido está ativo', () => {
    const { scheduler } = createScheduler();
    const { map, moveCamera } = createMap();

    animateMapCamera({
      map,
      target: { lat: -22.8, lng: -43 },
      targetZoom: 18,
      reducedMotion: true,
      scheduler,
    });

    expect(moveCamera).toHaveBeenCalledOnce();
    expect(moveCamera).toHaveBeenCalledWith({
      center: { lat: -22.8, lng: -43 },
      zoom: 18,
    });
    expect(scheduler.requestFrame).not.toHaveBeenCalled();
  });

  it('usa o menor arco ao atravessar o antimeridiano', () => {
    const { scheduler, frameAt } = createScheduler();
    const { map, moveCamera } = createMap({ lat: 0, lng: 179 }, 10);

    animateMapCamera({
      map,
      target: { lat: 0, lng: -179 },
      targetZoom: 12,
      durationMs: 700,
      scheduler,
    });

    frameAt(350);
    const longitude = moveCamera.mock.calls[0]?.[0].center.lng;
    expect(Math.abs(longitude - 179)).toBeLessThan(2);
  });
});
