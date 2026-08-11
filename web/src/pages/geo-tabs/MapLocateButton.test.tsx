import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLocateButton } from './MapLocateButton';

type Coords = { latitude: number; longitude: number; accuracy: number };
type SuccessCb = (position: { coords: Coords }) => void;
type ErrorCb = (error: { code: number }) => void;

// Captura os callbacks do `watchPosition` para o teste disparar leituras e erros na mão —
// o botão consome a aquisição refinada (deviceLocation), que usa watch, não getCurrentPosition.
function stubGeolocation() {
  const state: { success?: SuccessCb; error?: ErrorCb } = {};
  const watchPosition = vi.fn((success: SuccessCb, error?: ErrorCb) => {
    state.success = success;
    state.error = error;
    return 1;
  });
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, 'geolocation', {
    value: { watchPosition, clearWatch },
    configurable: true,
  });
  return { state, watchPosition, clearWatch };
}

const coords = (accuracy: number): { coords: Coords } => ({
  coords: { latitude: -22.9068, longitude: -43.1075, accuracy },
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'geolocation');
  vi.restoreAllMocks();
});

const locateButton = () => screen.getByRole('button', { name: 'Ir para a minha localização' });

describe('MapLocateButton', () => {
  it('entrega a coordenada e mostra a precisão quando a geolocalização responde', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const { state } = stubGeolocation();

    render(<MapLocateButton onLocate={onLocate} />);
    await user.click(locateButton());
    act(() => state.success?.(coords(14)));

    expect(onLocate).toHaveBeenCalledWith({ lat: -22.9068, lng: -43.1075, accuracy: 14 }, true);
    expect(screen.getByRole('status')).toHaveTextContent('±14 m');
  });

  it('avisa quando o sinal do GPS está impreciso', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const { state } = stubGeolocation();

    render(<MapLocateButton onLocate={onLocate} />);
    await user.click(locateButton());
    act(() => state.success?.(coords(85)));

    // A câmera ainda pousa na primeira leitura, mas a UI acusa a incerteza.
    expect(onLocate).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 85 }), true);
    expect(screen.getByRole('status')).toHaveTextContent(/impreciso.*±85 m/i);
  });

  it('mostra um aviso e não navega quando a permissão é negada', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const { state } = stubGeolocation();

    render(<MapLocateButton onLocate={onLocate} />);
    await user.click(locateButton());
    act(() => state.error?.({ code: 1 }));

    expect(onLocate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/permissão de localização negada/i);
  });

  it('avisa quando o navegador não expõe geolocalização', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    Reflect.deleteProperty(navigator, 'geolocation');

    render(<MapLocateButton onLocate={onLocate} />);
    await user.click(locateButton());

    expect(onLocate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/não expõe a localização/i);
  });
});
