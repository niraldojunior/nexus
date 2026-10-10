import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { LocationTree } from './LocationTree';

const fetchChildren = vi.fn();
const fetchRoots = vi.fn(async () => [
  { id: 'country:BR', kind: 'country', label: 'Brasil', hasChildren: true, parentId: null },
  { id: 'uf:BR|RJ', kind: 'uf', label: 'RJ', hasChildren: true, parentId: 'country:BR' },
  { id: 'city:c1', kind: 'city', label: 'Niterói', hasChildren: true, parentId: 'uf:BR|RJ' },
]);

vi.mock('../../services/internalPlantApi', () => ({
  fetchInternalPlantRoots: () => fetchRoots(),
  fetchInternalPlantChildren: (...args: unknown[]) => fetchChildren(...args),
}));

afterEach(cleanup);

test('município → tipo com volume → site com + independente da seleção', async () => {
  fetchChildren.mockImplementation(async (nodeId: string) => {
    if (nodeId === 'city:c1') {
      return {
        nodeId,
        total: 1,
        limit: 50,
        offset: 0,
        nodes: [
          {
            id: 'site-type:c1|t1',
            kind: 'site-type',
            label: 'Central',
            hasChildren: true,
            childCount: 1234,
          },
        ],
      };
    }
    if (nodeId === 'site-type:c1|t1') {
      return {
        nodeId,
        total: 1,
        limit: 50,
        offset: 0,
        nodes: [
          {
            id: 'site:s1',
            kind: 'site',
            label: 'CO Icaraí',
            refId: 's1',
            hasChildren: true,
            childCount: 2,
          },
        ],
      };
    }
    return { nodeId, total: 0, limit: 50, offset: 0, nodes: [] };
  });
  const onSelectSite = vi.fn();
  const user = userEvent.setup();
  render(<LocationTree onSelectSite={onSelectSite} />);

  // Brasil já vem aberto: as UFs aparecem sem clique.
  await user.click(await screen.findByRole('button', { name: 'Expandir RJ' }));
  expect(fetchChildren).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Expandir Niterói' }));
  expect(await screen.findByText(/Central \(1\.234\)/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Expandir Central' }));
  await waitFor(() => expect(screen.getByText('CO Icaraí')).toBeTruthy());

  await user.click(screen.getByRole('button', { name: 'Expandir CO Icaraí' }));
  expect(onSelectSite).not.toHaveBeenCalled();
  await user.click(screen.getByText('CO Icaraí'));
  expect(onSelectSite).toHaveBeenCalledTimes(1);
});

const expandToCity = async (user: ReturnType<typeof userEvent.setup>) => {
  // Brasil já vem aberto: as UFs aparecem sem clique.
  await user.click(await screen.findByRole('button', { name: 'Expandir RJ' }));
  await user.click(screen.getByRole('button', { name: 'Expandir Niterói' }));
};

const typePage = (id: string, label: string, total: number, offset: number) => ({
  nodeId: 'city:c1',
  total,
  limit: 50,
  offset,
  nodes: [{ id, kind: 'site-type', label, hasChildren: true, childCount: 1 }],
});

test('erro na expansão mostra retry e recarrega o mesmo nível', async () => {
  fetchChildren.mockReset();
  fetchChildren
    .mockRejectedValueOnce(new Error('Falha de rede'))
    .mockResolvedValueOnce(typePage('site-type:c1|t1', 'Central', 1, 0));
  const user = userEvent.setup();
  render(<LocationTree onSelectSite={vi.fn()} />);

  await expandToCity(user);
  expect(await screen.findByText(/Falha de rede/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText(/Central/)).toBeTruthy();
  expect(screen.queryByText(/Falha de rede/)).toBeNull();
});

test('paginação: "Carregar mais" anexa a próxima página sem repetir a primeira', async () => {
  fetchChildren.mockReset();
  fetchChildren.mockImplementation(async (_id: string, opts: { offset: number }) =>
    opts.offset === 0
      ? typePage('site-type:c1|t1', 'Central', 2, 0)
      : typePage('site-type:c1|t2', 'Rack', 2, 50),
  );
  const user = userEvent.setup();
  render(<LocationTree onSelectSite={vi.fn()} />);

  await expandToCity(user);
  await user.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  expect(await screen.findByText(/Rack/)).toBeTruthy();
  expect(screen.getByText(/Central/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  expect(fetchChildren).toHaveBeenCalledTimes(2);
});

test('diretório: requisição única compartilhada e retry quando falha', async () => {
  vi.resetModules();
  fetchRoots.mockClear();
  fetchRoots.mockRejectedValueOnce(new Error('Diretório indisponível'));
  const { LocationTree: Fresh } = await import('./LocationTree');
  const user = userEvent.setup();
  render(
    <>
      <Fresh onSelectSite={vi.fn()} />
      <Fresh onSelectSite={vi.fn()} />
    </>,
  );

  expect((await screen.findAllByText(/Diretório indisponível/)).length).toBe(2);
  expect(fetchRoots).toHaveBeenCalledTimes(1);
  await user.click(screen.getAllByRole('button', { name: 'Tentar novamente' })[0]!);
  expect(
    (await screen.findAllByRole('button', { name: 'Recolher Brasil' })).length,
  ).toBeGreaterThan(0);
  expect(fetchRoots).toHaveBeenCalledTimes(2);
});
