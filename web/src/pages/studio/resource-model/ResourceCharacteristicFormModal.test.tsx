import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceCharacteristicFormModal } from './ResourceCharacteristicFormModal';
import type { ResourceCharacteristicRow } from '../../../utils/resourceCharacteristicsForm';

vi.mock('../../../services/studioReferenceDataApi', () => ({
  listReferenceDataSets: vi.fn().mockResolvedValue([]),
}));

describe('ResourceCharacteristicFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('defaults characteristicLevel to specification for a new characteristic', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ResourceCharacteristicFormModal
        isOpen={true}
        onClose={vi.fn()}
        editingRow={null}
        existingNames={[]}
        onSave={onSave}
      />,
    );

    const nameInput = screen.getByPlaceholderText('Ex.: capacidade_portas');
    await user.type(nameInput, 'capacidade');

    const submitButton = screen.getByRole('button', { name: 'Criar característica' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'capacidade',
          characteristicLevel: 'specification',
        }),
      );
    });
  });

  it('allows switching characteristicLevel to instance and saves it (issue #273)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ResourceCharacteristicFormModal
        isOpen={true}
        onClose={vi.fn()}
        editingRow={null}
        existingNames={[]}
        onSave={onSave}
      />,
    );

    const nameInput = screen.getByPlaceholderText('Ex.: capacidade_portas');
    await user.type(nameInput, 'mac_address');

    // Clica no botão Instância
    const instanceButton = screen.getByRole('button', { name: /Instância/ });
    await user.click(instanceButton);

    expect(
      screen.getByText('Cada recurso preenche o seu valor. O valor padrão abaixo é só a sugestão inicial.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Valor padrão sugerido')).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: 'Criar característica' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'mac_address',
          characteristicLevel: 'instance',
        }),
      );
    });
  });

  it('disables level buttons and inputs when readOnly is true', () => {
    const editingRow: ResourceCharacteristicRow = {
      key: 'row-1',
      name: 'serial_num',
      description: 'Número de série',
      valueType: 'string',
      characteristicLevel: 'instance',
      valueText: '',
    };

    render(
      <ResourceCharacteristicFormModal
        isOpen={true}
        onClose={vi.fn()}
        editingRow={editingRow}
        readOnly={true}
        existingNames={[]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Detalhes da característica')).toBeInTheDocument();
    expect(screen.getByDisplayValue('serial_num')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Especificação/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Instância/ })).toBeDisabled();
  });
});
