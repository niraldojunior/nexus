import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveSiteDialog } from './RemoveSiteDialog';

const fetchSiteReferences = vi.fn();
const retireSite = vi.fn();

vi.mock('../../services/siteEditorApi', () => {
  class SiteEditorApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    SiteEditorApiError,
    fetchSiteReferences: (...args: unknown[]) => fetchSiteReferences(...args),
    retireSite: (...args: unknown[]) => retireSite(...args),
  };
});

const refs = (over: Record<string, unknown> = {}) => ({
  siteId: 's1',
  activeChildSiteCount: 0,
  activeRelationshipCount: 0,
  activeResourceCount: 0,
  activeServiceCount: 0,
  activeOrderCount: 0,
  blocking: false,
  ...over,
});

function setup() {
  const onClose = vi.fn();
  const onRemoved = vi.fn();
  render(
    <RemoveSiteDialog
      site={{ id: 's1', name: 'Sala 1' }}
      statusReason="Removido pela Planta Externa"
      onClose={onClose}
      onRemoved={onRemoved}
    />,
  );
  return { onClose, onRemoved };
}

describe('RemoveSiteDialog', () => {
  afterEach(cleanup);
  beforeEach(() => {
    fetchSiteReferences.mockReset();
    retireSite.mockReset();
  });

  it('lista bloqueios e oferece apenas Fechar', async () => {
    fetchSiteReferences.mockResolvedValue(refs({ blocking: true, activeResourceCount: 3 }));
    setup();
    expect(await screen.findByText('3 recursos ativos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
  });

  it('remove e notifica o pai', async () => {
    fetchSiteReferences.mockResolvedValue(refs());
    retireSite.mockResolvedValue({});
    const { onRemoved } = setup();
    const button = await screen.findByRole('button', { name: 'Remover' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(retireSite).toHaveBeenCalledWith('s1', 'Removido pela Planta Externa');
  });

  it('mostra mensagem de 409 e mantém o local', async () => {
    const { SiteEditorApiError } = await import('../../services/siteEditorApi');
    fetchSiteReferences.mockResolvedValue(refs());
    retireSite.mockRejectedValue(new SiteEditorApiError('Há dependências.', 409));
    const { onRemoved } = setup();
    const button = await screen.findByRole('button', { name: 'Remover' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Há dependências. O local foi mantido.',
    );
    expect(onRemoved).not.toHaveBeenCalled();
  });
});
