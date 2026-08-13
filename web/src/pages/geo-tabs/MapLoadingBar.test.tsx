import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLoadingBar } from './MapLoadingBar';

// Espelham as constantes internas do componente (APPEAR_DELAY_MS / MIN_VISIBLE_MS): o
// componente não as exporta de propósito (são detalhe de implementação), então o teste
// avança o relógio com folga sobre elas.
const AFTER_APPEAR_MS = 200;
const AFTER_MIN_VISIBLE_MS = 400;

const progressbar = () => screen.queryByRole('progressbar');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MapLoadingBar', () => {
  it('não renderiza nada quando não há carga', () => {
    render(<MapLoadingBar busy={false} />);
    expect(progressbar()).not.toBeInTheDocument();
  });

  it('só aparece depois do atraso, para uma carga instantânea não piscar', () => {
    const { rerender } = render(<MapLoadingBar busy />);
    // Ainda dentro da janela de atraso: nada na tela.
    expect(progressbar()).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(AFTER_APPEAR_MS));
    const bar = progressbar();
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-label', 'Carregando dados do mapa');

    // Ao terminar a carga, a barra ainda cumpre a duração mínima antes de sumir.
    rerender(<MapLoadingBar busy={false} />);
    expect(progressbar()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(AFTER_MIN_VISIBLE_MS));
    expect(progressbar()).not.toBeInTheDocument();
  });

  it('nunca aparece se a carga resolve antes do atraso', () => {
    const { rerender } = render(<MapLoadingBar busy />);
    rerender(<MapLoadingBar busy={false} />);
    act(() => vi.advanceTimersByTime(AFTER_APPEAR_MS + AFTER_MIN_VISIBLE_MS));
    expect(progressbar()).not.toBeInTheDocument();
  });

  it('respeita um rótulo customizado', () => {
    render(<MapLoadingBar busy label="Carregando cobertura" />);
    act(() => vi.advanceTimersByTime(AFTER_APPEAR_MS));
    expect(progressbar()).toHaveAttribute('aria-label', 'Carregando cobertura');
  });
});
