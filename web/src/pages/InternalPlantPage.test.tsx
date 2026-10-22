import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import InternalPlantPage from './InternalPlantPage';

const fetchResources = vi.fn();

vi.mock('../services/internalPlantApi', () => ({
  fetchInternalPlantRoots: async () => [
    { id: 'country:BR', kind: 'country', label: 'Brasil', hasChildren: true },
  ],
  fetchInternalPlantChildren: async () => ({
    nodeId: 'country:BR',
    nodes: [],
    total: 0,
    limit: 25,
    offset: 0,
  }),
  fetchInternalPlantResources: (...args: unknown[]) => fetchResources(...args),
  fetchInternalPlantSiteContext: async (id: string) => ({
    site: {
      id,
      name: id === 'site-long' ? '014B - SMP-014B-R PRESIDENTE KENED-CENTRO-FJO' : 'Sala Técnica',
      specificationName: id === 'site-long' ? 'Edifício' : 'Sala Técnica',
      visualIdentity: { kind: 'system', iconCode: 'ROOM' },
    },
    hierarchy: [
      { id: 'building-1', name: 'Prédio A', specificationName: 'Prédio' },
      { id: 'floor-1', name: 'Pavimento 3', specificationName: 'Pavimento' },
      { id: 'site-1', name: 'Sala Técnica', specificationName: 'Sala Técnica' },
    ],
    address: {
      streetType: 'Rua',
      streetName: 'Cinco de Julho',
      streetNr: '237',
      city: 'Niterói',
      stateOrProvince: 'RJ',
    },
    coordinates: [-43.1035, -22.9035],
  }),
}));

vi.mock('../hooks/useSession', () => ({
  useSession: () => ({
    authenticated: true,
    admin: false,
    canEdit: true,
    canViewStudio: false,
    canEditStudio: false,
    canAdminStudio: false,
    canViewOrder: false,
    user: null,
  }),
}));

vi.mock('../services/resourceCatalogApi', () => ({
  listResourceCatalogs: async () => [],
  getResourceCatalogTree: async () => [],
}));

vi.mock('../components/ResourceIcon', () => ({ ResourceIcon: () => <span /> }));

vi.mock('./internal-plant/TypeTree', () => ({
  TypeTree: ({ onSelect }: { onSelect: (selection: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          key: 'type:olt',
          label: 'OLT',
          resourceTypeIds: ['t1'],
          resourceTypeCode: 'OLT',
          leafResourceTypeId: 't1',
        })
      }
    >
      Selecionar tipo OLT
    </button>
  ),
}));

vi.mock('./internal-plant/LocationTree', () => ({
  LocationTree: ({ onSelectSite }: { onSelectSite: (node: unknown) => void }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onSelectSite({
            id: 'site:site-1',
            kind: 'site',
            label: 'Rótulo da árvore',
            refId: 'site-1',
            hasChildren: false,
          })
        }
      >
        Selecionar Sala Técnica
      </button>
      <button
        type="button"
        onClick={() =>
          onSelectSite({
            id: 'site:site-long',
            kind: 'site',
            label: '014B - SMP-014B-R PRESIDENTE KENED-CENTRO-FJO',
            refId: 'site-long',
            hasChildren: false,
          })
        }
      >
        Selecionar Site Longo
      </button>
    </>
  ),
  invalidateInternalPlantRoots: vi.fn(),
}));

const row = {
  id: 'r1',
  '@type': 'PhysicalResource',
  name: 'OLT-01',
  status: 'active',
  resourceType: { id: 't1', code: 'OLT', name: 'OLT' },
  resourceSpecification: {
    id: 's1',
    name: 'Huawei MA5800',
    manufacturer: { id: 'm1', name: 'Huawei' },
  },
  stateOrProvince: 'RJ',
  city: 'Niterói',
};

afterEach(cleanup);

beforeEach(() => {
  fetchResources.mockReset();
  fetchResources.mockResolvedValue({ items: [row], total: 1, limit: 25, offset: 0 });
});

test('estado inicial não mostra tabela nem consulta recursos', () => {
  render(<InternalPlantPage />);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(fetchResources).not.toHaveBeenCalled();
  expect(screen.getByRole('tab', { name: 'Locais' })).toHaveAttribute('aria-selected', 'true');
});

