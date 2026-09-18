import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from './App';

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

// O App agora exige sessão: sem um JWT válido em localStorage renderiza a tela de login. Estes
// testes exercitam o shell autenticado, então semeamos uma sessão válida antes de cada render.
const base64Url = (value: object): string =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

function seedSession(roles: string[] = ['inventory.reader', 'order.reader']) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ sub: 'ana', roles, exp })}.sig`;
  localStorage.setItem('authToken', token);
  localStorage.setItem(
    'authUser',
    JSON.stringify({
      id: 'u1',
      externalId: 'ana',
      name: 'Ana',
      roles,
      tenantId: 'default',
      status: 'active',
    }),
  );
}

beforeEach(() => {
  setViewport(false);
  seedSession();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

test('mobile opens Recursos (Geo) at the root and canonicalizes the URL to /geo', () => {
  setViewport(true);
  window.history.replaceState({}, '', '/');
  render(<App />);

  expect(screen.getByText('GeoPage')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/geo');
});

test('navigating via the menu updates the URL path', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: 'Recursos' }));
  expect(window.location.pathname).toBe('/geo');

  await user.click(screen.getByRole('button', { name: 'Ordens' }));
  expect(window.location.pathname).toBe('/orders');
});

test('Serviços e Ordens somem do sidebar e ficam bloqueadas por URL sem papel order.*', () => {
  seedSession(['inventory.reader']);
  window.history.replaceState({}, '', '/orders');
  render(<App />);

  expect(screen.queryByRole('button', { name: 'Serviços' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ordens' })).not.toBeInTheDocument();
  expect(screen.getByText('Você não tem permissão para acessar Ordens.')).toBeInTheDocument();
});
