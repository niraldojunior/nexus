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
  // Padrão inócuo: sem rota a pé conhecida, a auto-seleção cai no segmento direto.
  computeWalkRoute.mockResolvedValue(null);
});

afterEach(cleanup);

describe('ViabilityTab', () => {
  it('lista as CDOs na ordem recebida, com distância e rótulo de status', async () => {
    const onSimulate = vi.fn();
    useAddressViability.mockReturnValue(
      ready([
        candidate('CDOE-3701 (FSA)', 'active', 118, 'walk'),
        candidate('CDOI-414PS (FSA)', 'suspended', 240, 'walk'),
        candidate('CDOE-2401 (FSA)', 'inactive', 287, 'straight'),
      ]),
    );

    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);

    const items = screen.getAllByRole('button');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('CDOE-3701 (FSA)');
    expect(items[0]).toHaveTextContent('118 m');
    expect(items[2]).toHaveTextContent('CDOE-2401 (FSA)');

    // As três situações que a operação reconhece — `inactive` lê "Indefinida".
    expect(screen.getByText(/^Ativa/)).toBeInTheDocument();
    expect(screen.getByText(/^Suspensa/)).toBeInTheDocument();
    expect(screen.getByText(/^Indefinida/)).toBeInTheDocument();

    // A primeira CDO já entra selecionada, sem clique do usuário.
    await waitFor(() => expect(items[0]).toHaveAttribute('aria-pressed', 'true'));
    expect(items[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('mostra o motivo do substatus entre parênteses numa CDO suspensa', () => {
    const base = candidate('CDOE-9 (FSA)', 'suspended', 150, 'walk');
    const withReason: ViabilityCandidate = {
      ...base,
      node: { ...base.node, detail: { substatus: 'OBRA DESCARTADA - ÁREA DE RISCO' } },
    };
    useAddressViability.mockReturnValue(ready([withReason]));

    render(<ViabilityTab origin={ORIGIN} onSimulate={vi.fn()} />);

    // A fase ("OBRA DESCARTADA - ") é descartada e o motivo entra reduzido.
    expect(screen.getByText(/Suspensa \(Área de Risco\)/)).toBeInTheDocument();
  });

  it('reduz o motivo longo e deixa a linha de status quebrar (sem truncate)', () => {
    const base = candidate('CDOI-1219 (FSA)', 'suspended', 210, 'walk');
    const withReason: ViabilityCandidate = {
      ...base,
      node: {
        ...base.node,
        detail: { substatus: 'OBRA IMPEDIDA - INFRAESTR. DE TERCEIRO INADEQUADA' },
      },
    };
    useAddressViability.mockReturnValue(ready([withReason]));

    render(<ViabilityTab origin={ORIGIN} onSimulate={vi.fn()} />);

    const statusLine = screen.getByText(/Suspensa \(Infra\. de Terceiro\)/);
    expect(statusLine).toBeInTheDocument();
    // A linha pode quebrar em mais de uma linha em vez de cortar.
    expect(statusLine).not.toHaveClass('truncate');
  });

  it('marca com "linha reta" e "≈" a CDO sem rota a pé', async () => {
    const onSimulate = vi.fn();
    useAddressViability.mockReturnValue(ready([candidate('CDOE-2401', 'active', 287, 'straight')]));

    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);

    expect(screen.getByText(/linha reta/)).toBeInTheDocument();
    expect(screen.getByText(/≈/)).toBeInTheDocument();
    await waitFor(() => expect(onSimulate).toHaveBeenCalled());
  });

  it('ao abrir, auto-seleciona a primeira CDO e devolve a simulação com o traçado a pé', async () => {
    const path: Array<[number, number]> = [ORIGIN, [-43.1081, -22.8988], [-43.108, -22.899]];
    computeWalkRoute.mockResolvedValue({ distanceMeters: 118, durationSeconds: 95, path });
    useAddressViability.mockReturnValue(ready([candidate('CDOE-3701', 'active', 118, 'walk')]));
    const onSimulate = vi.fn();

    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);

    // Sem clique: a auto-seleção já busca o traçado e devolve a simulação.
    await waitFor(() =>
      expect(onSimulate).toHaveBeenCalledWith(
        expect.objectContaining({ path, distanceMeters: 118, approximate: false }),
      ),
    );
    expect(computeWalkRoute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /CDOE-3701/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Reclicar não paga outra chamada à Routes API — o traçado fica em cache.
    await userEvent.click(screen.getByRole('button', { name: /CDOE-3701/ }));
    await waitFor(() => expect(onSimulate).toHaveBeenCalledTimes(2));
    expect(computeWalkRoute).toHaveBeenCalledTimes(1);
  });

  it('costura o alfinete e a CDO nas pontas do traçado vindo encaixado na rua', async () => {
    // A rota da Routes API vem sem passar pela origem (fachada) nem pela CDO.
    const roadPath: Array<[number, number]> = [
      [-43.1078, -22.8986],
      [-43.1082, -22.8989],
    ];
    computeWalkRoute.mockResolvedValue({ distanceMeters: 118, durationSeconds: 95, path: roadPath });
    useAddressViability.mockReturnValue(ready([candidate('CDOE-3701', 'active', 118, 'walk')]));
    const onSimulate = vi.fn();

    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);

    await waitFor(() => expect(onSimulate).toHaveBeenCalled());
    const calls = onSimulate.mock.calls;
    const simulation = calls[calls.length - 1][0] as { path: Array<[number, number]> };
    // O traçado nasce no alfinete e termina no ponto da CDO, sem vão nas pontas.
    expect(simulation.path[0]).toEqual(ORIGIN);
    expect(simulation.path[simulation.path.length - 1]).toEqual([-43.108, -22.899]);
    expect(simulation.path).toHaveLength(4);
  });

  it('auto-seleciona a CDO de linha reta com o segmento direto, sem chamar a API', async () => {
    const target: [number, number] = [-43.108, -22.899];
    useAddressViability.mockReturnValue(ready([candidate('CDOE-2401', 'active', 287, 'straight')]));
    const onSimulate = vi.fn();

    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);

    await waitFor(() =>
      expect(onSimulate).toHaveBeenCalledWith(
        expect.objectContaining({ path: [ORIGIN, target], approximate: true }),
      ),
    );
    expect(computeWalkRoute).not.toHaveBeenCalled();
  });

  it('mostra o estado vazio quando não há CDO no raio', () => {
    const onSimulate = vi.fn();
    useAddressViability.mockReturnValue(ready([]));
    render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);
    expect(screen.getByText(/Nenhuma CDO num raio de 300 m/)).toBeInTheDocument();
    // Sem candidata, nada é auto-selecionado nem simulado.
    expect(onSimulate).not.toHaveBeenCalled();
  });

  it('apaga a simulação do mapa ao se desmontar', () => {
    useAddressViability.mockReturnValue(ready([candidate('CDOE-3701', 'active', 118, 'walk')]));
    const onSimulate = vi.fn();
    const { unmount } = render(<ViabilityTab origin={ORIGIN} onSimulate={onSimulate} />);
    unmount();
    expect(onSimulate).toHaveBeenCalledWith(null);
  });
});
