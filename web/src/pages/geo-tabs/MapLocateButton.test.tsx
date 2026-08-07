import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLocateButton } from './MapLocateButton';

type GeolocationSuccess = (position: {
  coords: { latitude: number; longitude: number; accuracy: number };
}) => void;
type GeolocationError = (error: { code: number }) => void;

function stubGeolocation(getCurrentPosition: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'geolocation');
  vi.restoreAllMocks();
});

describe('MapLocateButton', () => {
  it('entrega a coordenada do dispositivo ao mapa quando a geolocalização responde', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const getCurrentPosition = vi.fn((success: GeolocationSuccess) => {
      success({ coords: { latitude: -22.9068, longitude: -43.1075, accuracy: 14 } });
    });
    stubGeolocation(getCurrentPosition);

    render(<MapLocateButton onLocate={onLocate} />);
    await user.click(screen.getByRole('button', { name: 'Ir para a minha localização' }));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(onLocate).toHaveBeenCalledWith({ lat: -22.9068, lng: -43.1075, accuracy: 14 });
  });

  it('mostra um aviso e não navega quando a permissão é negada', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const getCurrentPosition = vi.fn((_success: GeolocationSuccess, error: GeolocationError) => {
      error({ code: 1 });
    });
    stubGeolocation(getCurrentPosition);

    render(<MapLocateButton onLocate={onLocate} />);
    await user.click(screen.getByRole('button', { name: 'Ir para a minha localização' }));

    expect(onLocate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/permissão de localização negada/i);
  });

  it('avisa quando o navegador não expõe geolocalização', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    Reflect.deleteProperty(navigator, 'geolocation');

    render(<MapLocateButton onLocate={onLocate} />);
    await user.click(screen.getByRole('button', { name: 'Ir para a minha localização' }));

    expect(onLocate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/não expõe a localização/i);
  });
});
