import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLoadingBar } from './MapLoadingBar';

// Espelham as constantes internas do componente (APPEAR_DELAY_MS / MIN_VISIBLE_MS): o
// componente não as exporta de propósito (são detalhe de implementação), então o teste
// avança o relógio com folga sobre elas.
const AFTER_APPEAR_MS = 200;
const AFTER_MIN_VISIBLE_MS = 400;

const LOADING_CLASS = 'geo-map-loading';

const progressbar = () => screen.queryByRole('progressbar');
const brandBarLoading = () => document.body.classList.contains(LOADING_CLASS);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  document.body.classList.remove(LOADING_CLASS);
  vi.useRealTimers();
});

describe('MapLoadingBar', () => {
  it('não anuncia nada nem anima a faixa quando não há carga', () => {
    render(<MapLoadingBar busy={false} />);
    expect(progressbar()).not.toBeInTheDocument();
    expect(brandBarLoading()).toBe(false);
  });

  it('só aciona a faixa depois do atraso, para uma carga instantânea não piscar', () => {
    const { rerender } = render(<MapLoadingBar busy />);
    // Ainda dentro da janela de atraso: faixa sólida, sem anúncio.
    expect(progressbar()).not.toBeInTheDocument();
    expect(brandBarLoading()).toBe(false);

    act(() => vi.advanceTimersByTime(AFTER_APPEAR_MS));
    expect(brandBarLoading()).toBe(true);
    const bar = progressbar();
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-label', 'Carregando dados do mapa');

    // Ao terminar a carga, a faixa ainda cumpre a duração mínima antes de voltar ao sólido.
    rerender(<MapLoadingBar busy={false} />);
    expect(brandBarLoading()).toBe(true);
    act(() => vi.advanceTimersByTime(AFTER_MIN_VISIBLE_MS));
    expect(brandBarLoading()).toBe(false);
    expect(progressbar()).not.toBeInTheDocument();
  });

  it('nunca aciona a faixa se a carga resolve antes do atraso', () => {
    const { rerender } = render(<MapLoadingBar busy />);
    rerender(<MapLoadingBar busy={false} />);
    act(() => vi.advanceTimersByTime(AFTER_APPEAR_MS + AFTER_MIN_VISIBLE_MS));
    expect(brandBarLoading()).toBe(false);
    expect(progressbar()).not.toBeInTheDocument();
  });

  it('remove a classe da faixa ao desmontar', () => {
    const { unmount } = render(<MapLoadingBar busy />);
    act(() => vi.advanceTimersByTime(AFTER_APPEAR_MS));
    expect(brandBarLoading()).toBe(true);
    unmount();
    expect(brandBarLoading()).toBe(false);
  });

  it('respeita um rótulo customizado', () => {
    render(<MapLoadingBar busy label="Carregando cobertura" />);
    act(() => vi.advanceTimersByTime(AFTER_APPEAR_MS));
    expect(progressbar()).toHaveAttribute('aria-label', 'Carregando cobertura');
  });
});
