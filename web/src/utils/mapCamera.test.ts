import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bottomInsetForOverlay, cancelFlight, flyTo } from './mapCamera';
import type { GoogleMapInstance } from './googleMaps';

// Fila de handlers de `idle`: `addListenerOnce` empilha, `flushIdle` dispara o próximo —
// é assim que simulamos o fim de cada animação nativa que encadeia os estágios do voo.
let idleQueue: Array<() => void> = [];

function installGoogle() {
  idleQueue = [];
  (window as unknown as { google: unknown }).google = {
    maps: {
      event: {
        addListenerOnce: (_map: object, _event: string, handler: () => void) => {
          idleQueue.push(handler);
        },
        clearInstanceListeners: vi.fn(),
      },
    },
  };
}

function flushIdle() {
  const handler = idleQueue.shift();
  if (handler) handler();
}

function makeMap(center: [number, number], zoom: number) {
  const map = {
    getCenter: () => ({ lat: () => center[1], lng: () => center[0] }),
    getZoom: () => zoom,
    getDiv: () => ({ clientWidth: 1000, clientHeight: 800 }) as unknown as HTMLElement,
    panTo: vi.fn(),
    panBy: vi.fn(),
    setZoom: vi.fn(),
  };
  return map as unknown as GoogleMapInstance & {
    panTo: ReturnType<typeof vi.fn>;
    panBy: ReturnType<typeof vi.fn>;
    setZoom: ReturnType<typeof vi.fn>;
  };
}

// Um alvo distante o suficiente para o salto contar como "longe" (afasta → viaja →
// reaproxima); ~0,5° de longitude ≈ 50 km na latitude usada.
const RIO: [number, number] = [-43.1, -22.9];
const FAR: [number, number] = [-42.6, -22.9];
// ~10 m ao lado: salto "perto" em qualquer zoom de rua.
const NEAR: [number, number] = [-43.1 + 0.0001, -22.9];

beforeEach(() => {
  installGoogle();
});
afterEach(() => {
  delete (window as unknown as { google?: unknown }).google;
  vi.useRealTimers();
});

