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
    currentPage: 'resource',
    activeRecentConversationId: null,
    activeResearchSessionId: null,
    activeResourceCategory: 'Equipment.Access',
    resourceMenuOpen: false,
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
    onToggleResourceMenu: vi.fn(),
    onSelectResourceCategory: vi.fn(),
    onToggleServiceMenu: vi.fn(),
    onSelectServiceCategory: vi.fn(),
    onOpenRecentItem: vi.fn(),
    ...overrides,
  };

  render(<Sidebar {...props} />);
  return props;
};

test('shows flat category submenu when expanded, without group headers', () => {
  renderSidebar({ resourceMenuOpen: true });

  // No group headers
  expect(screen.queryByText('Equipamentos')).not.toBeInTheDocument();
  expect(screen.queryByText('Cabos')).not.toBeInTheDocument();
  expect(screen.queryByText('Lógicos')).not.toBeInTheDocument();
  // Category items
  expect(screen.getByRole('button', { name: 'Cliente' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cabos OSP' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Recursos L2' })).toBeInTheDocument();
});

test('resource menu toggles submenu and category items select the matching category', async () => {
  const user = userEvent.setup();
  const onToggleResourceMenu = vi.fn();
  const onSelectResourceCategory = vi.fn();

  renderSidebar({ onToggleResourceMenu, onSelectResourceCategory });

  expect(screen.queryByRole('button', { name: 'Cliente' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Recursos' }));
  expect(onToggleResourceMenu).toHaveBeenCalledTimes(1);

  cleanup();
  renderSidebar({
    resourceMenuOpen: true,
    onToggleResourceMenu,
    onSelectResourceCategory,
  });

  await user.click(screen.getByRole('button', { name: 'Cliente' }));
  await user.click(screen.getByRole('button', { name: 'Endereçamento e IPAM' }));

  expect(onSelectResourceCategory).toHaveBeenNthCalledWith(1, 'Equipment.CustomerPremises');
  expect(onSelectResourceCategory).toHaveBeenNthCalledWith(2, 'Logical.IPAM');
});

test('resource submenu is hidden when collapsed', () => {
  renderSidebar({ collapsed: true, resourceMenuOpen: true });

  expect(screen.queryByRole('button', { name: 'Cliente' })).not.toBeInTheDocument();
  expect(screen.queryByText('Equipamentos')).not.toBeInTheDocument();
});

test('primary navigation remains clickable when collapsed', async () => {
  const user = userEvent.setup();
  const onSelectPage = vi.fn();
  const onToggleResourceMenu = vi.fn();

  renderSidebar({
    collapsed: true,
    onSelectPage,
    onToggleResourceMenu,
  });

  await user.click(screen.getByRole('button', { name: 'Locais' }));
  await user.click(screen.getByRole('button', { name: 'Recursos' }));

  expect(onSelectPage).toHaveBeenCalledWith('geo');
  expect(onToggleResourceMenu).toHaveBeenCalledTimes(1);
});

test('shows Studio only to authorized users', () => {
  renderSidebar({ canViewStudio: true });
  expect(screen.getByRole('button', { name: 'Studio' })).toBeInTheDocument();

  cleanup();
  renderSidebar({ canViewStudio: false });
  expect(screen.queryByRole('button', { name: 'Studio' })).not.toBeInTheDocument();
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
