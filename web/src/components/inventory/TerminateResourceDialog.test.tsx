import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminateResourceDialog } from './TerminateResourceDialog';

const terminate = vi.fn();

vi.mock('../../services/internalPlantApi', () => {
  class InternalPlantApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code?: string,
    ) {
      super(message);
    }
  }
  return {
    InternalPlantApiError,
    terminateInternalPlantResource: (...args: unknown[]) => terminate(...args),
  };
});

function setup() {
  const onClose = vi.fn();
  const onTerminated = vi.fn();
  render(
    <TerminateResourceDialog
      resource={{ id: 'r1', name: 'CTO 1' }}
      onClose={onClose}
      onTerminated={onTerminated}
    />,
  );
  return { onClose, onTerminated };
}

describe('TerminateResourceDialog', () => {
  afterEach(cleanup);
  beforeEach(() => {
    terminate.mockReset();
  });

  it('encerra o recurso e notifica o pai', async () => {
    terminate.mockResolvedValue(undefined);
    const { onTerminated } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(onTerminated).toHaveBeenCalled());
    expect(terminate).toHaveBeenCalledWith('r1', { cascade: false });
  });

  it('mostra o erro e não notifica o pai quando falha', async () => {
    terminate.mockImplementation(() => Promise.reject(new Error('Recurso em uso.')));
    const { onTerminated } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Recurso em uso.');
    expect(onTerminated).not.toHaveBeenCalled();
  });

  it('com componentes internos pergunta de novo e encerra em cascata', async () => {
    const { InternalPlantApiError } = await import('../../services/internalPlantApi');
    terminate
      .mockRejectedValueOnce(
        new InternalPlantApiError('x', 409, 'RESOURCE_HAS_ACTIVE_DEPENDENCIES'),
      )
      .mockResolvedValueOnce(undefined);
    const { onTerminated } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect(await screen.findByText(/possui componentes internos/)).toBeTruthy();
    expect(onTerminated).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(onTerminated).toHaveBeenCalled());
    expect(terminate).toHaveBeenLastCalledWith('r1', { cascade: true });
  });

  it('Cancelar fecha sem chamar a API', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
  });
});
