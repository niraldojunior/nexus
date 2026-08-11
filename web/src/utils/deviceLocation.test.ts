import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireDeviceLocation,
  DEVICE_LOCATION_REFINE_MS,
  type DeviceLocation,
} from './deviceLocation';

type Coords = { latitude: number; longitude: number; accuracy: number };
type SuccessCb = (position: { coords: Coords }) => void;
type ErrorCb = (error: { code: number }) => void;

type Watch = { id: number; success: SuccessCb; error?: ErrorCb };

function installGeolocation() {
  const watches: Watch[] = [];
  let nextId = 1;
  const watchPosition = vi.fn((success: SuccessCb, error?: ErrorCb) => {
    const id = nextId++;
    watches.push({ id, success, error });
    return id;
  });
  const clearWatch = vi.fn((id: number) => {
    const index = watches.findIndex((w) => w.id === id);
    if (index >= 0) watches.splice(index, 1);
  });
  Object.defineProperty(navigator, 'geolocation', {
    value: { watchPosition, clearWatch },
    configurable: true,
  });
  return { watches, watchPosition, clearWatch };
}

const coords = (accuracy: number, latitude = -22.9, longitude = -43.1): { coords: Coords } => ({
  coords: { latitude, longitude, accuracy },
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'geolocation');
  vi.restoreAllMocks();
});

describe('acquireDeviceLocation', () => {
  it('emite a primeira leitura na hora, marcada como isFirst', () => {
    const { watches } = installGeolocation();
    const onUpdate = vi.fn<(l: DeviceLocation, first: boolean) => void>();
    acquireDeviceLocation({ onUpdate });

    watches[0].success(coords(50));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ lat: -22.9, lng: -43.1, accuracy: 50 }, true);
  });

  it('ignora uma leitura pior que a melhor já obtida', () => {
    const { watches } = installGeolocation();
    const onUpdate = vi.fn();
    acquireDeviceLocation({ onUpdate });

    watches[0].success(coords(30));
    watches[0].success(coords(45));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ accuracy: 30 }), true);
  });

  it('emite quando o fix aperta, agora com isFirst=false', () => {
    const { watches } = installGeolocation();
    const onUpdate = vi.fn();
    acquireDeviceLocation({ onUpdate });

    watches[0].success(coords(40));
    watches[0].success(coords(25));

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({ accuracy: 40 }), true);
    expect(onUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({ accuracy: 25 }), false);
  });

  it('encerra o refino ao atingir a precisão-alvo e passa ao rastreamento vivo', () => {
    const { watches, watchPosition, clearWatch } = installGeolocation();
    const onUpdate = vi.fn();
    const onSettled = vi.fn();
    acquireDeviceLocation({ onUpdate, onSettled });

    const refineId = watches[0].id;
    watches[0].success(coords(10)); // <= alvo

    expect(clearWatch).toHaveBeenCalledWith(refineId);
    expect(onSettled).toHaveBeenCalledTimes(1);
    // refino + watch de rastreamento vivo.
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });

  it('encerra ao estourar o prazo de refino, sem virar erro', () => {
    const { watches } = installGeolocation();
    const onUpdate = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();
    acquireDeviceLocation({ onUpdate, onError, onSettled });

    watches[0].success(coords(40)); // fix grosseiro, acima do alvo
    vi.advanceTimersByTime(DEVICE_LOCATION_REFINE_MS);

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('avisa erro só quando nenhuma leitura chegou (permissão negada)', () => {
    const { watches } = installGeolocation();
    const onUpdate = vi.fn();
    const onError = vi.fn();
    acquireDeviceLocation({ onUpdate, onError });

    watches[0].error?.({ code: 1 });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(1);
  });

  it('não vira erro se a falha vem depois de já ter posição', () => {
    const { watches } = installGeolocation();
    const onUpdate = vi.fn();
    const onError = vi.fn();
    acquireDeviceLocation({ onUpdate, onError });

    watches[0].success(coords(40));
    watches[0].error?.({ code: 2 });

    expect(onError).not.toHaveBeenCalled();
  });

  it('sinaliza erro quando o navegador não expõe geolocalização', () => {
    Reflect.deleteProperty(navigator, 'geolocation');
    const onUpdate = vi.fn();
    const onError = vi.fn();
    const cancel = acquireDeviceLocation({ onUpdate, onError });

    expect(onError).toHaveBeenCalledWith(2);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(typeof cancel).toBe('function');
  });

  it('o cancelador limpa o watch em curso', () => {
    const { watches, clearWatch } = installGeolocation();
    const cancel = acquireDeviceLocation({ onUpdate: vi.fn() });

    const refineId = watches[0].id;
    cancel();

    expect(clearWatch).toHaveBeenCalledWith(refineId);
  });
});
