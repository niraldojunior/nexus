import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BASE_MAP_LAYERS, MapBaseLayerSelector } from './MapBaseLayerSelector';

describe('MapBaseLayerSelector', () => {
  it('exibe o MUB alternativo e faz a troca direta quando há duas opções', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<MapBaseLayerSelector value="roadmap" onChange={onChange} />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Trocar base cartográfica para Satélite' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('satellite');

    rerender(<MapBaseLayerSelector value="satellite" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Trocar base cartográfica para Mapa' }));
    expect(onChange).toHaveBeenLastCalledWith('roadmap');
  });

  it('abre a lista de escolha quando há três ou mais opções', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [
      ...BASE_MAP_LAYERS,
      {
        id: 'light-map',
        label: 'Mapa claro',
        googleMapTypeId: 'roadmap' as const,
        previewTone: 'mapa' as const,
      },
    ];

    render(<MapBaseLayerSelector options={options} value="roadmap" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
    expect(
      screen.getByRole('listbox', { name: 'Opções de base cartográfica' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Mapa claro' }));

    expect(onChange).toHaveBeenCalledWith('light-map');
    expect(
      screen.queryByRole('listbox', { name: 'Opções de base cartográfica' }),
    ).not.toBeInTheDocument();
  });
});
