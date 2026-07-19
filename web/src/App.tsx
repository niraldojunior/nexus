import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileText,
  FolderTree,
  Layers3,
  MapPin,
  MapPinned,
  Settings,
  Workflow,
  Zap,
} from 'lucide-react';
import ClaudeBurst from './components/ClaudeBurst';
import CopilotPendingResponse from './components/CopilotPendingResponse';
import Diamond from './components/Diamond';
import Composer from './components/Composer';
import DocumentTile from './components/DocumentTile';
import MarkdownMessage from './components/MarkdownMessage';
import GoogleDriveMark from './components/GoogleDriveMark';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import GeoPage from './pages/GeoPage';
import NewResearchPage from './pages/NewResearchPage';
import ResourcePage from './pages/ResourcePage';
import ServicePage from './pages/ServicePage';
import { ResearchPage } from './pages/ResearchPage';
import { ConversasPage } from './pages/PesquisasPage';
import { scrollChatAnchorIntoView, scrollChatToBottom } from './utils/chatScroll';
import {
  domainCards,
  domainMetrics,
  initialConversations,
  initialRecentItems,
  settingsSections,
} from './data/mockData';
import { sendMessage } from './services/api';
import { DEFAULT_RESOURCE_CATEGORY_CODE } from './data/resourceCategoryViews';
import { DEFAULT_SERVICE_CATEGORY_CODE } from './data/serviceCategoryViews';
import {
  Conversation,
  ConversationEntry,
  DomainCardData,
  DomainMetric,
  PageId,
  RecentGroup,
  SettingsSection,
} from './types';

const assistantChips = [
  { icon: MapPinned, label: 'Explorar Geo' },
  { icon: Layers3, label: 'Analisar Resource' },
  { icon: Workflow, label: 'Modelar Service' },
  { icon: Zap, label: 'Checar Order' },
  { icon: FileText, label: 'Gerar especificação' },
];

const domainMeta: Record<
  Exclude<PageId, 'assistant' | 'conversation' | 'research' | 'conversas'>,
  { title: string; subtitle: string; icon: typeof MapPin }
> = {
  geo: { title: 'Geo', subtitle: 'Onde? Geographic Site, Address & Location', icon: MapPinned },
  resource: { title: 'Resource', subtitle: 'O quê? Inventário físico e lógico', icon: Layers3 },
  service: {
    title: 'Service',
    subtitle: 'Para quê / quem? CFS, RFS e SubscriberID',
    icon: Workflow,
  },
  order: { title: 'Order', subtitle: 'Viabilidade, qualificação e fulfillment', icon: FolderTree },
};

function AssistantHome({
  input,
  loading,
  onInputChange,
  onSubmit,
  onNavigate,
}: {
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <div className="relative flex min-h-full items-center justify-center px-7 py-9">
      <div className="w-full max-w-[940px] text-center">
        <div className="mb-8 flex items-center justify-center gap-3">
          <ClaudeBurst className="h-10 w-10 text-brand-amber" />
          <h1 className="font-display text-[3rem] font-semibold leading-[0.98] tracking-[-0.03em] text-app-text">
            Como vamos evoluir o Nexus hoje?
          </h1>
        </div>

        <div className="mx-auto max-w-[840px]">
          <Composer
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            loading={loading}
            placeholder="Pergunte sobre Geo, Resource, Service, Order ou gere uma especificação..."
            size="hero"
            modelLabel="Nexus"
            qualityLabel="TMF-first"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {assistantChips.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (label.includes('Geo')) onNavigate('geo');
                if (label.includes('Resource')) onNavigate('resource');
                if (label.includes('Service')) onNavigate('service');
                if (label.includes('Order')) onNavigate('order');
              }}
              className="group flex items-center gap-2 rounded-2xl border border-app-border bg-white px-3.5 py-2 text-[0.92rem] font-medium text-app-text shadow-soft transition hover:border-app-accent-border hover:bg-white"
            >
              <Diamond size={5} className="opacity-40 transition-opacity group-hover:opacity-100" />
              <Icon className="h-5 w-5 text-app-muted" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DomainPage({ page }: { page: Exclude<PageId, 'assistant' | 'conversation' | 'research' | 'conversas'> }) {
  const meta = domainMeta[page];
  const Icon = meta.icon;

  if (page === 'geo') {
    return (
      <div className="h-full min-h-0 min-w-0">
        <GeoPage />
      </div>
    );
  }

  return (
    <div className="min-h-full px-8 py-8">
      <div className="mx-auto max-w-[1420px]">
        <div className="mb-7 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-app-accent-border bg-app-accent-soft text-app-text">
              <Icon className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="font-display text-[2.6rem] font-semibold leading-[0.96] tracking-[-0.03em] text-app-text">
                {meta.title}
              </h1>
              <p className="mt-2 text-[0.96rem] text-app-muted">{meta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <HeaderSelect prefix="Filtrar por" value="Todos" />
            <button
              type="button"
              className="flex h-[48px] items-center rounded-[999px] border border-app-accent-border bg-app-accent px-5 text-[0.94rem] font-semibold text-app-text shadow-soft transition hover:brightness-95"
            >
              Nova entidade
            </button>
          </div>
        </div>

        <MetricGrid metrics={domainMetrics[page]} />
        <DomainOverview page={page} />
      </div>
    </div>
  );
}

function HeaderSelect({ prefix, value }: { prefix: string; value: string }) {
  return (
    <button
      type="button"
      className="flex h-[48px] items-center gap-2 rounded-[16px] border border-app-border bg-white px-[16px] text-[0.94rem] font-medium text-app-text shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft"
    >
      <span className="text-app-muted">{prefix}</span>
      <span className="font-semibold text-app-text">{value}</span>
      <ChevronDown className="h-[0.95rem] w-[0.95rem] text-app-muted" strokeWidth={1.8} />
    </button>
  );
}

function MetricGrid({ metrics }: { metrics: DomainMetric[] }) {
  return (
    <div className="mb-8 grid gap-4 md:grid-cols-4">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className="rounded-[22px] border border-app-border bg-white p-5 shadow-soft"
        >
          <div className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {metric.label}
          </div>
          <div className="mt-3 font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] text-app-text">
            {metric.value}
          </div>
          <div className="mt-2 text-[0.88rem] text-app-muted">{metric.sub}</div>
        </article>
      ))}
    </div>
  );
}

