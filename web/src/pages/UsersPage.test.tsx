import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UsersPage from './UsersPage';
import type { AdminUser } from '../services/authApi';

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  resetUserPassword: vi.fn(),
  setUserRoles: vi.fn(),
  setUserStatus: vi.fn(),
}));

vi.mock('../services/authApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/authApi')>();
  return {
    ...actual,
    listUsers: mocks.listUsers,
    createUser: mocks.createUser,
    deleteUser: mocks.deleteUser,
    resetUserPassword: mocks.resetUserPassword,
    setUserRoles: mocks.setUserRoles,
    setUserStatus: mocks.setUserStatus,
  };
});

const user: AdminUser = {
  id: 'usr-1',
  externalId: 'ana@vtal.com',
  name: 'Ana Souza',
  email: 'ana@vtal.com',
  roles: ['inventory.reader'],
  tenantId: 'default',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listUsers.mockResolvedValue([user]);
  mocks.resetUserPassword.mockResolvedValue(user);
});

const openResetDialog = async () => {
  render(<UsersPage />);
  await screen.findByText('Ana Souza');
  await userEvent.click(screen.getByRole('button', { name: 'Redefinir senha de Ana Souza' }));
  return screen.getByRole('dialog');
};

describe('UsersPage — redefinir senha', () => {
  it('abre o modal do produto ao clicar na chave (sem window.prompt)', async () => {
    const dialog = await openResetDialog();
    expect(within(dialog).getByRole('heading', { name: 'Redefinir senha' })).toBeInTheDocument();
    expect(within(dialog).getByText(/ana@vtal\.com/)).toBeInTheDocument();
  });

  it('mantém o botão de confirmar desabilitado até senha válida e confirmação igual', async () => {
    const dialog = await openResetDialog();
    const submit = within(dialog).getByRole('button', { name: /Redefinir senha/ });
    expect(submit).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText('Nova senha'), 'Senha1234567!');
    expect(submit).toBeDisabled(); // ainda falta a confirmação

    await userEvent.type(within(dialog).getByLabelText('Confirmar senha'), 'Senha1234567!');
    expect(submit).toBeEnabled();
  });

  it('chama resetUserPassword com o id e a senha ao confirmar', async () => {
    const dialog = await openResetDialog();
    await userEvent.type(within(dialog).getByLabelText('Nova senha'), 'Senha1234567!');
    await userEvent.type(within(dialog).getByLabelText('Confirmar senha'), 'Senha1234567!');
    await userEvent.click(within(dialog).getByRole('button', { name: /Redefinir senha/ }));

    await waitFor(() =>
      expect(mocks.resetUserPassword).toHaveBeenCalledWith('usr-1', 'Senha1234567!'),
    );
  });

  it('fecha ao pressionar Esc', async () => {
    await openResetDialog();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
