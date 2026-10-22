import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_MAP_LAYERS, MapBaseLayerSelector, type MapBaseLayer } from './MapBaseLayerSelector';

const TWO_OPTIONS: readonly MapBaseLayer[] = BASE_MAP_LAYERS.filter(
  (layer) => layer.id === 'roadmap' || layer.id === 'satellite',
);

afterEach(cleanup);

describe('MapBaseLayerSelector', () => {
  it('exibe o MUB alternativo e faz a troca direta quando há duas opções', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <MapBaseLayerSelector options={TWO_OPTIONS} value="roadmap" onChange={onChange} />,
    );

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Trocar base cartográfica para Satélite' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('satellite');

    rerender(<MapBaseLayerSelector options={TWO_OPTIONS} value="satellite" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Trocar base cartográfica para Mapa' }));
    expect(onChange).toHaveBeenLastCalledWith('roadmap');
  });

  it('abre a lista de escolha quando há três ou mais opções', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [
      ...TWO_OPTIONS,
      {
        id: 'light-map',
        label: 'Mapa claro',
        googleMapTypeId: 'roadmap' as const,
        previewTone: 'mapa' as const,
        mapStyles: [],
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

  it('seleciona o MUB Branco na lista de escolha', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MapBaseLayerSelector value="roadmap" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
    await user.click(screen.getByRole('option', { name: 'Branco' }));

    expect(onChange).toHaveBeenCalledWith('blank');
  });

  it('seleciona as bases Neutro, Relevo e Satélite puro na lista de escolha', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MapBaseLayerSelector value="roadmap" onChange={onChange} />);

    for (const [label, id] of [
      ['Neutro', 'neutral'],
      ['Relevo', 'terrain'],
      ['Satélite puro', 'satellite-pure'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
      await user.click(screen.getByRole('option', { name: label }));
      expect(onChange).toHaveBeenLastCalledWith(id);
    }
  });

  it('mapeia Relevo e Satélite puro para os tipos de mapa do Google', () => {
    const byId = (id: string) => BASE_MAP_LAYERS.find((layer) => layer.id === id);

    expect(byId('terrain')?.googleMapTypeId).toBe('terrain');
    expect(byId('satellite-pure')?.googleMapTypeId).toBe('satellite');
    expect(byId('satellite-pure')?.mapStyles).toEqual([]);
    expect(byId('neutral')?.googleMapTypeId).toBe('roadmap');
  });

  it('mostra o Geonet desabilitado e não dispara onChange ao clicar', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MapBaseLayerSelector value="roadmap" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
    const geonetOption = screen.getByRole('option', { name: 'Geonet' });

    expect(geonetOption).toHaveAttribute('aria-disabled', 'true');
    expect(geonetOption).toBeDisabled();

    await user.click(geonetOption);
    expect(onChange).not.toHaveBeenCalledWith('geonet');
  });

  it('duplo clique pula para o próximo MUB selecionável, pulando o Geonet desabilitado', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<MapBaseLayerSelector value="roadmap" onChange={onChange} />);

    const cycle = ['neutral', 'terrain', 'satellite', 'satellite-pure', 'blank'];
    let current = 'roadmap';
    for (const next of cycle) {
      rerender(<MapBaseLayerSelector value={current} onChange={onChange} />);
      await user.dblClick(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
      expect(onChange).toHaveBeenLastCalledWith(next);
      current = next;
    }

    // Do último selecionável (Branco), o próximo dá a volta para o Mapa — o Geonet
    // (disabled) nunca entra no ciclo.
    rerender(<MapBaseLayerSelector value="blank" onChange={onChange} />);
    await user.dblClick(screen.getByRole('button', { name: /Selecionar base cartográfica/i }));
    expect(onChange).toHaveBeenLastCalledWith('roadmap');
  });

  it('duplo clique também troca no atalho de duas opções', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MapBaseLayerSelector options={TWO_OPTIONS} value="roadmap" onChange={onChange} />);

    await user.dblClick(
      screen.getByRole('button', { name: 'Trocar base cartográfica para Satélite' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('satellite');
  });
});
