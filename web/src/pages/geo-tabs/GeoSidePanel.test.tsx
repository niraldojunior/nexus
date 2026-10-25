import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CopilotConversation } from '../../components/copilot/CopilotChat';
import { GeoSidePanel } from './GeoSidePanel';

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../../components/copilot/CopilotChat', () => ({
  CopilotChat: () => <div>Chat do Copilot</div>,
}));
vi.mock('../../components/copilot/ConversationList', () => ({
  ConversationList: () => <div>Lista de conversas</div>,
}));
vi.mock('./ProjectListView', () => ({
  ProjectListView: () => <div>Lista de projetos</div>,
}));

const conversation = {
  session: null,
  messages: [],
  input: '',
  setInput: vi.fn(),
  error: null,
  setError: vi.fn(),
  loadingSession: false,
  sending: false,
  pendingMessageId: null,
  confirmingToken: null,
  resolvedTokens: new Set<string>(),
  send: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  rename: vi.fn(),
  confirmPending: vi.fn(),
} as unknown as CopilotConversation;

const props = {
  collapsed: false,
  tab: 'copilot' as const,
  onTabChange: vi.fn(),
  conversation,
  copilotView: 'chat' as const,
  onCopilotViewChange: vi.fn(),
  onSelectSession: vi.fn(),
  onNewConversation: vi.fn(),
  onClientAction: vi.fn(),
  onInternalLink: vi.fn(),
  projects: [],
  projectsLoading: false,
  canEdit: true,
  onCreateProject: vi.fn(),
  onOpenProject: vi.fn(),
  onDeleteProject: vi.fn().mockResolvedValue({ deleted: true }),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GeoSidePanel', () => {
  it('não renderiza quando está recolhido', () => {
    const { container } = render(<GeoSidePanel {...props} collapsed />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o chat e oferece pesquisar e iniciar conversa', () => {
    render(<GeoSidePanel {...props} />);

    expect(screen.getByRole('tab', { name: 'Copilot' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Chat do Copilot')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Pesquisar conversas'));
    expect(props.onCopilotViewChange).toHaveBeenCalledWith('search');

    fireEvent.click(screen.getByLabelText('Nova conversa'));
    expect(props.onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('renomeia a conversa ao clicar no título e salva ao perder o foco', () => {
    const withSession = {
      ...conversation,
      session: { id: 's1', title: 'oi' },
    } as unknown as CopilotConversation;
    render(<GeoSidePanel {...props} conversation={withSession} />);

    fireEvent.click(screen.getByRole('button', { name: 'oi' }));
    const input = screen.getByLabelText('Título da conversa');
    fireEvent.change(input, { target: { value: '  CDOs da Asa Sul  ' } });
    fireEvent.blur(input);

    expect(withSession.rename).toHaveBeenCalledWith('CDOs da Asa Sul');
    expect(screen.queryByLabelText('Título da conversa')).not.toBeInTheDocument();
  });

  it('Esc descarta a edição do título sem salvar', () => {
    const withSession = {
      ...conversation,
      session: { id: 's1', title: 'oi' },
    } as unknown as CopilotConversation;
    render(<GeoSidePanel {...props} conversation={withSession} />);

    fireEvent.click(screen.getByRole('button', { name: 'oi' }));
    const input = screen.getByLabelText('Título da conversa');
    fireEvent.change(input, { target: { value: 'outro' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(withSession.rename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'oi' })).toBeInTheDocument();
  });

  it('troca para Projetos pela navegação de abas', () => {
    render(<GeoSidePanel {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Projetos' }));
    expect(props.onTabChange).toHaveBeenCalledWith('projects');
  });
});