function DomainOverview({ page }: { page: Exclude<PageId, 'assistant' | 'conversation' | 'research'> }) {
  const cards = domainCards[page];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-5 md:grid-cols-2">
        {cards.map((card) => (
          <DomainCard key={card.title} card={card} />
        ))}
      </div>

      <aside className="rounded-[26px] border border-app-border bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[1.25rem] font-semibold text-app-text">Contratos TMF</h2>
          <Settings className="h-5 w-5 text-app-muted" />
        </div>
        <div className="space-y-3 text-[0.92rem] text-app-muted">
          <p>
            A UI mantém o modelo canônico: entidades referenciam camadas vizinhas; não copiam
            atributos de outro domínio.
          </p>
          <p>
            Extensões V.tal entram como <strong className="text-app-text">characteristic</strong>{' '}
            via catálogo, preservando interoperabilidade ODA.
          </p>
          <p>Alterações relevantes publicam eventos TMF688 e preservam trilha operacional.</p>
        </div>
      </aside>
    </div>
  );
}

function DomainCard({ card }: { card: DomainCardData }) {
  return (
    <article className="rounded-[26px] border border-app-border bg-white p-6 shadow-soft transition hover:-translate-y-[1px] hover:border-app-accent-border hover:shadow-soft-lg">
      <div className="mb-5 inline-flex items-center gap-2 rounded-[999px] border border-app-border bg-white px-3 py-1 text-[0.78rem] font-semibold text-app-text">
        <Diamond size={6} />
        {card.tag}
      </div>
      <h2 className="mb-3 font-display text-[1.4rem] font-semibold tracking-[-0.02em] text-app-text">
        {card.title}
      </h2>
      <p className="text-[0.95rem] leading-7 text-app-muted">{card.description}</p>
    </article>
  );
}

