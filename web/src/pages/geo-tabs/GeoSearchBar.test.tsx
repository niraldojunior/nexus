import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeoSearchBar, type GeoSearchSelection } from './GeoSearchBar';
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

  it('retira o foco ao selecionar um Site ou Recurso no desktop', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([node]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);

    render(
      <GeoSearchBar
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

    expect(input).not.toHaveFocus();
  });

  it('representa a seleção confirmada como chip com o ícone e o nome do nó', () => {
    const onEditSelection = vi.fn();

    render(
      <GeoSearchBar
        query="Estação Icaraí"
        selection={{ type: 'node', node }}
        onEditSelection={onEditSelection}
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Editar seleção Estação Icaraí' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Pesquisar local, recurso ou endereço'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Estação' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar seleção Estação Icaraí' }));
    expect(onEditSelection).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['CTO', 'CTO'],
    ['Cabo de distribuição', 'DistributionCable'],
  ])('reutiliza o ícone canônico para %s na chip de recurso', (label, resourceType) => {
    const resourceNode: GeoTreeNode = {
      id: `resource:${resourceType}`,
      kind: 'resource',
      label,
      sublabel: label,
      resourceType,
      hasChildren: false,
    };

    render(
      <GeoSearchBar
        query={label}
        selection={{ type: 'node', node: resourceNode }}
        onEditSelection={vi.fn()}
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: `Editar seleção ${label}` })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
  });

  it('volta ao modo editável com foco por teclado após ação explícita na chip', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [selection, setSelection] = useState<GeoSearchSelection | null>({ type: 'node', node });
      return (
        <GeoSearchBar
          isMobile
          query="Estação Icaraí"
          selection={selection}
          onEditSelection={() => setSelection(null)}
          onQueryChange={vi.fn()}
          onSelectNode={vi.fn()}
          onAddressFound={vi.fn()}
          onAddressError={vi.fn()}
        />
      );
    }

    render(<Harness />);
    const chip = screen.getByRole('button', { name: 'Editar seleção Estação Icaraí' });
    chip.focus();
    await user.keyboard('{Enter}');

    const input = await screen.findByPlaceholderText('Pesquisar local, recurso ou endereço');
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('só inicia autocomplete depois que a chip volta explicitamente ao modo de edição', async () => {
    let resolveNodes!: (nodes: GeoTreeNode[]) => void;
    mocks.fetchTreeSearch.mockReturnValue(
      new Promise<GeoTreeNode[]>((resolve) => {
        resolveNodes = resolve;
      }),
    );
    mocks.fetchAddressPredictions.mockResolvedValue([]);

    function Harness() {
      const [selection, setSelection] = useState<GeoSearchSelection | null>({ type: 'node', node });
      return (
        <GeoSearchBar
          query="Estação Icaraí"
          selection={selection}
          onEditSelection={() => setSelection(null)}
          onQueryChange={vi.fn()}
          onSelectNode={vi.fn()}
          onAddressFound={vi.fn()}
          onAddressError={vi.fn()}
        />
      );
    }

    render(<Harness />);
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 300)));
    expect(mocks.fetchTreeSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Editar seleção Estação Icaraí' }));
    await waitFor(() => expect(mocks.fetchTreeSearch).toHaveBeenCalledTimes(1));
    await act(async () => resolveNodes([]));
  });

  it('descarta autocomplete em voo quando a busca é limpa', async () => {
    let resolveNodes!: (nodes: GeoTreeNode[]) => void;
    mocks.fetchTreeSearch.mockReturnValue(
      new Promise<GeoTreeNode[]>((resolve) => {
        resolveNodes = resolve;
      }),
    );
    mocks.fetchAddressPredictions.mockResolvedValue([]);

    render(
      <GeoSearchBar
        query="Estação"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.fetchTreeSearch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText('Limpar busca'));
    await act(async () => resolveNodes([node]));
    fireEvent.focus(screen.getByPlaceholderText('Pesquisar local, recurso ou endereço'));

    expect(screen.queryByRole('button', { name: /Estação Icaraí/i })).not.toBeInTheDocument();
  });

  it('mantém os resultados de inventário quando a previsão de endereços falha', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([node]);
    mocks.fetchAddressPredictions.mockRejectedValue(new Error('Places indisponível'));

    render(
      <GeoSearchBar
        query="Estação"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('Pesquisar local, recurso ou endereço'));
    // Com Promise.all a rejeição das previsões zerava tudo; com allSettled o resultado
    // de inventário sobrevive.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Estação Icaraí/i })).toBeInTheDocument(),
    );
  });

  it('mantém os endereços quando a busca de inventário falha', async () => {
    mocks.fetchTreeSearch.mockRejectedValue(new Error('Inventário indisponível'));
    mocks.fetchAddressPredictions.mockResolvedValue([
      { placeId: 'place:1', description: 'Rua Gavião Peixoto, Niterói' },
    ]);

    render(
      <GeoSearchBar
        query="Gavião"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('Pesquisar local, recurso ou endereço'));
    await waitFor(() =>
      expect(screen.getByText('Rua Gavião Peixoto, Niterói')).toBeInTheDocument(),
    );
  });

  it('descarta endereço resolvido depois que o usuário limpa a busca', async () => {
    let resolveAddress!: (outcome: {
      ok: true;
      address: { street: string; country: string; coordinates: [number, number]; label: string };
    }) => void;
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([
      { placeId: 'place:1', description: 'Rua Gavião Peixoto, Niterói' },
    ]);
    mocks.resolveAddressByPlaceId.mockReturnValue(
      new Promise((resolve) => {
        resolveAddress = resolve;
      }),
    );
    const onAddressFound = vi.fn();

    render(
      <GeoSearchBar
        query="Gavião"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={onAddressFound}
        onAddressError={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('Pesquisar local, recurso ou endereço'));
    await waitFor(() => expect(screen.getByText('Rua Gavião Peixoto, Niterói')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Rua Gavião Peixoto, Niterói'));
    fireEvent.click(screen.getByLabelText('Limpar busca'));
    await act(async () =>
      resolveAddress({
        ok: true,
        address: {
          street: 'Rua Gavião Peixoto',
          country: 'BR',
          coordinates: [-43.1, -22.9],
          label: 'Rua Gavião Peixoto, Niterói',
        },
      }),
    );

    expect(onAddressFound).not.toHaveBeenCalled();
  });

  it('descarta endereço antigo quando um nó é selecionado durante a resolução', async () => {
    let resolveAddress!: (outcome: {
      ok: true;
      address: { street: string; country: string; coordinates: [number, number]; label: string };
    }) => void;
    mocks.fetchTreeSearch.mockResolvedValue([node]);
    mocks.fetchAddressPredictions.mockResolvedValue([
      { placeId: 'place:1', description: 'Rua Gavião Peixoto, Niterói' },
    ]);
    mocks.resolveAddressByPlaceId.mockReturnValue(
      new Promise((resolve) => {
        resolveAddress = resolve;
      }),
    );
    const onAddressFound = vi.fn();
    const onSelectNode = vi.fn();

    render(
      <GeoSearchBar
        query="Icaraí"
        onQueryChange={vi.fn()}
        onSelectNode={onSelectNode}
        onAddressFound={onAddressFound}
        onAddressError={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('Pesquisar local, recurso ou endereço'));
    await waitFor(() => expect(screen.getByText('Rua Gavião Peixoto, Niterói')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Rua Gavião Peixoto, Niterói'));
    fireEvent.click(screen.getByRole('button', { name: /Estação Icaraí/i }));
    await act(async () =>
      resolveAddress({
        ok: true,
        address: {
          street: 'Rua Gavião Peixoto',
          country: 'BR',
          coordinates: [-43.1, -22.9],
          label: 'Rua Gavião Peixoto, Niterói',
        },
      }),
    );

    expect(onSelectNode).toHaveBeenCalledWith(node);
    expect(onAddressFound).not.toHaveBeenCalled();
  });

  it('descarta geocoding antigo quando uma seleção externa entra pela árvore ou mapa', async () => {
    const address = {
      street: 'Rua Antiga',
      country: 'BR',
      coordinates: [-43.1, -22.9] as [number, number],
      label: 'Rua Antiga, Niterói',
    };
    let resolveGeocode!: (outcome: { ok: true; address: typeof address }) => void;
    mocks.geocodeAddress.mockReturnValue(
      new Promise((resolve) => {
        resolveGeocode = resolve;
      }),
    );
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onAddressFound = vi.fn();

    function Harness() {
      const [query, setQuery] = useState('Rua Antiga');
      const [selection, setSelection] = useState<GeoSearchSelection | null>(null);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setQuery(node.label);
              setSelection({ type: 'node', node });
            }}
          >
            Selecionar no mapa
          </button>
          <GeoSearchBar
            query={query}
            selection={selection}
            onEditSelection={() => setSelection(null)}
            onQueryChange={setQuery}
            onSelectNode={vi.fn()}
            onAddressFound={onAddressFound}
            onAddressError={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    await waitFor(() => expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar no mapa' }));
    await act(async () => resolveGeocode({ ok: true, address }));

    expect(onAddressFound).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Editar seleção Estação Icaraí' })).toBeInTheDocument();
  });

  it('descarta geocoding antigo quando a query é limpa externamente', async () => {
    const address = {
      street: 'Rua Antiga',
      country: 'BR',
      coordinates: [-43.1, -22.9] as [number, number],
      label: 'Rua Antiga, Niterói',
    };
    let resolveGeocode!: (outcome: { ok: true; address: typeof address }) => void;
    mocks.geocodeAddress.mockReturnValue(
      new Promise((resolve) => {
        resolveGeocode = resolve;
      }),
    );
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onAddressFound = vi.fn();

    function Harness() {
      const [query, setQuery] = useState('Rua Antiga');
      return (
        <>
          <button type="button" onClick={() => setQuery('')}>
            Limpar externamente
          </button>
          <GeoSearchBar
            query={query}
            onQueryChange={setQuery}
            onSelectNode={vi.fn()}
            onAddressFound={onAddressFound}
            onAddressError={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    await waitFor(() => expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar externamente' }));
    await act(async () => resolveGeocode({ ok: true, address }));

    expect(onAddressFound).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Pesquisar local, recurso ou endereço')).toHaveValue('');
  });

  it('representa endereço confirmado como chip com ícone de endereço e rótulo resolvido', () => {
    render(
      <GeoSearchBar
        query="Rua Gavião Peixoto, Niterói"
        selection={{
          type: 'address',
          address: {
            street: 'Rua Gavião Peixoto',
            country: 'BR',
            coordinates: [-43.1, -22.9],
            label: 'Rua Gavião Peixoto, Niterói',
          },
        }}
        onEditSelection={vi.fn()}
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Editar seleção Rua Gavião Peixoto, Niterói' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Endereço' })).toBeInTheDocument();
  });

  it('limpa integralmente a chip e retorna o input vazio ao acionar X', async () => {
    function Harness() {
      const [query, setQuery] = useState('Estação Icaraí');
      const [selection, setSelection] = useState<GeoSearchSelection | null>({ type: 'node', node });

      return (
        <GeoSearchBar
          query={query}
          selection={selection}
          onEditSelection={() => setSelection(null)}
          onQueryChange={setQuery}
          onSelectNode={vi.fn()}
          onAddressFound={vi.fn()}
          onAddressError={vi.fn()}
          onClear={() => {
            setQuery('');
            setSelection(null);
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Limpar busca'));

    const input = await screen.findByPlaceholderText('Pesquisar local, recurso ou endereço');
    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Editar seleção/i })).not.toBeInTheDocument();
  });

  it.each([
    ['botão', 'button'],
    ['Enter', 'enter'],
  ])('converte sucesso por %s em chip de endereço confirmada', async (_label, trigger) => {
    const address = {
      street: 'Rua Gavião Peixoto',
      country: 'BR',
      coordinates: [-43.1, -22.9] as [number, number],
      label: 'Rua Gavião Peixoto, Niterói',
    };
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    mocks.geocodeAddress.mockResolvedValue({ ok: true, address });

    function Harness() {
      const [query, setQuery] = useState('Rua Gavião Peixoto');
      const [selection, setSelection] = useState<GeoSearchSelection | null>(null);

      return (
        <GeoSearchBar
          query={query}
          selection={selection}
          onEditSelection={() => setSelection(null)}
          onQueryChange={setQuery}
          onSelectNode={vi.fn()}
          onAddressFound={(resolved) => {
            setQuery(resolved.label);
            setSelection({ type: 'address', address: resolved });
          }}
          onAddressError={vi.fn()}
        />
      );
    }

    render(<Harness />);
    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    if (trigger === 'button') fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    else fireEvent.keyDown(input, { key: 'Enter' });

    expect(
      await screen.findByRole('button', { name: 'Editar seleção Rua Gavião Peixoto, Niterói' }),
    ).toBeInTheDocument();
    expect(input).not.toBeInTheDocument();
  });

  it('retira o foco pelo botão e não cria chip quando o endereço falha no mobile', async () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    mocks.geocodeAddress.mockResolvedValue({
      ok: false,
      status: 'ZERO_RESULTS',
      message: 'Nenhum endereço encontrado.',
    });
    const onAddressFound = vi.fn();
    const onAddressError = vi.fn();

    render(
      <GeoSearchBar
        isMobile
        query="Rua inexistente"
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={onAddressFound}
        onAddressError={onAddressError}
      />,
    );

    const input = screen.getByPlaceholderText('Pesquisar local, recurso ou endereço');
    input.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));

    expect(input).not.toHaveFocus();
    await waitFor(() => expect(onAddressError).toHaveBeenCalledTimes(1));
    expect(onAddressFound).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Editar seleção/i })).not.toBeInTheDocument();
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

  it('sem texto nem seleção e com a hierarquia fechada, oferece abrir a hierarquia', () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onToggleHierarchy = vi.fn();

    render(
      <GeoSearchBar
        query=""
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        hierarchyOpen={false}
        onToggleHierarchy={onToggleHierarchy}
      />,
    );

    expect(screen.queryByLabelText('Limpar busca')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Abrir hierarquia'));
    expect(onToggleHierarchy).toHaveBeenCalledTimes(1);
  });

  it('com a hierarquia aberta e sem busca, o X só fecha o painel — não desseleciona', () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onToggleHierarchy = vi.fn();
    const onClear = vi.fn();

    render(
      <GeoSearchBar
        query=""
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onClear={onClear}
        hierarchyOpen
        onToggleHierarchy={onToggleHierarchy}
      />,
    );

    expect(screen.queryByLabelText('Abrir hierarquia')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Fechar hierarquia'));
    expect(onToggleHierarchy).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
  });

  it('com texto e a hierarquia aberta, o X limpa a busca e preserva a hierarquia', () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onQueryChange = vi.fn();
    const onClear = vi.fn();
    const onToggleHierarchy = vi.fn();

    render(
      <GeoSearchBar
        query="Icarai"
        onQueryChange={onQueryChange}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onClear={onClear}
        hierarchyOpen
        onToggleHierarchy={onToggleHierarchy}
      />,
    );

    fireEvent.click(screen.getByLabelText('Limpar busca'));
    expect(onQueryChange).toHaveBeenCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onToggleHierarchy).not.toHaveBeenCalled();
  });

  it('no mobile a marca do Nexus abre o menu principal; no desktop ela não aparece', () => {
    mocks.fetchTreeSearch.mockResolvedValue([]);
    mocks.fetchAddressPredictions.mockResolvedValue([]);
    const onOpenMainMenu = vi.fn();

    const { rerender } = render(
      <GeoSearchBar
        isMobile
        query=""
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onOpenMainMenu={onOpenMainMenu}
      />,
    );

    fireEvent.click(screen.getByLabelText('Abrir menu principal'));
    expect(onOpenMainMenu).toHaveBeenCalledTimes(1);

    rerender(
      <GeoSearchBar
        query=""
        onQueryChange={vi.fn()}
        onSelectNode={vi.fn()}
        onAddressFound={vi.fn()}
        onAddressError={vi.fn()}
        onOpenMainMenu={onOpenMainMenu}
      />,
    );
    expect(screen.queryByLabelText('Abrir menu principal')).not.toBeInTheDocument();
  });
});
