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
    settingsOpen: false,
    recentItems: [],
    recentGroup: 'none',
    onGroupChange: vi.fn(),
    onToggleCollapse: vi.fn(),
    onNewConversation: vi.fn(),
    onNewResearch: vi.fn(),
    onSelectPage: vi.fn(),
    onOpenRecentItem: vi.fn(),
    canViewOrder: true,
    ...overrides,
  };

  render(<Sidebar {...props} />);
  return props;
};

test('primary navigation remains clickable when collapsed', async () => {
  const user = userEvent.setup();
  const onSelectPage = vi.fn();

  renderSidebar({
    collapsed: true,
    onSelectPage,
  });

  await user.click(screen.getByRole('button', { name: 'Planta Externa' }));

  expect(onSelectPage).toHaveBeenCalledWith('geo');
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
  expect(screen.queryByRole('button', { name: /^Serviços/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ordens' })).not.toBeInTheDocument();

  cleanup();
  renderSidebar({ canViewOrder: true });
  expect(screen.getByRole('button', { name: /^Serviços/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Ordens/ })).toBeInTheDocument();
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
