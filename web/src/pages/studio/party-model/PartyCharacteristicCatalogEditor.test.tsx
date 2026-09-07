import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PartyCharacteristicCatalogEditor } from './PartyCharacteristicCatalogEditor';
import * as characteristicApi from '../../../services/partyRoleTypeCharacteristicApi';

vi.mock('../../../services/partyRoleTypeCharacteristicApi', () => ({
  listPartyRoleTypeCharacteristics: vi.fn(),
  createPartyRoleTypeCharacteristic: vi.fn(),
  updatePartyRoleTypeCharacteristic: vi.fn(),
  deactivatePartyRoleTypeCharacteristic: vi.fn(),
}));

describe('PartyCharacteristicCatalogEditor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(characteristicApi.listPartyRoleTypeCharacteristics).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('persiste a descrição e os valores permitidos ao criar uma característica de lista', async () => {
    vi.mocked(characteristicApi.createPartyRoleTypeCharacteristic).mockResolvedValue({
      id: 'characteristic-1',
      tenantId: 'default',
      roleName: 'manufacturer',
      name: 'segmento',
      group: 'Comercial',
      description: 'Segmento de atuação do fornecedor',
      valueType: 'list',
      allowedValues: ['Óptico', 'Elétrico'],
      sortOrder: 100,
      active: true,
      createdAt: '2026-09-07T10:00:00.000Z',
      updatedAt: '2026-09-07T10:00:00.000Z',
    });

    render(<PartyCharacteristicCatalogEditor roleName="manufacturer" canMutate={true} />);

    await waitFor(() => {
      expect(screen.getByText(/nenhuma característica cadastrada/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /adicionar/i }));
    await user.type(screen.getByPlaceholderText('Nome *'), 'segmento');
    await user.type(screen.getByPlaceholderText('Grupo'), 'Comercial');
    await user.type(
      screen.getByPlaceholderText('Descrição'),
      'Segmento de atuação do fornecedor',
    );
    await user.selectOptions(screen.getByRole('combobox'), 'list');
    await user.type(screen.getByPlaceholderText('val1, val2, val3'), 'Óptico, Elétrico');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(characteristicApi.createPartyRoleTypeCharacteristic).toHaveBeenCalledWith(
        'manufacturer',
        {
          name: 'segmento',
          group: 'Comercial',
          description: 'Segmento de atuação do fornecedor',
          valueType: 'list',
          allowedValues: ['Óptico', 'Elétrico'],
        },
      );
    });
  });

  it('persiste a descrição ao editar uma característica existente', async () => {
    vi.mocked(characteristicApi.listPartyRoleTypeCharacteristics).mockResolvedValue([
      {
        id: 'characteristic-1',
        tenantId: 'default',
        roleName: 'manufacturer',
        name: 'segmento',
        group: 'Comercial',
        description: null,
        valueType: 'string',
        allowedValues: null,
        sortOrder: 100,
        active: true,
        createdAt: '2026-09-07T10:00:00.000Z',
        updatedAt: '2026-09-07T10:00:00.000Z',
      },
    ]);
    vi.mocked(characteristicApi.updatePartyRoleTypeCharacteristic).mockResolvedValue({
      id: 'characteristic-1',
      tenantId: 'default',
      roleName: 'manufacturer',
      name: 'segmento',
      group: 'Comercial',
      description: 'Segmento de atuação do fornecedor',
      valueType: 'string',
      allowedValues: null,
      sortOrder: 100,
      active: true,
      createdAt: '2026-09-07T10:00:00.000Z',
      updatedAt: '2026-09-07T10:00:00.000Z',
    });

    render(<PartyCharacteristicCatalogEditor roleName="manufacturer" canMutate={true} />);

    await waitFor(() => {
      expect(screen.getByText('segmento')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Editar segmento' }));
    await user.type(screen.getByPlaceholderText('Descrição'), 'Segmento de atuação do fornecedor');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(characteristicApi.updatePartyRoleTypeCharacteristic).toHaveBeenCalledWith(
        'manufacturer',
        'characteristic-1',
        {
          name: 'segmento',
          group: 'Comercial',
          description: 'Segmento de atuação do fornecedor',
          valueType: 'string',
          allowedValues: null,
        },
      );
    });
  });

  it('bloqueia uma característica de lista sem valores permitidos antes da API', async () => {
    render(<PartyCharacteristicCatalogEditor roleName="manufacturer" canMutate={true} />);

    await waitFor(() => {
      expect(screen.getByText(/nenhuma característica cadastrada/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /adicionar/i }));
    await user.type(screen.getByPlaceholderText('Nome *'), 'segmento');
    await user.selectOptions(screen.getByRole('combobox'), 'list');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(
      screen.getByText('Características do tipo Lista exigem ao menos um valor permitido.'),
    ).toBeInTheDocument();
    expect(characteristicApi.createPartyRoleTypeCharacteristic).not.toHaveBeenCalled();
  });
});
