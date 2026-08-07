import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { ViabilityCandidate, UseAddressViabilityResult } from '../../hooks/useAddressViability';

const useAddressViability = vi.fn<() => UseAddressViabilityResult>();
const computeWalkRoute = vi.fn();

vi.mock('../../hooks/useAddressViability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useAddressViability')>();
  return { ...actual, useAddressViability: () => useAddressViability() };
});

vi.mock('../../utils/googleRoutes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/googleRoutes')>();
  return { ...actual, computeWalkRoute: (...args: unknown[]) => computeWalkRoute(...args) };
});

const { ViabilityTab } = await import('./ViabilityTab');

const ORIGIN: [number, number] = [-43.1079, -22.8985];

const cdo = (
  name: string,
  status: string,
  point: [number, number],
): GeoTreeNode => ({
  id: `resource:${name}`,
  kind: 'resource',
  label: name,
  resourceType: 'CTO',
  status,
  hasChildren: false,
  geometry: { type: 'Point', coordinates: point },
});

const candidate = (
  name: string,
  status: string,
  distanceMeters: number,
  mode: 'walk' | 'straight',
): ViabilityCandidate => ({
  node: cdo(name, status, [-43.108, -22.899]),
  point: [-43.108, -22.899],
  distanceMeters,
  straightMeters: distanceMeters * 0.7,
  durationSeconds: mode === 'walk' ? distanceMeters * 0.8 : undefined,
  mode,
});

const ready = (candidates: ViabilityCandidate[]): UseAddressViabilityResult => ({
  status: 'ready',
  candidates,
  error: null,
});

beforeEach(() => {
  useAddressViability.mockReset();
  computeWalkRoute.mockReset();
});

afterEach(cleanup);

describe('ViabilityTab', () => {
  it('lista as CDOs na ordem recebida, com distância e rótulo de status', () => {
    useAddressViability.mockReturnValue(
      ready([
        candidate('CDOE-3701 (FSA)', 'active', 118, 'walk'),
        candidate('CDOI-414PS (FSA)', 'suspended', 240, 'walk'),
        candidate('CDOE-2401 (FSA)', 'inactive', 287, 'straight'),
      ]),
    );

    render(<ViabilityTab origin={ORIGIN} onSimulate={vi.fn()} />);

    const items = screen.getAllByRole('button');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('CDOE-3701 (FSA)');
    expect(items[0]).toHaveTextContent('118 m');
    expect(items[2]).toHaveTextContent('CDOE-2401 (FSA)');

    // As três situações que a operação reconhece — `inactive` lê "Indefinida".
    expect(screen.getByText(/^Ativa/)).toBeInTheDocument();
    expect(screen.getByText(/^Suspensa/)).toBeInTheDocument();
    expect(screen.getByText(/^Indefinida/)).toBeInTheDocument();
  });

  it('marca com "linha reta" e "≈" a CDO sem rota a pé', () => {
    useAddressViability.mockReturnValue(ready([candidate('CDOE-2401', 'active', 287, 'straight')]));

    render(<ViabilityTab origin={ORIGIN} onSimulate={vi.fn()} />);

    expect(screen.getByText(/linha reta/)).toBeInTheDocument();
    expect(screen.getByText(/≈/)).toBeInTheDocument();
  });

  it('busca o traçado e devolve a simulação ao clicar numa CDO com rota a pé', async () => {
    const path: Array<[number, number]> = [ORIGIN, [-43.1081, -22.8988], [-43.108, -22.899]];
    computeWalkRoute.mockResolvedValue({ distanceMeters: 118, durationSeconds: 95, path });
    useAddressViability.mockReturnValue(ready([candidate('CDOE-3701', 'active', 118, 'walk')]));
    const onSimulate = vi.fn();

    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);
    await userEvent.click(screen.getByRole('button', { name: /CDOE-3701/ }));

    await waitFor(() => expect(onSimulate).toHaveBeenCalledTimes(1));
    expect(onSimulate).toHaveBeenCalledWith(
      expect.objectContaining({ path, distanceMeters: 118, approximate: false }),
    );

    // Reclicar não paga outra chamada à Routes API — o traçado fica em cache.
    await userEvent.click(screen.getByRole('button', { name: /CDOE-3701/ }));
    await waitFor(() => expect(onSimulate).toHaveBeenCalledTimes(2));
    expect(computeWalkRoute).toHaveBeenCalledTimes(1);
  });

  it('simula o segmento direto, sem chamar a API, quando a CDO caiu na linha reta', async () => {
    const target: [number, number] = [-43.108, -22.899];
    useAddressViability.mockReturnValue(ready([candidate('CDOE-2401', 'active', 287, 'straight')]));
    const onSimulate = vi.fn();

    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);
    await userEvent.click(screen.getByRole('button', { name: /CDOE-2401/ }));

    await waitFor(() => expect(onSimulate).toHaveBeenCalled());
    expect(onSimulate).toHaveBeenCalledWith(
      expect.objectContaining({ path: [ORIGIN, target], approximate: true }),
    );
    expect(computeWalkRoute).not.toHaveBeenCalled();
  });

  it('mostra o estado vazio quando não há CDO no raio', () => {
    useAddressViability.mockReturnValue(ready([]));
    render(<ViabilityTab origin={ORIGIN} onSimulate={vi.fn()} />);
    expect(screen.getByText(/Nenhuma CDO num raio de 300 m/)).toBeInTheDocument();
  });

  it('apaga a simulação do mapa ao se desmontar', () => {
    useAddressViability.mockReturnValue(ready([candidate('CDOE-3701', 'active', 118, 'walk')]));
    const onSimulate = vi.fn();
    const { unmount } = render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);
    unmount();
    expect(onSimulate).toHaveBeenCalledWith(null);
  });
});
