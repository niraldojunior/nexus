import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Copy,
  Download,
  FileText,
  FolderTree,
  Layers3,
  MapPin,
  MapPinned,
  Play,
  RotateCcw,
  Settings,
  ThumbsDown,
  ThumbsUp,
  Workflow,
  Zap,
} from 'lucide-react';
import ClaudeBurst from './components/ClaudeBurst';
import Composer from './components/Composer';
import DocumentTile from './components/DocumentTile';
import GoogleDriveMark from './components/GoogleDriveMark';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import GeoPage from './pages/GeoPage';
import NewResearchPage from './pages/NewResearchPage';
import { ResearchPage } from './pages/ResearchPage';
import { PesquisasPage } from './pages/PesquisasPage';
import { ResearchHistoryPage } from './pages/ResearchHistoryPage';
import {
  domainCards,
  domainMetrics,
  initialConversations,
  initialRecentItems,
  settingsSections,
} from './data/mockData';
import { sendMessage } from './services/api';
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
  Exclude<PageId, 'assistant' | 'conversation' | 'research'>,
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
          <ClaudeBurst className="h-10 w-10 text-brand-terracotta" />
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
              className="flex items-center gap-2 rounded-2xl border border-app-border bg-white px-3.5 py-2 text-[0.92rem] font-semibold text-app-text shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft"
            >
              <Icon className="h-5 w-5 text-app-muted" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DomainPage({ page }: { page: Exclude<PageId, 'assistant' | 'conversation' | 'research'> }) {
  const meta = domainMeta[page];
  const Icon = meta.icon;

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
        {page === 'geo' ? <GeoPage /> : <DomainOverview page={page} />}
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
    <article className="rounded-[26px] border border-app-border bg-white p-6 shadow-soft transition hover:-translate-y-[1px] hover:border-app-accent-border hover:bg-app-accent-soft">
      <div className="mb-5 inline-flex rounded-[999px] border border-app-accent-border bg-app-accent-soft px-3 py-1 text-[0.78rem] font-semibold text-app-text">
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
  onInputChange,
  onSubmit,
}: {
  conversation: Conversation;
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between px-9 py-4">
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

      <div className="flex-1 overflow-y-auto px-9">
        <div className="mx-auto max-w-[1080px] pb-8">
          {conversation.entries.map((entry) => (
            <div key={entry.id} className="mb-10">
              {entry.role === 'assistant' ? (
                <AssistantEntry entry={entry} />
              ) : (
                <div className="ml-auto max-w-[820px] rounded-[24px] border border-app-border bg-white px-6 py-5 shadow-soft">
                  <p className="text-[1rem] leading-8 text-app-text">{entry.content}</p>
                </div>
              )}
            </div>
          ))}
          <div className="mb-8 flex items-center gap-3 pl-5">
            <ClaudeBurst className="h-10 w-10 text-brand-terracotta" />
          </div>
        </div>
      </div>

      <div className="px-9 pb-4">
        <div className="mx-auto max-w-[1080px]">
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
    <div className="max-w-[1020px] pl-5">
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

      <div className="max-w-none">
        {entry.content.split('\n\n').map((paragraph) => (
          <p
            key={paragraph}
            className="mb-7 text-[1.08rem] font-medium leading-[1.7] tracking-[-0.01em] text-app-text"
          >
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-5 text-app-muted">
        {[Copy, Play, ThumbsUp, ThumbsDown, RotateCcw].map((Icon) => (
          <button
            key={Icon.displayName || Icon.name}
            type="button"
            className="transition hover:text-app-text"
          >
            <Icon className="h-6 w-6" strokeWidth={1.8} />
          </button>
        ))}
      </div>
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
  const [activeResearchSessionId, setActiveResearchSessionId] = useState<string | null>(null);
  const [researchSessionRefreshTrigger, setResearchSessionRefreshTrigger] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>('skills');
  const messageAreaRef = useRef<HTMLDivElement>(null);

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
  };

  const handleNewResearch = () => {
    // Don't create session immediately - let user type first (lazy creation)
    setActiveResearchSessionId(null);
    setCurrentPage('research');
    setInput('');
  };

  const handleViewPesquisas = () => {
    setCurrentPage('pesquisas');
    setInput('');
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
    setCurrentPage('conversation');
    setActiveConversationId(nextConversationId);

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

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === nextConversationId
            ? { ...conversation, entries: [...conversation.entries, assistantEntry] }
            : conversation,
        ),
      );
    } finally {
      setLoading(false);
      messageAreaRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex h-screen bg-app-bg text-app-text">
      <Sidebar
        collapsed={sidebarCollapsed}
        currentPage={currentPage}
        activeRecentConversationId={activeConversationId}
        activeResearchSessionId={activeResearchSessionId}
        settingsOpen={settingsOpen}
        recentItems={recentItems}
        recentGroup={recentGroup}
        researchSessionRefreshTrigger={researchSessionRefreshTrigger}
        onGroupChange={setRecentGroup}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        onNewConversation={handleNewConversation}
        onNewResearch={handleNewResearch}
        onSelectPage={(page) => {
          if (page === 'settings') {
            setSettingsOpen(true);
            return;
          }
          setSettingsOpen(false);
          setCurrentPage(page);
          setActiveResearchSessionId(null);
        }}
        onOpenRecentItem={(conversationId) => {
          setSettingsOpen(false);
          setActiveConversationId(conversationId);
          setCurrentPage('conversation');
        }}
        onSelectResearchSession={(sessionId) => {
          setSettingsOpen(false);
          setActiveResearchSessionId(sessionId);
          setCurrentPage('research');
        }}
      />

      <main className="flex-1 overflow-hidden">
        {/* ResearchPage gerencia seu próprio scroll - sem container externo */}
        {currentPage === 'research' && activeResearchSessionId !== null ? (
          <ResearchPage
            sessionId={activeResearchSessionId}
            onBack={() => {
              setCurrentPage('pesquisas');
              setActiveResearchSessionId(null);
            }}
          />
        ) : (
          <div ref={messageAreaRef} className="h-full overflow-y-auto">
            <div className="min-h-full origin-top-left scale-[0.93] [width:107.5269%]">
              {currentPage === 'assistant' ? (
                <AssistantHome
                  input={input}
                  loading={loading}
                  onInputChange={setInput}
                  onSubmit={handleSubmitMessage}
                  onNavigate={setCurrentPage}
                />
              ) : null}
              {currentPage === 'geo' ? <DomainPage page="geo" /> : null}
              {currentPage === 'resource' ? <DomainPage page="resource" /> : null}
              {currentPage === 'service' ? <DomainPage page="service" /> : null}
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
              {currentPage === 'pesquisas' ? (
                <PesquisasPage
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
