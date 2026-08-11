import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from './App';

vi.mock('./pages/ResourcePage', () => ({
  default: ({ category }: { category?: string }) => <div>ResourcePage:{category}</div>,
}));

vi.mock('./pages/NewResearchPage', () => ({
  default: () => <div>NewResearchPage</div>,
}));

vi.mock('./pages/PesquisasPage', () => ({
  ConversasPage: () => <div>ConversasPage</div>,
}));

vi.mock('./pages/ResearchPage', () => ({
  ResearchPage: () => <div>ResearchPage</div>,
}));

vi.mock('./pages/GeoPage', () => ({
  default: () => <div>GeoPage</div>,
}));

vi.mock('./pages/ResearchHistoryPage', () => ({
  ResearchHistoryPage: () => <div />,
}));

vi.mock('./components/SettingsModal', () => ({
  default: () => null,
}));

vi.mock('./services/api', () => ({
  sendMessage: vi.fn(),
}));

function setViewport(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setViewport(false);
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

test('resource submenu opens from Recursos and closes when navigating elsewhere', async () => {
  const user = userEvent.setup();
  render(<App />);

  expect(screen.queryByRole('button', { name: 'Cliente' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Recursos' }));
  expect(screen.getByRole('button', { name: 'Cliente' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Conversas' }));
  expect(screen.queryByRole('button', { name: 'Cliente' })).not.toBeInTheDocument();
  expect(screen.getByText('ConversasPage')).toBeInTheDocument();
});

test('restores the resource category page from the URL on load (F5)', () => {
  window.history.replaceState({}, '', '/resources/logical-ipam');
  render(<App />);

  expect(screen.getByText('ResourcePage:Logical.IPAM')).toBeInTheDocument();
});

test('mobile opens Locais at the root and canonicalizes the URL to /geo', () => {
  setViewport(true);
  window.history.replaceState({}, '', '/');
  render(<App />);

  expect(screen.getByText('GeoPage')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/geo');
});

test('navigating via the menu updates the URL path', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: 'Locais' }));
  expect(window.location.pathname).toBe('/geo');

  await user.click(screen.getByRole('button', { name: 'Ordens' }));
  expect(window.location.pathname).toBe('/orders');
});
