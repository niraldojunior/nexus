import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrecisionBadge } from './PrecisionBadge';

afterEach(cleanup);

describe('PrecisionBadge', () => {
  it('classifica ROOFTOP como Alta', () => {
    render(<PrecisionBadge locationType="ROOFTOP" />);
    expect(screen.getByText('Alta - ROOFTOP')).toBeInTheDocument();
  });

  it('classifica RANGE_INTERPOLATED e GEOMETRIC_CENTER como Média', () => {
    render(<PrecisionBadge locationType="RANGE_INTERPOLATED" />);
    expect(screen.getByText('Média - RANGE_INTERPOLATED')).toBeInTheDocument();

    cleanup();
    render(<PrecisionBadge locationType="GEOMETRIC_CENTER" />);
    expect(screen.getByText('Média - GEOMETRIC_CENTER')).toBeInTheDocument();
  });

  it('classifica APPROXIMATE como Baixa', () => {
    render(<PrecisionBadge locationType="APPROXIMATE" />);
    expect(screen.getByText('Baixa - APPROXIMATE')).toBeInTheDocument();
  });

  it('cai em Desconhecida sem código, sem sufixo', () => {
    render(<PrecisionBadge />);
    expect(screen.getByText('Desconhecida')).toBeInTheDocument();
  });

  it('cai em Desconhecida com um código não mapeado, mostrando o texto cru', () => {
    render(<PrecisionBadge locationType="ALGO_NOVO" />);
    expect(screen.getByText('Desconhecida - ALGO_NOVO')).toBeInTheDocument();
  });
});
