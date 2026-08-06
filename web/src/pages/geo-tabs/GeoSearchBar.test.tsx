import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeoSearchBar } from './GeoSearchBar';
import type { GeoTreeNode } from '../../services/geoTreeApi';

const mocks = vi.hoisted(() => ({
  fetchTreeSearch: vi.fn(),
  fetchAddressPredictions: vi.fn(),
}));

vi.mock('../../services/geoTreeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geoTreeApi')>();
  return { ...actual, fetchTreeSearch: mocks.fetchTreeSearch };
});

vi.mock('../../utils/googleMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/googleMaps')>();
  return { ...actual, fetchAddressPredictions: mocks.fetchAddressPredictions };
});

afterEach(cleanup);

const node: GeoTreeNode = {
  id: 'site:1',
  kind: 'site',
  label: 'Estação Icaraí',
  hasChildren: false,
};

describe('GeoSearchBar', () => {
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
});