function ConversationPage({
  conversation,
  input,
  loading,
  pendingUserMessageId,
  errorMessage,
  onInputChange,
  onSubmit,
}: {
  conversation: Conversation;
  input: string;
  loading: boolean;
  pendingUserMessageId: string | null;
  errorMessage?: string | null;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const activeTurnAnchorRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingUserMessageId) {
      requestAnimationFrame(() => {
        scrollChatAnchorIntoView(messagesScrollRef.current, activeTurnAnchorRef.current);
      });
      return;
    }

    requestAnimationFrame(() => {
      scrollChatToBottom(messagesScrollRef.current);
    });
  }, [conversation.id, conversation.entries.length, pendingUserMessageId, loading]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-transparent px-6 py-4">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <div className="text-[0.9rem] font-semibold text-app-muted">
            {conversation.projectLabel} / {conversation.title}
          </div>
          <button
            type="button"
            className="rounded-[999px] border border-app-border bg-white px-5 py-2.5 text-[1rem] font-semibold text-app-text shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft"
          >
            Compartilhar
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-6 py-2">
        <div ref={messagesScrollRef} className="h-full overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-[1180px] flex-col justify-start gap-5 pb-10 pt-8">
            {conversation.entries.map((entry) => (
              <div key={entry.id}>
                {entry.role === 'assistant' ? (
                  <AssistantEntry entry={entry} />
                ) : (
                  <div className="flex w-full flex-col gap-3">
                    {pendingUserMessageId === entry.id ? (
                      <div ref={activeTurnAnchorRef} className="h-1 w-full" />
                    ) : null}
                    <div className="ml-auto w-fit max-w-[840px] rounded-[24px] border border-app-border bg-white px-6 py-5 shadow-sm">
                      <p className="text-[1.02rem] leading-[1.6] tracking-[-0.01em] text-app-text">
                        {entry.content}
                      </p>
                    </div>
                    {loading && pendingUserMessageId === entry.id ? <CopilotPendingResponse /> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 pb-3">
        <div className="mx-auto max-w-[1180px]">
          <Composer
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            loading={loading}
            placeholder="Escreva uma mensagem..."
            size="compact"
            modelLabel="Nexus"
            qualityLabel="Baixo"
          />
          {errorMessage ? (
            <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
          <p className="mt-3 text-center text-[0.92rem] text-app-muted">
            Nexus pode cometer erros. Verifique decisões arquiteturais nos HLDs.
          </p>
        </div>
      </div>
    </div>
  );
}

function AssistantEntry({ entry }: { entry: ConversationEntry }) {
  return (
    <div className="max-w-[1180px]">
      {entry.attachments?.length ? (
        <div className="mb-7">
          {entry.attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex max-w-[1080px] items-center justify-between rounded-[20px] border border-app-border bg-app-panel px-8 py-5 shadow-soft"
            >
              <div className="flex items-center gap-6">
                <DocumentTile className="h-20 w-20" />
                <div>
                  <div className="text-[1.05rem] font-medium text-app-text">{attachment.title}</div>
                  <div className="text-[0.95rem] text-app-muted">{attachment.meta}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-app-border bg-white p-3 shadow-soft"
                >
                  <GoogleDriveMark className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  className="rounded-[999px] border border-app-border bg-white px-8 py-4 text-[1.05rem] font-medium text-app-text shadow-soft"
                >
                  <Download className="mr-2 inline h-5 w-5" />
                  Baixar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <MarkdownMessage content={entry.content} />
    </div>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('research');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentGroup, setRecentGroup] = useState<RecentGroup>('none');
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversations[0]?.id ?? null,
  );
  const [pendingConversationEntryId, setPendingConversationEntryId] = useState<string | null>(null);
  const [activeResearchSessionId, setActiveResearchSessionId] = useState<string | null>(null);
  const [activeResourceCategory, setActiveResourceCategory] = useState<string>(DEFAULT_RESOURCE_CATEGORY_CODE);
  const [resourceMenuOpen, setResourceMenuOpen] = useState(false);
  const [activeServiceCategory, setActiveServiceCategory] = useState<string>(DEFAULT_SERVICE_CATEGORY_CODE);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [researchSessionRefreshTrigger, setResearchSessionRefreshTrigger] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>('skills');

  // Menu Locais (Geo) abre com o mapa em foco: recolhe a barra lateral com
  // animação ao entrar e a reabre com animação ao navegar para qualquer outro menu.
  useEffect(() => {
    setSidebarCollapsed(currentPage === 'geo');
  }, [currentPage]);

  useEffect(() => {
    const openConversationFromUrl = () => {
      const match = window.location.pathname.match(/^\/c\/([^/]+)$/);
      if (!match) return;

      const conversationId = decodeURIComponent(match[1]);

      // Backward compatibility for local mock conversations while prioritizing research sessions.
      if (conversationId.startsWith('conversation-')) {
        setConversations((current) => {
          if (current.some((conversation) => conversation.id === conversationId)) return current;

          return [
            {
              id: conversationId,
              title: `Conversa ${conversationId.slice(0, 10)}`,
              projectLabel: 'V.tal Nexus',
              updatedAt: 'agora',
              entries: [],
            },
            ...current,
          ];
        });
        setActiveConversationId(conversationId);
        setActiveResearchSessionId(null);
        setCurrentPage('conversation');
        return;
      }

      setActiveResearchSessionId(conversationId);
      setCurrentPage('research');
    };

    openConversationFromUrl();
    window.addEventListener('popstate', openConversationFromUrl);
    return () => window.removeEventListener('popstate', openConversationFromUrl);
  }, []);

  useEffect(() => {
    const expectedPath =
      currentPage === 'conversation' && activeConversationId
        ? `/c/${encodeURIComponent(activeConversationId)}`
        : currentPage === 'research' && activeResearchSessionId
          ? `/c/${encodeURIComponent(activeResearchSessionId)}`
          : '/';

    if (window.location.pathname !== expectedPath) {
      window.history.replaceState({}, '', expectedPath);
    }
  }, [currentPage, activeConversationId]);

  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeConversationId) ??
      conversations[0],
    [activeConversationId, conversations],
  );

  const recentItems = useMemo(() => {
    if (recentGroup === 'project')
      return [...initialRecentItems].sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));
    if (recentGroup === 'date')
      return [...initialRecentItems]
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .reverse();
    return initialRecentItems;
  }, [recentGroup]);

  const handleNewConversation = () => {
    const id = `conversation-${Date.now()}`;
    const newConversation: Conversation = {
      id,
      title: 'Nova conversa Nexus',
      projectLabel: 'V.tal Nexus',
      updatedAt: 'agora',
      entries: [],
    };

    setConversations((current) => [newConversation, ...current]);
    setActiveConversationId(id);
    setCurrentPage('assistant');
    setInput('');
    setAssistantError(null);
    setPendingConversationEntryId(null);
    setResourceMenuOpen(false);
  };

  const handleNewResearch = () => {
    // Don't create session immediately - let user type first (lazy creation)
    setActiveResearchSessionId(null);
    setCurrentPage('research');
    setInput('');
    setAssistantError(null);
    setPendingConversationEntryId(null);
    setResourceMenuOpen(false);
  };

  const handleSelectResourceCategory = (categoryCode: string) => {
    setSettingsOpen(false);
    setActiveResearchSessionId(null);
    setActiveResourceCategory(categoryCode);
    setResourceMenuOpen(true);
    setServiceMenuOpen(false);
    setCurrentPage('resource');
  };

  const handleToggleResourceMenu = () => {
    setSettingsOpen(false);
    setActiveResearchSessionId(null);
    setCurrentPage('resource');
    setServiceMenuOpen(false);
    setResourceMenuOpen((current) => !current);
  };

  const handleSelectServiceCategory = (categoryCode: string) => {
    setSettingsOpen(false);
    setActiveResearchSessionId(null);
    setActiveServiceCategory(categoryCode);
    setServiceMenuOpen(true);
    setResourceMenuOpen(false);
    setCurrentPage('service');
  };

  const handleToggleServiceMenu = () => {
    setSettingsOpen(false);
    setActiveResearchSessionId(null);
    setCurrentPage('service');
    setResourceMenuOpen(false);
    setServiceMenuOpen((current) => !current);
  };

  const handleSelectPage = (page: PageId | 'settings') => {
    if (page === 'settings') {
      setSettingsOpen(true);
      return;
    }
    setSettingsOpen(false);
    setResourceMenuOpen(page === 'resource' ? resourceMenuOpen : false);
    setServiceMenuOpen(page === 'service' ? serviceMenuOpen : false);
    setCurrentPage(page);
    setActiveResearchSessionId(null);
  };

  const handleAssistantNavigate = (page: PageId) => {
    setResourceMenuOpen(false);
    setServiceMenuOpen(false);
    setCurrentPage(page);
  };

  const handleSubmitMessage = async () => {
    if (!input.trim() || loading) return;

    const nextConversationId = activeConversationId ?? `conversation-${Date.now()}`;
    const userEntry: ConversationEntry = {
      id: `entry-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };
    const nextInput = input.trim();

    setInput('');
    setLoading(true);
    setAssistantError(null);
    setResourceMenuOpen(false);
    setCurrentPage('conversation');
    setActiveConversationId(nextConversationId);
    setPendingConversationEntryId(userEntry.id);

    setConversations((current) => {
      const exists = current.some((conversation) => conversation.id === nextConversationId);
      if (!exists) {
        return [
          {
            id: nextConversationId,
            title: nextInput.slice(0, 34),
            projectLabel: 'V.tal Nexus',
            updatedAt: 'agora',
            entries: [userEntry],
          },
          ...current,
        ];
      }

      return current.map((conversation) =>
        conversation.id === nextConversationId
          ? {
              ...conversation,
              title: conversation.entries.length ? conversation.title : nextInput.slice(0, 34),
              updatedAt: 'agora',
              entries: [...conversation.entries, userEntry],
            }
          : conversation,
      );
    });

    try {
      const targetConversation =
        conversations.find((conversation) => conversation.id === nextConversationId)?.entries ?? [];
      const response = await sendMessage([
        ...targetConversation.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: 'user', content: nextInput },
      ]);
      const assistantEntry: ConversationEntry = {
        id: `entry-${Date.now() + 1}`,
        role: 'assistant',
        content: response,
      };

      setPendingConversationEntryId(null);
      setLoading(false);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === nextConversationId
            ? { ...conversation, entries: [...conversation.entries, assistantEntry] }
            : conversation,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao chamar o ChatGPT.';
      setAssistantError(message);
    } finally {
      setLoading(false);
      setPendingConversationEntryId(null);
    }
  };

  return (
    <div className="flex h-screen bg-app-bg text-app-text">
      <Sidebar
        collapsed={sidebarCollapsed}
        currentPage={currentPage}
        activeRecentConversationId={activeConversationId}
        activeResearchSessionId={activeResearchSessionId}
        activeResourceCategory={activeResourceCategory}
        resourceMenuOpen={resourceMenuOpen}
        activeServiceCategory={activeServiceCategory}
        serviceMenuOpen={serviceMenuOpen}
        settingsOpen={settingsOpen}
        recentItems={recentItems}
        recentGroup={recentGroup}
        researchSessionRefreshTrigger={researchSessionRefreshTrigger}
        onGroupChange={setRecentGroup}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        onNewConversation={handleNewConversation}
        onNewResearch={handleNewResearch}
        onToggleResourceMenu={handleToggleResourceMenu}
        onSelectResourceCategory={handleSelectResourceCategory}
        onToggleServiceMenu={handleToggleServiceMenu}
        onSelectServiceCategory={handleSelectServiceCategory}
        onSelectPage={handleSelectPage}
        onOpenRecentItem={(conversationId) => {
          setSettingsOpen(false);
          setResourceMenuOpen(false);
          setActiveConversationId(conversationId);
          setCurrentPage('conversation');
        }}
        onSelectResearchSession={(sessionId) => {
          setSettingsOpen(false);
          setResourceMenuOpen(false);
          setActiveResearchSessionId(sessionId);
          setCurrentPage('research');
        }}
      />

      <main className="min-w-0 flex-1 overflow-hidden">
        {/* ResearchPage gerencia seu próprio scroll - sem container externo */}
        {currentPage === 'research' && activeResearchSessionId !== null ? (
          <ResearchPage
            sessionId={activeResearchSessionId}
            onBack={() => {
              setCurrentPage('conversas');
              setActiveResearchSessionId(null);
            }}
          />
        ) : currentPage === 'geo' ? (
          <div className="h-full min-h-0 overflow-hidden">
            <DomainPage page="geo" />
          </div>
        ) : (
          <div className={currentPage === 'conversation' ? 'h-full overflow-hidden' : 'h-full overflow-y-auto'}>
            <div
              className={
                currentPage === 'conversation'
                  ? 'h-full min-h-0'
                  : 'min-h-full origin-top-left scale-[0.93] [width:107.5269%]'
              }
            >
              {currentPage === 'assistant' ? (
                <AssistantHome
                  input={input}
                  loading={loading}
                  onInputChange={setInput}
                  onSubmit={handleSubmitMessage}
                  onNavigate={handleAssistantNavigate}
                />
              ) : null}
              {currentPage === 'resource' ? (
                <ResourcePage category={activeResourceCategory} />
              ) : null}
              {currentPage === 'service' ? <ServicePage category={activeServiceCategory} /> : null}
              {currentPage === 'order' ? <DomainPage page="order" /> : null}
              {currentPage === 'research' ? (
                activeResearchSessionId === null ? (
                  <NewResearchPage
                    onSessionCreated={(sessionId) => {
                      setActiveResearchSessionId(sessionId);
                      setCurrentPage('research');
                      setResearchSessionRefreshTrigger((prev) => prev + 1);
                    }}
                  />
                ) : null
              ) : null}
              {currentPage === 'conversas' ? (
                <ConversasPage
                  onSelectSession={(sessionId) => {
                    setActiveResearchSessionId(sessionId);
                    setCurrentPage('research');
                  }}
                />
              ) : null}
              {currentPage === 'conversation' && activeConversation ? (
                <ConversationPage
                  conversation={activeConversation}
                  input={input}
                  loading={loading}
                  pendingUserMessageId={pendingConversationEntryId}
                  errorMessage={assistantError}
                  onInputChange={setInput}
                  onSubmit={handleSubmitMessage}
                />
              ) : null}
            </div>
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        activeSection={activeSettingsSection}
        sections={settingsSections}
        onClose={() => setSettingsOpen(false)}
        onSelectSection={setActiveSettingsSection}
      />
    </div>
  );
}

export default App;
