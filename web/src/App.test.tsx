import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';

vi.mock('./pages/ResourcePage', () => ({
  default: () => <div>ResourcePage</div>,
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

afterEach(() => {
  vi.clearAllMocks();
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