test('busca com menos de 3 caracteres não consulta', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);
  await user.type(screen.getByRole('searchbox', { name: 'Pesquisar recursos' }), 'ol{Enter}');
  expect(fetchResources).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('busca confirmada lista as colunas esperadas', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);
  await user.type(screen.getByRole('searchbox', { name: 'Pesquisar recursos' }), 'olt{Enter}');
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  expect(fetchResources.mock.calls[0]?.[0]).toEqual({ q: 'olt' });
  for (const header of ['Nome', 'Tipo', 'Especificação', 'Fabricante', 'Status', 'UF', 'Cidade']) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
  }
  expect(screen.getByText('Huawei')).toBeInTheDocument();
  expect(screen.getByText('Ativo')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Paginação superior' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Paginação inferior' })).toBeInTheDocument();
});

test('busca confirmada mostra UF e Cidade ao final da tabela', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);

  await user.type(screen.getByRole('searchbox', { name: 'Pesquisar recursos' }), 'olt{Enter}');
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

  expect(screen.getByRole('columnheader', { name: 'UF' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Cidade' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'RJ' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Niterói' })).toBeInTheDocument();
});

test('tipo de recurso selecionado mostra UF e Cidade ao final da tabela', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);

  await user.click(screen.getByRole('tab', { name: 'Recursos' }));
  await user.click(screen.getByRole('button', { name: 'Selecionar tipo OLT' }));
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

  expect(screen.getByRole('columnheader', { name: 'UF' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Cidade' })).toBeInTheDocument();
});

test('site selecionado não repete UF e Cidade na tabela', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);

  await user.click(screen.getByRole('button', { name: 'Selecionar Sala Técnica' }));
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

  expect(screen.queryByRole('columnheader', { name: 'UF' })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Cidade' })).not.toBeInTheDocument();
});

test('site selecionado mostra tipo no título, nomes na hierarquia e endereço', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);

  await user.click(screen.getByRole('button', { name: 'Selecionar Sala Técnica' }));

  const titleSpan = await screen.findByText('[Sala Técnica] Sala Técnica');
  expect(titleSpan).toBeInTheDocument();
  expect(titleSpan).toHaveClass('truncate', 'min-w-0');
  expect(titleSpan).toHaveAttribute('title', '[Sala Técnica] Sala Técnica');
  await waitFor(() => expect(screen.queryByText(/^Tipo:/)).not.toBeInTheDocument());
  expect(screen.getByText(/^Hierarquia:/)).toHaveTextContent(
    'Hierarquia: Prédio A → Pavimento 3 → Sala Técnica',
  );
  expect(screen.getByText(/^Endereço:/)).toHaveTextContent(
    'Endereço: Rua, Cinco de Julho, nº 237, Niterói, RJ [-22.90350, -43.10350]',
  );
  await waitFor(() =>
    expect(fetchResources).toHaveBeenCalledWith(
      { siteId: 'site-1' },
      expect.objectContaining({ limit: 25, offset: 0 }),
      expect.anything(),
    ),
  );
});

test('botão novo recurso fica acima da tabela junto à paginação superior', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);

  await user.click(screen.getByRole('button', { name: 'Selecionar Sala Técnica' }));

  const button = await screen.findByRole('button', { name: 'Novo recurso' });
  expect(button).toBeInTheDocument();
  expect(button).toHaveClass('h-6', 'w-6');
  const pagination = screen.getByRole('navigation', { name: 'Paginação superior' });
  expect(pagination.parentElement).toContainElement(button);
});

test('site selecionado exibe botões de editar e remover local no cabeçalho', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);

  await user.click(screen.getByRole('button', { name: 'Selecionar Sala Técnica' }));

  expect(await screen.findByRole('button', { name: 'Editar local' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remover local' })).toBeInTheDocument();
});

test('erro mostra retry', async () => {
  fetchResources.mockRejectedValueOnce(new Error('falhou'));
  const user = userEvent.setup();
  render(<InternalPlantPage />);
  await user.type(screen.getByRole('searchbox', { name: 'Pesquisar recursos' }), 'olt{Enter}');
  await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
});

test('site com nome extenso trunca o título e define title para tooltip sem criar overflow horizontal', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);

  await user.click(screen.getByRole('button', { name: 'Selecionar Site Longo' }));

  const expectedTitle = '[Edifício] 014B - SMP-014B-R PRESIDENTE KENED-CENTRO-FJO';
  const titleSpan = await screen.findByText(expectedTitle);
  expect(titleSpan).toBeInTheDocument();
  expect(titleSpan).toHaveClass('truncate', 'min-w-0');
  expect(titleSpan).toHaveAttribute('title', expectedTitle);

  // O container do cabeçalho possui min-w-0 e flex-1 garantindo contenção de largura
  const heading = screen.getByRole('heading', { level: 1 });
  expect(heading).toHaveClass('truncate', 'min-w-0');
  expect(heading.parentElement).toHaveClass('min-w-0');
});
