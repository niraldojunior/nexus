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
    activeResourceTab: 'PhysicalResource',
    resourceMenuOpen: false,
    settingsOpen: false,
    recentItems: [],
    recentGroup: 'none',
    onGroupChange: vi.fn(),
    onToggleCollapse: vi.fn(),
    onNewConversation: vi.fn(),
    onNewResearch: vi.fn(),
    onSelectPage: vi.fn(),
    onToggleResourceMenu: vi.fn(),
    onSelectResourceTab: vi.fn(),
    onOpenRecentItem: vi.fn(),
    ...overrides,
  };

  render(<Sidebar {...props} />);
  return props;
};

test('shows resource submenu when expanded', () => {
  renderSidebar({ resourceMenuOpen: true });

  expect(screen.getByRole('button', { name: 'Físicos' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lógicos' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Catálogo' })).toBeInTheDocument();
});

test('resource menu toggles submenu visibility and submenu selects the matching tab', async () => {
  const user = userEvent.setup();
  const onToggleResourceMenu = vi.fn();
  const onSelectResourceTab = vi.fn();

  renderSidebar({ onToggleResourceMenu, onSelectResourceTab });

  expect(screen.queryByRole('button', { name: 'Físicos' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Recursos' }));
  expect(onToggleResourceMenu).toHaveBeenCalledTimes(1);

  cleanup();
  renderSidebar({
    resourceMenuOpen: true,
    onToggleResourceMenu,
    onSelectResourceTab,
  });

  await user.click(screen.getByRole('button', { name: 'Lógicos' }));
  await user.click(screen.getByRole('button', { name: 'Catálogo' }));

  expect(onSelectResourceTab).toHaveBeenNthCalledWith(1, 'LogicalResource');
  expect(onSelectResourceTab).toHaveBeenNthCalledWith(2, 'ResourceSpecification');
});

test('resource submenu is hidden when collapsed', () => {
  renderSidebar({ collapsed: true, resourceMenuOpen: true });

  expect(screen.queryByRole('button', { name: 'Físicos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Lógicos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Catálogo' })).not.toBeInTheDocument();
});
