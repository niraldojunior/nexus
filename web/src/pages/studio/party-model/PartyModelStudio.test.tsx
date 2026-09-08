import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PartyModelStudio } from './PartyModelStudio';
import * as partyRoleTypeApi from '../../../services/partyRoleTypeApi';

vi.mock('../../../services/partyRoleTypeApi', () => ({
  listPartyRoleTypes: vi.fn(),
  createPartyRoleType: vi.fn(),
  updatePartyRoleType: vi.fn(),
  deactivatePartyRoleType: vi.fn(),
}));
vi.mock('./PartyCharacteristicCatalogEditor', () => ({ PartyCharacteristicCatalogEditor: () => null }));
vi.mock('./SupplierRecordsTab', () => ({ SupplierRecordsTab: () => null }));

afterEach(() => cleanup());

const supplier = {
  id: 'type-1', tenantId: 'default', key: 'supplier', roleName: 'manufacturer', label: 'Fornecedores', description: 'Equipamentos', active: true, createdAt: '', updatedAt: '',
};

describe('PartyModelStudio', () => {
  it('shows only the party type name in the list and creates types from the plus button', async () => {
    vi.mocked(partyRoleTypeApi.listPartyRoleTypes).mockResolvedValue([supplier]);
    vi.mocked(partyRoleTypeApi.createPartyRoleType).mockResolvedValue({ ...supplier, id: 'type-2', key: 'partner', roleName: 'partner', label: 'Parceiros' });
    render(<PartyModelStudio canEdit={true} canAdmin={true} />);
    await waitFor(() => expect(screen.getAllByText('Fornecedores')).toHaveLength(2));
    expect(screen.queryByText('manufacturer')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Novo tipo de parte' }));
    await user.type(screen.getByLabelText('Título'), 'Parceiros');
    await user.type(screen.getByLabelText('Papel (roleName)'), 'partner');
    await user.type(screen.getByLabelText('Chave'), 'partner');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(partyRoleTypeApi.createPartyRoleType).toHaveBeenCalledWith(expect.objectContaining({ label: 'Parceiros', roleName: 'partner', key: 'partner' })));
  });
});
