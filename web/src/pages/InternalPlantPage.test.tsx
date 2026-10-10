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
}));

vi.mock('../services/resourceCatalogApi', () => ({
  listResourceCatalogs: async () => [],
  getResourceCatalogTree: async () => [],
}));

vi.mock('../components/ResourceIcon', () => ({ ResourceIcon: () => <span /> }));

const row = {
  id: 'r1',
  '@type': 'PhysicalResource',
  name: 'OLT-01',
  status: 'active',
  resourceType: { id: 't1', code: 'OLT', name: 'OLT' },
  resourceSpecification: { id: 's1', name: 'Huawei MA5800' },
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
  await user.type(screen.getByRole('searchbox'), 'ol{Enter}');
  expect(fetchResources).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('busca confirmada lista as colunas esperadas', async () => {
  const user = userEvent.setup();
  render(<InternalPlantPage />);
  await user.type(screen.getByRole('searchbox'), 'olt{Enter}');
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  expect(fetchResources.mock.calls[0]?.[0]).toEqual({ q: 'olt' });
  for (const header of ['Nome', 'Tipo', 'Especificação', 'Status', 'UF', 'Município']) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
  }
  expect(screen.getByText('Niterói')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Ativo' })).toHaveAttribute('title', 'Ativo');
  expect(screen.getAllByRole('navigation', { name: 'Paginação' })).toHaveLength(2);
});

test('erro mostra retry', async () => {
  fetchResources.mockRejectedValueOnce(new Error('falhou'));
  const user = userEvent.setup();
  render(<InternalPlantPage />);
  await user.type(screen.getByRole('searchbox'), 'olt{Enter}');
  await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
});