describe('flyTo', () => {
  it('após chegar desloca o alvo para o centro da área acima do painel', () => {
    const map = makeMap(RIO, 20);

    flyTo(map, { point: NEAR, scaleMeters: 20 }, { bottomInsetPx: 320 });

    expect(map.panTo).toHaveBeenCalledWith({ lat: NEAR[1], lng: NEAR[0] });
    expect(map.panBy).not.toHaveBeenCalled();
    flushIdle();
    expect(map.panBy).toHaveBeenCalledWith(0, 160);
  });

  it('perto e sem precisar aproximar: só desloca com panTo, sem tocar no zoom', () => {
    const map = makeMap(RIO, 20); // já mais perto que a escala de chegada
    flyTo(map, { point: NEAR, scaleMeters: 20 });
    expect(map.panTo).toHaveBeenCalledTimes(1);
    expect(map.panTo).toHaveBeenCalledWith({ lat: NEAR[1], lng: NEAR[0] });
    expect(map.setZoom).not.toHaveBeenCalled();
  });

  it('perto mas aberto demais: desloca e então aproxima, com zoom inteiro', () => {
    const map = makeMap(RIO, 16);
    flyTo(map, { point: NEAR, scaleMeters: 20 });
    expect(map.panTo).toHaveBeenCalledTimes(1);
    expect(map.setZoom).not.toHaveBeenCalled(); // o zoom só entra no idle seguinte
    flushIdle();
    expect(map.setZoom).toHaveBeenCalledTimes(1);
    const zoom = map.setZoom.mock.calls[0][0] as number;
    expect(Number.isInteger(zoom)).toBe(true);
    expect(zoom).toBeGreaterThan(16);
  });

  it('longe: afasta, viaja e reaproxima — três estágios, todos em zoom inteiro', () => {
    const map = makeMap(RIO, 16);
    flyTo(map, { point: FAR, scaleMeters: 20 });

    // Estágio 1 já rodou (afastar) assim que o voo começou.
    expect(map.setZoom).toHaveBeenCalledTimes(1);
    const departure = map.setZoom.mock.calls[0][0] as number;
    expect(Number.isInteger(departure)).toBe(true);
    expect(departure).toBeLessThan(16); // afastou ao menos um passo
    expect(map.panTo).not.toHaveBeenCalled();

    flushIdle(); // estágio 2: viajar
    expect(map.panTo).toHaveBeenCalledWith({ lat: FAR[1], lng: FAR[0] });

    flushIdle(); // estágio 3: reaproximar
    expect(map.setZoom).toHaveBeenCalledTimes(2);
    const arrival = map.setZoom.mock.calls[1][0] as number;
    expect(Number.isInteger(arrival)).toBe(true);
    expect(arrival).toBeGreaterThan(departure);
  });

  it('fitSpanMeters afasta quando o traçado não cabe, pousando em zoom inteiro', () => {
    const map = makeMap(RIO, 20); // bem perto: o drop de ~2 km não cabe
    flyTo(map, { point: NEAR, scaleMeters: null, fitSpanMeters: 2000 });
    // Salto perto: desloca já e aplica o zoom de enquadramento no idle seguinte.
    expect(map.panTo).toHaveBeenCalledWith({ lat: NEAR[1], lng: NEAR[0] });
    flushIdle();
    expect(map.setZoom).toHaveBeenCalledTimes(1);
    const zoom = map.setZoom.mock.calls[0][0] as number;
    expect(Number.isInteger(zoom)).toBe(true);
    expect(zoom).toBeLessThan(20); // afastou para caber
  });

  it('fitSpanMeters desconta o painel: mais área coberta afasta ao menos tanto', () => {
    const noInset = makeMap(RIO, 20);
    flyTo(noInset, { point: NEAR, scaleMeters: null, fitSpanMeters: 2000 });
    flushIdle();
    const zoomNoInset = noInset.setZoom.mock.calls[0][0] as number;

    // Isola a fila de idle do primeiro voo (o handler de finish ainda pendente não
    // interfere no segundo mapa).
    idleQueue = [];
    const withInset = makeMap(RIO, 20);
    flyTo(withInset, { point: NEAR, scaleMeters: null, fitSpanMeters: 2000 }, { bottomInsetPx: 400 });
    flushIdle();
    const zoomWithInset = withInset.setZoom.mock.calls[0][0] as number;
    expect(zoomWithInset).toBeLessThanOrEqual(zoomNoInset);
  });

  it('nunca AFASTA além do necessário: zoom de chegada só aproxima (Math.max com o atual)', () => {
    const map = makeMap(RIO, 21); // já mais perto que a escala-alvo
    flyTo(map, { point: FAR, scaleMeters: 20 });
    flushIdle(); // viajar
    flushIdle(); // reaproximar
    const arrival = map.setZoom.mock.calls[map.setZoom.mock.calls.length - 1][0] as number;
    expect(arrival).toBe(21); // manteve o zoom atual, não baixou para ~19
  });

  it('sinaliza voo ativo no início e inativo no fim de um voo encadeado', () => {
    const map = makeMap(RIO, 16);
    const onFlightChange = vi.fn();
    flyTo(map, { point: FAR, scaleMeters: 20 }, { onFlightChange });
    expect(onFlightChange).toHaveBeenLastCalledWith(true);
    flushIdle(); // viajar
    flushIdle(); // reaproximar
    flushIdle(); // fim → finish
    expect(onFlightChange).toHaveBeenLastCalledWith(false);
  });

  it('um voo novo cancela os estágios pendentes do anterior', () => {
    const map = makeMap(RIO, 16);
    flyTo(map, { point: FAR, scaleMeters: 20 }); // voo A: estágio 1 (afastar)
    flyTo(map, { point: NEAR, scaleMeters: 20 }); // voo B supera A

    // A fila tem [handler de A, handler de B]. O de A deve ser inerte (token vencido).
    flushIdle(); // handler de A → no-op
    // B era perto+aproximar: panTo já rodou; o handler de B aplica o zoom.
    expect(map.panTo).toHaveBeenCalledTimes(1);
    expect(map.panTo).toHaveBeenCalledWith({ lat: NEAR[1], lng: NEAR[0] });
  });

  it('avança pelo timeout de segurança quando o idle não chega', () => {
    vi.useFakeTimers();
    const map = makeMap(RIO, 16);
    flyTo(map, { point: FAR, scaleMeters: 20 }); // estágio 1: afastar
    expect(map.panTo).not.toHaveBeenCalled();
    idleQueue = []; // simula o idle que nunca vem
    vi.advanceTimersByTime(1200);
    expect(map.panTo).toHaveBeenCalledWith({ lat: FAR[1], lng: FAR[0] });
  });

  it('cancelFlight interrompe um voo em curso sem aplicar os estágios restantes', () => {
    const map = makeMap(RIO, 16);
    flyTo(map, { point: FAR, scaleMeters: 20 }); // estágio 1: afastar
    cancelFlight(map);
    flushIdle(); // handler pendente deve ser inerte
    expect(map.panTo).not.toHaveBeenCalled();
  });
});

describe('bottomInsetForOverlay', () => {
  it('mede somente a interseção vertical real entre painel e mapa', () => {
    const mapRect = { top: 100, bottom: 700, height: 600 };

    expect(bottomInsetForOverlay(mapRect, 384, 800)).toBe(284);
    expect(bottomInsetForOverlay(mapRect, 736, 800)).toBe(600);
    expect(bottomInsetForOverlay(mapRect, 96, 800)).toBe(0);
  });
});
