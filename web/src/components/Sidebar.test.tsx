import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import Sidebar from './Sidebar';

vi.mock('../pages/ResearchHistoryPage', () => ({
  ResearchHistoryPage: () => <div />,
}));

afterEach(() => {
  cleanup();
});

const renderSidebar = (overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) => {
  const props: Parameters<typeof Sidebar>[0] = {
    collapsed: false,
    currentPage: 'service',
    activeRecentConversationId: null,
    activeResearchSessionId: null,
    activeServiceCategory: 'Access',
    serviceMenuOpen: false,
    settingsOpen: false,
    recentItems: [],
    recentGroup: 'none',
    onGroupChange: vi.fn(),
    onToggleCollapse: vi.fn(),
    onNewConversation: vi.fn(),
    onNewResearch: vi.fn(),
    onSelectPage: vi.fn(),
    onToggleServiceMenu: vi.fn(),
    onSelectServiceCategory: vi.fn(),
    onOpenRecentItem: vi.fn(),
    canViewOrder: true,
    ...overrides,
  };

  render(<Sidebar {...props} />);
  return props;
};

test('shows flat category submenu when expanded, without group headers', () => {
  renderSidebar({ serviceMenuOpen: true });

  // Category items
  expect(screen.getByRole('button', { name: 'Acesso' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Conectividade Empresarial' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Voz' })).toBeInTheDocument();
});

test('service menu toggles submenu and category items select the matching category', async () => {
  const user = userEvent.setup();
  const onToggleServiceMenu = vi.fn();
  const onSelectServiceCategory = vi.fn();

  renderSidebar({ onToggleServiceMenu, onSelectServiceCategory });

  expect(screen.queryByRole('button', { name: 'Acesso' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Serviços' }));
  expect(onToggleServiceMenu).toHaveBeenCalledTimes(1);

  cleanup();
  renderSidebar({
    serviceMenuOpen: true,
    onToggleServiceMenu,
    onSelectServiceCategory,
  });

  await user.click(screen.getByRole('button', { name: 'Acesso' }));
  await user.click(screen.getByRole('button', { name: 'Voz' }));

  expect(onSelectServiceCategory).toHaveBeenNthCalledWith(1, 'Access');
  expect(onSelectServiceCategory).toHaveBeenNthCalledWith(2, 'Voice');
});

test('service submenu is hidden when collapsed', () => {
  renderSidebar({ collapsed: true, serviceMenuOpen: true });

  expect(screen.queryByRole('button', { name: 'Acesso' })).not.toBeInTheDocument();
});

test('primary navigation remains clickable when collapsed', async () => {
  const user = userEvent.setup();
  const onSelectPage = vi.fn();
  const onToggleServiceMenu = vi.fn();

  renderSidebar({
    collapsed: true,
    onSelectPage,
    onToggleServiceMenu,
  });

  await user.click(screen.getByRole('button', { name: 'Recursos' }));
  await user.click(screen.getByRole('button', { name: 'Serviços' }));

  expect(onSelectPage).toHaveBeenCalledWith('geo');
  expect(onToggleServiceMenu).toHaveBeenCalledTimes(1);
});

test('shows Studio only to authorized users', () => {
  renderSidebar({ canViewStudio: true });
  expect(screen.getByRole('button', { name: 'Studio' })).toBeInTheDocument();

  cleanup();
  renderSidebar({ canViewStudio: false });
  expect(screen.queryByRole('button', { name: 'Studio' })).not.toBeInTheDocument();
});

test('hides Serviços and Ordens from users without an order role', () => {
  renderSidebar({ canViewOrder: false });
  expect(screen.queryByRole('button', { name: 'Serviços' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ordens' })).not.toBeInTheDocument();

  cleanup();
  renderSidebar({ canViewOrder: true });
  expect(screen.getByRole('button', { name: 'Serviços' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ordens' })).toBeInTheDocument();
});

test('mobile floating toggle appears by default when collapsed and shows the Nexus mark', () => {
  renderSidebar({ isMobile: true, collapsed: true });

  const toggle = screen.getByRole('button', { name: 'Abrir barra lateral' });
  expect(toggle).toBeInTheDocument();
  expect(toggle.querySelector('svg')).toBeInTheDocument();
});

test('mobile floating toggle is suppressed when showMobileToggle is false', () => {
  renderSidebar({ isMobile: true, collapsed: true, showMobileToggle: false });

  expect(screen.queryByRole('button', { name: 'Abrir barra lateral' })).not.toBeInTheDocument();
});

test('collapsed desktop rail shows the Nexus mark as the expand toggle', () => {
  renderSidebar({ collapsed: true });

  const toggle = screen.getByRole('button', { name: 'Expandir barra lateral' });
  // Marca do Nexus + ícone de painel (revelado no hover) convivem no mesmo botão.
  expect(toggle.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
});
