import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceCoverageTab } from './ResourceCoverageTab';

const mocks = vi.hoisted(() => ({ useResourceCoverage: vi.fn() }));

vi.mock('../../hooks/useResourceCoverage', () => ({
  useResourceCoverage: mocks.useResourceCoverage,
}));

afterEach(() => {
  cleanup();
  mocks.useResourceCoverage.mockReset();
});

describe('ResourceCoverageTab', () => {
  it('mostra o carregamento', () => {
    mocks.useResourceCoverage.mockReturnValue({ coverage: undefined, loading: true, error: null });
    render(<ResourceCoverageTab resourceId="cto-1" />);
    expect(screen.getByText('Consultando cobertura…')).toBeInTheDocument();
  });

  it('explica Resource sem Point quando a API devolve 404 normalizado', () => {
    mocks.useResourceCoverage.mockReturnValue({ coverage: undefined, loading: false, error: null });
    render(<ResourceCoverageTab resourceId="sem-ponto" />);
    expect(screen.getByText(/não possui uma geometria pontual/i)).toBeInTheDocument();
  });

  it('mostra célula, áreas e ocupação opcional de portas', () => {
    mocks.useResourceCoverage.mockReturnValue({
      loading: false,
      error: null,
      coverage: {
        point: { lng: -43.1, lat: -22.9 },
        cell: { gridX: 1, gridY: 2, sizeMeters: 50, cdoTotal: 35, cdoAvailable: 22 },
        areas: [
          {
            level: 'neighborhood',
            id: 'badu',
            neighborhoodKey: 'badu',
            neighborhood: 'Badu',
            city: 'Niterói',
            uf: 'RJ',
            cdoTotal: 35,
            cdoAvailable: 22,
            availabilityRatio: 22 / 35,
            coveredAreaKm2: 1.5,
            portsTotal: 16,
            portsUsed: 5,
          },
        ],
      },
    });
    render(<ResourceCoverageTab resourceId="cto-1" />);

    expect(screen.getByText('50 m')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('Badu')).toBeInTheDocument();
    expect(screen.getByText('Portas: 5/16')).toBeInTheDocument();
  });

  it('explica ausência de célula e áreas', () => {
    mocks.useResourceCoverage.mockReturnValue({
      loading: false,
      error: null,
      coverage: { point: { lng: -43.1, lat: -22.9 }, cell: null, areas: [] },
    });
    render(<ResourceCoverageTab resourceId="cto-1" />);

    expect(screen.getByText(/não pertence a uma célula/i)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma área de cobertura indexada/i)).toBeInTheDocument();
  });

  it('mostra erro de consulta', () => {
    mocks.useResourceCoverage.mockReturnValue({
      coverage: undefined,
      loading: false,
      error: 'Não foi possível consultar a cobertura deste recurso.',
    });
    render(<ResourceCoverageTab resourceId="cto-1" />);
    expect(screen.getByText(/Não foi possível consultar/i)).toBeInTheDocument();
  });
});
