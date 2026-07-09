import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ResearchPage } from './ResearchPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

if (!HTMLElement.prototype.scrollTo) {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: vi.fn(),
    writable: true,
  });
}

test('ResearchPage renders confirmation action and appends the commit result', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/v1/research/sessions/session-1' && (!init || init.method === undefined || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          '@type': 'ResearchSession',
          id: 'session-1',
          href: '/v1/research/sessions/session-1',
          userId: 'user-1',
          title: 'Cadastro ONT',
          status: 'active',
          createdAt: '2026-07-09T12:00:00.000Z',
          updatedAt: '2026-07-09T12:00:00.000Z',
          messages: [
            {
              '@type': 'ResearchMessage',
              id: 'assistant-1',
              researchSessionId: 'session-1',
              role: 'assistant',
              content: 'Cadastro preparado. Clique em Confirmar cadastro para concluir.',
              createdAt: '2026-07-09T12:00:01.000Z',
              metadata: {
                pendingConfirmation: {
                  confirmationToken: 'token-123',
                  summary: 'Modelo F6201BV9.3.12 da ZTE sera criado no catalogo.',
                  domain: 'resource',
                  operation: 'create_equipment_model',
                },
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (url === '/v1/research/sessions/session-1/confirmations') {
      return new Response(
        JSON.stringify({
          assistantMessage: {
            id: 'assistant-2',
            role: 'assistant',
            content: 'Modelo F6201BV9.3.12 da ZTE cadastrado com sucesso.',
            createdAt: '2026-07-09T12:00:02.000Z',
            metadata: {
              confirmation: {
                ok: true,
                domain: 'resource',
                operation: 'create_equipment_model',
                confirmationToken: 'token-123',
                summary: 'Modelo F6201BV9.3.12 da ZTE sera criado no catalogo.',
              },
            },
          },
          confirmation: {
            ok: true,
            domain: 'resource',
            operation: 'create_equipment_model',
            shouldRefreshResourceCatalog: true,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  const user = userEvent.setup();
  render(<ResearchPage sessionId="session-1" />);

  expect(await screen.findByText(/Cadastro preparado/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar cadastro' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Confirmar cadastro' }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/research/sessions/session-1/confirmations',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  expect(await screen.findByText(/cadastrado com sucesso/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmar cadastro' })).not.toBeInTheDocument());
});

test('ResearchPage mostra todos os itens quando a confirmacao e em lote', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/v1/research/sessions/session-batch' && (!init || init.method === undefined || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          '@type': 'ResearchSession',
          id: 'session-batch',
          href: '/v1/research/sessions/session-batch',
          userId: 'user-1',
          title: 'Cadastro em lote',
          status: 'active',
          createdAt: '2026-07-09T12:00:00.000Z',
          updatedAt: '2026-07-09T12:00:00.000Z',
          messages: [
            {
              '@type': 'ResearchMessage',
              id: 'assistant-batch-1',
              researchSessionId: 'session-batch',
              role: 'assistant',
              content: 'Cadastro preparado. Revise os 3 itens abaixo e confirme para concluir.',
              createdAt: '2026-07-09T12:00:01.000Z',
              metadata: {
                pendingConfirmation: {
                  confirmationToken: 'token-batch',
                  summary: '3 modelos de ONT da NOKIA serao criados no catalogo.',
                  domain: 'resource',
                  operation: 'create_equipment_models',
                  items: [
                    { model: 'G-010G-Q', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                    { model: 'G-0425G-C', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                    { model: 'G-140W-H', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                  ],
                },
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (url === '/v1/research/sessions/session-batch/confirmations') {
      return new Response(
        JSON.stringify({
          assistantMessage: {
            id: 'assistant-batch-2',
            role: 'assistant',
            content: '3 modelos de ONT da NOKIA cadastrados com sucesso.',
            createdAt: '2026-07-09T12:00:02.000Z',
            metadata: {
              confirmation: {
                ok: true,
                domain: 'resource',
                operation: 'create_equipment_models',
                confirmationToken: 'token-batch',
                summary: '3 modelos de ONT da NOKIA serao criados no catalogo.',
                items: [
                  { model: 'G-010G-Q', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                  { model: 'G-0425G-C', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                  { model: 'G-140W-H', manufacturerName: 'NOKIA', equipmentType: 'ONT' },
                ],
              },
            },
          },
          confirmation: {
            ok: true,
            domain: 'resource',
            operation: 'create_equipment_models',
            shouldRefreshResourceCatalog: true,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  const user = userEvent.setup();
  render(<ResearchPage sessionId="session-batch" />);

  expect(await screen.findByText(/Cadastro preparado/i)).toBeInTheDocument();
  expect(screen.getByText(/G-010G-Q NOKIA ONT/)).toBeInTheDocument();
  expect(screen.getByText(/G-0425G-C NOKIA ONT/)).toBeInTheDocument();
  expect(screen.getByText(/G-140W-H NOKIA ONT/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar cadastro' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Confirmar cadastro' }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/research/sessions/session-batch/confirmations',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  expect(await screen.findByText(/cadastrados com sucesso/i)).toBeInTheDocument();
});
