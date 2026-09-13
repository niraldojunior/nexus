import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigurationPage } from './ConfigurationPage';

vi.mock('./config-tabs/UsersTab', () => ({
  UsersTab: () => <div data-testid="tab-users">Usuários tab</div>,
}));
vi.mock('./config-tabs/EnvironmentTab', () => ({
  EnvironmentTab: () => <div data-testid="tab-environment">Ambiente tab</div>,
}));
vi.mock('./config-tabs/EventsTab', () => ({
  EventsTab: () => <div data-testid="tab-events">Eventos tab</div>,
}));

describe('ConfigurationPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('mostra apenas as abas Usuários, Ambiente e Eventos', () => {
    render(<ConfigurationPage />);

    expect(screen.getByRole('button', { name: 'Usuários' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ambiente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eventos' })).toBeInTheDocument();
  });

  it('não mostra mais as abas Projetos, Fornecedores e Serviços', () => {
    render(<ConfigurationPage />);

    expect(screen.queryByRole('button', { name: 'Projetos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fornecedores' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Serviços' })).not.toBeInTheDocument();
  });

  it('abre em Usuários por padrão', () => {
    render(<ConfigurationPage />);

    expect(screen.getByTestId('tab-users')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-environment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-events')).not.toBeInTheDocument();
  });

  it('navega para Ambiente e Eventos ao clicar nas abas', async () => {
    const user = userEvent.setup();
    render(<ConfigurationPage />);

    await user.click(screen.getByRole('button', { name: 'Ambiente' }));
    expect(screen.getByTestId('tab-environment')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-users')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Eventos' }));
    expect(screen.getByTestId('tab-events')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-environment')).not.toBeInTheDocument();
  });
});
