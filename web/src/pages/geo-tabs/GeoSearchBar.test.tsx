import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeoSearchBar } from './GeoSearchBar';
import type { GeoTreeNode } from '../../services/geoTreeApi';

const mocks = vi.hoisted(() => ({
  fetchTreeSearch: vi.fn(),
  fetchAddressPredictions: vi.fn(),
  resolveAddressByPlaceId: vi.fn(),
  geocodeAddress: vi.fn(),
}));

vi.mock('../../services/geoTreeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geoTreeApi')>();
  return { ...actual, fetchTreeSearch: mocks.fetchTreeSearch };
});

vi.mock('../../utils/googleMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/googleMaps')>();
  return {
    ...actual,
    fetchAddressPredictions: mocks.fetchAddressPredictions,
    resolveAddressByPlaceId: mocks.resolveAddressByPlaceId,
    geocodeAddress: mocks.geocodeAddress,
  };
});

afterEach(cleanup);

const node: GeoTreeNode = {
  id: 'site:1',
  kind: 'site',
  label: 'Estação Icaraí',
  hasChildren: false,
};

describe('GeoSearchBar', () => {
  it('mantém o foco enquanto o usuário apenas digita no mobile', () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);

    render(
      <GeoSearchBar
        variant="floating"
        isMobile
        query=""
        onQueryChange={() => {}}
        onSelectNode={() => {}}
        onAddressFound={() => {}}
        onAddressError={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    fireEvent.change(input, { target: { value: 'Estação' } });

    expect(input).toHaveFocus();
  });

  it('preserva o foco ao selecionar um Site ou Recurso no desktop', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([node]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);

    render(
      <GeoSearchBar
        variant="panel"
        query="Estação"
        onQueryChange={() => {}}
        onSelectNode={() => {}}
        onAddressFound={() => {}}
        onAddressError={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Estação Icaraí/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Estação Icaraí/i }));

    expect(input).toHaveFocus();
  });

  it('retira o foco ao confirmar uma busca pelo botão no mobile', () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    mocks.geocodeAddress.mockResolvedValue({
      ok: false,
      status: 'ZERO_RESULTS',
      message: 'Nenhum endereço encontrado.',
    });

    render(
      <GeoSearchBar
        variant="floating"
        isMobile
        query="Rua inexistente"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));

    expect(input).not.toHaveFocus();
  });

  it('retira o foco ao confirmar uma busca por Enter no mobile', () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    mocks.geocodeAddress.mockResolvedValue({
      ok: false,
      status: 'ZERO_RESULTS',
      message: 'Nenhum endereço encontrado.',
    });

    render(
      <GeoSearchBar
        variant="floating"
        isMobile
        query="Rua inexistente"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).not.toHaveFocus();
  });

  it('retira o foco imediatamente ao escolher um endereço no mobile', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([
      { placeId: 'place:1', description: 'Rua Gavião Peixoto, Niterói' },
    ]);
    mocks.resolveAddressByPlaceId.mockResolvedValue({
      ok: true,
      address: {
        street: 'Rua Gavião Peixoto',
        country: 'BR',
        coordinates: [-43.1, -22.9],
        label: 'Rua Gavião Peixoto, Niterói',
      },
    });

    render(
      <GeoSearchBar
        variant="floating"
        isMobile
        query="Gaviao"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    await waitFor(() =>
      expect(screen.getByText('Rua Gavião Peixoto, Niterói')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Rua Gavião Peixoto, Niterói'));

    expect(input).not.toHaveFocus();
  });

  it('retira o foco do campo ao selecionar um Site ou Recurso no mobile', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([node]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);

    render(
      <GeoSearchBar
        variant="floating"
        isMobile
        query="Icarai"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    expect(input).toHaveFocus();
    await waitFor(() => expect(screen.getByText('Estação Icaraí')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Estação Icaraí'));

    expect(input).not.toHaveFocus();
  });

  it('não reabre a picklist ao refocar o input depois de selecionar um item (ex.: foco devolvido pelo balão do mapa)', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([node]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onSelectNode = vi.fn();

    render(
      <GeoSearchBar
        variant="panel"
        query="Icarai"
        onQueryChange={vi.fn()}
        onSelectNode={onSelectNode}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByText('Estação Icaraí')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Estação Icaraí'));
    expect(onSelectNode).toHaveBeenCalledWith(node);
    expect(screen.queryByText('Estação Icaraí')).not.toBeInTheDocument();

    // Simula o InfoWindow do mapa devolvendo o foco ao input ao fechar o balão de
    // preview — reproduz o bug relatado sem depender do Google Maps de verdade.
    fireEvent.blur(input);
    fireEvent.focus(input);

    expect(screen.queryByText('Estação Icaraí')).not.toBeInTheDocument();
  });

  it('o X da caixa limpa o texto e chama onClear (desseleção)', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onQueryChange = vi.fn();
    const onClear = vi.fn();

    render(
      <GeoSearchBar
        variant="overlay"
        query="Icarai"
        onQueryChange={onQueryChange}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onClear={onClear}
      />,
    );

    fireEvent.click(screen.getByLabelText('Limpar busca'));
    expect(onQueryChange).toHaveBeenCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
