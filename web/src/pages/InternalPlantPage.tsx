import { Layers, MapPin, Plus, Search, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import EmptyState from '../components/EmptyState';
import { OverlayScrollArea } from '../components/OverlayScrollArea';
import { ResourceIcon } from '../components/ResourceIcon';
import Button from '../components/ui/Button';
import DataTable, { DataTablePagination, type DataTableColumn } from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import PageHead from '../components/ui/PageHead';
import { describeStatus } from '../components/ui/StatusPill';
import {
  INTERNAL_PLANT_PAGE_SIZE,
  useInternalPlantResources,
} from '../hooks/useInternalPlantResources';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSession } from '../hooks/useSession';
import {
  fetchSiteReferences,
  retireSite,
  SiteEditorApiError,
  type SiteReferences,
} from '../services/siteEditorApi';
import {
  terminateInternalPlantResource,
  type InternalPlantLocationNode,
  InternalPlantResourceFilter,
  InternalPlantResourceRow,
} from '../services/internalPlantApi';
import { DOCK_ELEVATION_CLASS, DOCK_SEARCH_CLEARANCE_PT_CLASS } from './geo-tabs/dock';
import {
  INTERNAL_PLANT_DOCK_MAX_WIDTH,
  INTERNAL_PLANT_DOCK_MIN_WIDTH,
  INTERNAL_PLANT_SEARCH_GUTTER,
  clampDockWidth,
  readStoredDockWidth,
  storeDockWidth,
} from './internal-plant/dock';
import { InternalPlantSearchBar } from './internal-plant/InternalPlantSearchBar';
import { ResourceEditorModal } from './internal-plant/ResourceEditorModal';
import { SiteEditorModal } from './internal-plant/SiteEditorModal';
import { invalidateInternalPlantRoots, LocationTree } from './internal-plant/LocationTree';
import { TypeTree, type TypeSelection } from './internal-plant/TypeTree';

type DockTab = 'locations' | 'types';

type ContextIcon = { kind: 'site' | 'type' | 'search'; resourceTypeCode?: string | undefined };

type Context = {
  label: string;
  filter: InternalPlantResourceFilter;
  icon: ContextIcon;
  key?: string;
  /** Folha ResourceType selecionada na aba Tipos; habilita a criação. */
  leafTypeId?: string | undefined;
};

const TONE_BG: Record<string, string> = {
  green: 'bg-status-green',
  blue: 'bg-status-blue',
  amber: 'bg-status-amber',
  red: 'bg-status-red',
  purple: 'bg-status-purple',
  neutral: 'bg-app-muted',
};

/** Farol de cor do status; o nome fica no hint (title) e no texto para leitores de tela. */
function StatusLight({ status }: { status: string }) {
  const { label, tone } = describeStatus(status);
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TONE_BG[tone]}`}
      />
      <span className="truncate text-[0.82rem] text-app-text">{label}</span>
    </span>
  );
}

/** Ícone do título: o mesmo da origem do filtro (Local, tipo de recurso ou busca). */
function ContextTitleIcon({ icon }: { icon: ContextIcon }) {
  if (icon.kind === 'type' && icon.resourceTypeCode) {
    return <ResourceIcon resource={icon.resourceTypeCode} variant="glyph" size={28} />;
  }
  const Icon = icon.kind === 'search' ? Search : icon.kind === 'type' ? Layers : MapPin;
  return <Icon size={26} aria-hidden="true" className="shrink-0 text-app-muted" />;
}

function describeSiteReferences(refs: SiteReferences): string[] {
  const items: Array<[number, string]> = [
    [refs.activeChildSiteCount, 'locais internos ativos'],
    [refs.activeRelationshipCount, 'relações ativas'],
    [refs.activeResourceCount, 'recursos ativos'],
    [refs.activeServiceCount, 'serviços ativos'],
    [refs.activeOrderCount, 'ordens em andamento'],
  ];
  return items.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
}

const baseColumns: DataTableColumn<InternalPlantResourceRow>[] = [
  {
    key: 'icon',
    header: <span className="sr-only">Ícone</span>,
    cellClassName: 'w-10',
    render: (row) => <ResourceIcon resource={row.resourceType.code} variant="glyph" />,
  },
  { key: 'name', header: 'Nome', render: (row) => row.name },
  { key: 'type', header: 'Tipo', render: (row) => row.resourceType.name },
  { key: 'spec', header: 'Especificação', render: (row) => row.resourceSpecification.name },
  {
    key: 'status',
    header: <div className="text-center">Status</div>,
    render: (row) => <StatusLight status={row.statusCode ?? row.status} />,
  },
  { key: 'uf', header: 'UF', render: (row) => row.stateOrProvince ?? '—' },
  { key: 'city', header: 'Município', render: (row) => row.city ?? '—' },
];

export default function InternalPlantPage({ onOpenMainMenu }: { onOpenMainMenu?: () => void }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<DockTab>('locations');
  const [draft, setDraft] = useState('');
  const [context, setContext] = useState<Context | null>(null);
  const [offset, setOffset] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [dockWidth, setDockWidth] = useState(readStoredDockWidth);
  // No mobile a doca vira gaveta sobre a tabela, aberta por um botão na página.
  const [dockOpen, setDockOpen] = useState(false);
  const state = useInternalPlantResources(context?.filter ?? null, offset, retryToken);
  const { canEdit } = useSession();
  const [editor, setEditor] = useState<{
    resourceId?: string;
    typeId?: string;
    initialPlace?: { id: string; name: string };
  } | null>(null);
  const [siteEditor, setSiteEditor] = useState<{
    siteId?: string;
    initialAdministrativeCityId?: string;
  } | null>(null);
  const [treeToken, setTreeToken] = useState(0);
  const [treeSearchOpen, setTreeSearchOpen] = useState(false);
  const [treeQuery, setTreeQuery] = useState('');
  const treeInputRef = useRef<HTMLInputElement>(null);
  // Foco só na abertura; focar a cada render roubava o cursor da barra de pesquisa principal.
  useEffect(() => {
    if (treeSearchOpen) treeInputRef.current?.focus({ preventScroll: true });
  }, [treeSearchOpen]);
  useEffect(() => {
    setTreeQuery('');
    setTreeSearchOpen(false);
  }, [tab]);
  const [selectedCityId, setSelectedCityId] = useState<string | undefined>();
  const [pendingSiteRemoval, setPendingSiteRemoval] = useState<{
    id: string;
    name: string;
    blocking: string[];
  } | null>(null);
  const [removingSite, setRemovingSite] = useState(false);
  const [siteRemovalError, setSiteRemovalError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InternalPlantResourceRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const columns: DataTableColumn<InternalPlantResourceRow>[] = [
    ...baseColumns,
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Ações</span>,
            cellClassName: 'w-10',
            render: (row: InternalPlantResourceRow) => (
              <button
                type="button"
                aria-label={`Encerrar ${row.name}`}
                title="Encerrar"
                className="rounded-md p-1 text-app-muted opacity-0 transition hover:text-status-red focus-visible:opacity-100 [@media(hover:none)]:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteError(null);
                  setPendingDelete(row);
                }}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            ),
          },
        ]
      : []),
  ];

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await terminateInternalPlantResource(pendingDelete.id);
      if (state.status === 'ready' && state.page.items.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - INTERNAL_PLANT_PAGE_SIZE));
      }
      setPendingDelete(null);
      setRetryToken((n) => n + 1);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Falha ao excluir o recurso.');
    } finally {
      setDeleting(false);
    }
  };

  const refreshTree = () => {
    invalidateInternalPlantRoots();
    setTreeToken((n) => n + 1);
    setRetryToken((n) => n + 1);
  };

  const askRemoveSite = async (node: InternalPlantLocationNode) => {
    if (!node.refId) return;
    setSiteRemovalError(null);
    let blocking: string[] = [];
    try {
      const refs = await fetchSiteReferences(node.refId);
      blocking = refs.blocking ? describeSiteReferences(refs) : [];
    } catch {
      // Sem o impacto, a confirmação segue e o servidor ainda bloqueia com 409.
    }
    setPendingSiteRemoval({ id: node.refId, name: node.label, blocking });
  };

  const confirmRemoveSite = async () => {
    if (!pendingSiteRemoval) return;
    setRemovingSite(true);
    setSiteRemovalError(null);
    try {
      await retireSite(pendingSiteRemoval.id, 'Removido pela Planta Interna');
      if (context?.filter.siteId === pendingSiteRemoval.id) {
        setContext(null);
        setOffset(0);
      }
      setPendingSiteRemoval(null);
      refreshTree();
    } catch (cause) {
      setSiteRemovalError(
        cause instanceof SiteEditorApiError && cause.status === 409
          ? `${cause.message} O local foi mantido.`
          : cause instanceof Error
            ? cause.message
            : 'Falha ao remover o local.',
      );
    } finally {
      setRemovingSite(false);
    }
  };

  const confirm = (next: Context) => {
    setContext(next);
    setOffset(0);
    setDockOpen(false);
  };

  // Seleção exclusiva: escolher um município desfaz o Site selecionado e limpa a área de detalhes.
  const selectCity = (administrativeCityId: string | undefined) => {
    setSelectedCityId(administrativeCityId);
    if (administrativeCityId && context?.icon.kind === 'site') {
      setContext(null);
      setOffset(0);
    }
  };

  const selectSite = (node: InternalPlantLocationNode) => {
    if (!node.refId) return;
    setSelectedCityId(undefined);
    confirm({
      label: node.label,
      filter: { siteId: node.refId },
      icon: { kind: 'site' },
      key: node.refId,
    });
  };

  const selectType = (selection: TypeSelection) =>
    confirm({
      label: selection.label,
      filter: { resourceTypeIds: selection.resourceTypeIds },
      icon: { kind: 'type', resourceTypeCode: selection.resourceTypeCode },
      key: selection.key,
      leafTypeId: selection.leafResourceTypeId,
    });

  // Arrasto da divisória: pointer capture mantém o gesto mesmo se o cursor sair da alça.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = dockWidth;
    let latest = startWidth;
    handle.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      latest = clampDockWidth(startWidth + move.clientX - startX);
      setDockWidth(latest);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      storeDockWidth(latest);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  const resizeByKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = clampDockWidth(dockWidth + delta);
    setDockWidth(next);
    storeDockWidth(next);
  };

  // Aba ativa no estilo Google Maps: sem fundo, com barra sob o texto do nome.
  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center px-3 pt-3.5 text-[0.9rem] font-semibold transition ${
      active ? 'text-app-text' : 'text-app-muted hover:text-app-text'
    }`;
  const tabLabelClass = (active: boolean) =>
    `flex items-center gap-1.5 border-b-[3px] pb-2.5 ${
      active ? 'border-app-accent' : 'border-transparent'
    }`;

  return (
    <div className="relative flex h-full min-h-0 w-full bg-app-bg">
      {isMobile && dockOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[var(--z-overlay)] bg-[var(--scrim)]"
          onClick={() => setDockOpen(false)}
        />
      ) : null}
      <aside
        aria-label={isMobile ? 'Locais e tipos' : undefined}
        style={isMobile ? undefined : { width: dockWidth }}
        className={`flex h-full max-w-[80vw] shrink-0 flex-col border-r border-[var(--border-input-strong)] bg-app-panel ${DOCK_SEARCH_CLEARANCE_PT_CLASS} ${DOCK_ELEVATION_CLASS} ${
          isMobile
            ? dockOpen
              ? 'fixed inset-y-0 left-0 z-[var(--z-overlay)] w-[85vw]'
              : 'hidden'
            : ''
        }`}
      >
        <div
          role="tablist"
          aria-label="Navegação de Planta Interna"
          className="flex shrink-0 border-b border-[var(--border-input-strong)]"
          onKeyDown={(event) => {
            if (
              event.key !== 'ArrowLeft' &&
              event.key !== 'ArrowRight' &&
              event.key !== 'Home' &&
              event.key !== 'End'
            )
              return;
            event.preventDefault();
            const next: DockTab = tab === 'locations' ? 'types' : 'locations';
            const target: DockTab =
              event.key === 'Home' ? 'locations' : event.key === 'End' ? 'types' : next;
            setTab(target);
            document.getElementById(`internal-plant-tab-${target}`)?.focus();
          }}
        >
          <button
            type="button"
            role="tab"
            id="internal-plant-tab-locations"
            aria-controls="internal-plant-tabpanel"
            tabIndex={tab === 'locations' ? 0 : -1}
            aria-selected={tab === 'locations'}
            className={tabClass(tab === 'locations')}
            onClick={() => setTab('locations')}
          >
            <span className={tabLabelClass(tab === 'locations')}>
              <MapPin size={14} aria-hidden="true" />
              Locais
            </span>
          </button>
          <button
            type="button"
            role="tab"
            id="internal-plant-tab-types"
            aria-controls="internal-plant-tabpanel"
            tabIndex={tab === 'types' ? 0 : -1}
            aria-selected={tab === 'types'}
            className={tabClass(tab === 'types')}
            onClick={() => setTab('types')}
          >
            <span className={tabLabelClass(tab === 'types')}>
              <Layers size={14} aria-hidden="true" />
              Tipos
            </span>
          </button>
        </div>
        {isMobile ? null : (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar painel de hierarquia"
            aria-valuemin={INTERNAL_PLANT_DOCK_MIN_WIDTH}
            aria-valuemax={INTERNAL_PLANT_DOCK_MAX_WIDTH}
            aria-valuenow={dockWidth}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={resizeByKey}
            className="absolute inset-y-0 -right-1 z-[var(--z-sticky)] w-2 cursor-col-resize touch-none transition hover:bg-app-accent-soft focus-visible:bg-app-accent-soft focus-visible:outline-none"
          />
        )}
        <div
          role="tabpanel"
          id="internal-plant-tabpanel"
          aria-labelledby={`internal-plant-tab-${tab}`}
          className="relative min-h-0 flex-1"
        >
          {
            <>
              <button
                type="button"
                aria-label={
                  treeSearchOpen
                    ? 'Fechar pesquisa'
                    : tab === 'locations'
                      ? 'Pesquisar município ou UF'
                      : 'Pesquisar tipo'
                }
                aria-expanded={treeSearchOpen}
                title={tab === 'locations' ? 'Pesquisar município ou UF' : 'Pesquisar tipo'}
                className={`absolute top-2 z-10 flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--vt-yellow-light)] bg-[var(--vt-yellow-light)] text-[var(--text-primary)] transition hover:brightness-95 ${
                  canEdit && tab === 'locations' ? 'right-11' : 'right-3'
                }`}
                onClick={() => {
                  if (treeSearchOpen) setTreeQuery('');
                  setTreeSearchOpen(!treeSearchOpen);
                }}
              >
                <Search size={14} aria-hidden="true" />
              </button>
              <div
                aria-hidden={!treeSearchOpen}
                className={`absolute left-3 top-2 z-10 transition-all duration-300 ease-out ${
                  canEdit && tab === 'locations' ? 'right-[4.5rem]' : 'right-11'
                } ${treeSearchOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-4 opacity-0'}`}
              >
                <input
                  type="search"
                  value={treeQuery}
                  tabIndex={treeSearchOpen ? 0 : -1}
                  ref={treeInputRef}
                  onChange={(event) => setTreeQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setTreeQuery('');
                      setTreeSearchOpen(false);
                    }
                  }}
                  placeholder={
                    tab === 'locations' ? 'Município ou UF (ex.: Niterói, RJ)' : 'Tipo de recurso'
                  }
                  aria-label={tab === 'locations' ? 'Pesquisar município ou UF' : 'Pesquisar tipo'}
                  className="h-6 w-full rounded-lg border border-app-border bg-app-panel pl-2 pr-6 text-[0.8rem] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none text-app-text outline-none focus:!outline-none focus:border-[var(--vt-yellow)] focus-visible:!shadow-[0_0_0_1px_var(--vt-yellow)]"
                />
                {treeQuery ? (
                  <button
                    type="button"
                    aria-label="Limpar pesquisa"
                    tabIndex={treeSearchOpen ? 0 : -1}
                    className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-app-muted transition vt-hover-muted"
                    onClick={() => setTreeQuery('')}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </>
          }
          {canEdit && tab === 'locations' ? (
            <button
              type="button"
              aria-label="Novo local"
              title={
                selectedCityId
                  ? 'Novo local no município selecionado'
                  : 'Novo local (selecione um município para pré-preencher)'
              }
              className="absolute right-3 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--vt-yellow-light)] bg-[var(--vt-yellow-light)] text-[var(--text-primary)] transition hover:brightness-95"
              onClick={() =>
                setSiteEditor(selectedCityId ? { initialAdministrativeCityId: selectedCityId } : {})
              }
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          ) : null}
          <div
            className={`h-full min-h-0 transition-[padding] duration-300 ease-out ${
              treeSearchOpen ? 'pt-9' : 'pt-0'
            }`}
          >
            <OverlayScrollArea hostClassName="h-full min-h-0">
              {tab === 'locations' ? (
                <LocationTree
                  query={treeQuery}
                  onSelectSite={selectSite}
                  selectedSiteId={context?.filter.siteId}
                  canEdit={canEdit}
                  refreshToken={treeToken}
                  selectedCityId={selectedCityId}
                  onSelectCity={selectCity}
                  onEditSite={(node) => node.refId && setSiteEditor({ siteId: node.refId })}
                  onRemoveSite={(node) => void askRemoveSite(node)}
                />
              ) : (
                <TypeTree query={treeQuery} onSelect={selectType} selectedKey={context?.key} />
              )}
            </OverlayScrollArea>
          </div>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 overflow-auto px-6 pb-6 ${isMobile ? 'pt-[72px]' : 'pt-3'}`}>
        {isMobile ? (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={dockOpen}
            onClick={() => setDockOpen(true)}
          >
            <Layers size={16} aria-hidden="true" /> Locais e tipos
          </Button>
        ) : null}
        {context === null ? (
          <section aria-label="Planta Interna">
            <PageHead
              title="Planta Interna"
              subtitle="Inventário de recursos dentro das centrais e sites"
            />
            <EmptyState
              title="Selecione um local ou tipo"
              description="Pesquise um recurso ou escolha um Local ou Tipo na doca para listar o inventário."
            />
          </section>
        ) : (
          <section aria-label="Recursos" className="grid gap-0.5">
            <PageHead
              title={
                <span className="flex min-w-0 items-center gap-3">
                  <ContextTitleIcon icon={context.icon} />
                  <span className="truncate">{context.label}</span>
                </span>
              }
              marginBottom="12px"
              actions={
                canEdit && (context.leafTypeId || (context.icon.kind === 'site' && context.key)) ? (
                  <Button
                    variant="primary"
                    size="sm"
                    aria-label="Novo recurso"
                    title="Novo recurso"
                    onClick={() =>
                      setEditor(
                        context.leafTypeId
                          ? { typeId: context.leafTypeId }
                          : { initialPlace: { id: context.key!, name: context.label } },
                      )
                    }
                  >
                    <Plus size={16} aria-hidden="true" />
                  </Button>
                ) : undefined
              }
            />
            {state.status === 'error' ? (
              <div role="alert" className="grid justify-items-start gap-2 text-[0.92rem]">
                <p className="text-app-text">{state.message}</p>
                <Button variant="ghost" size="sm" onClick={() => setRetryToken((n) => n + 1)}>
                  Tentar novamente
                </Button>
              </div>
            ) : state.status === 'loading' || state.status === 'idle' ? (
              <p role="status" className="text-app-muted">
                Carregando recursos...
              </p>
            ) : (
              <>
                <DataTablePagination
                  navLabel="Paginação superior"
                  count={state.page.items.length}
                  total={state.page.total}
                  label="recursos"
                  offset={offset}
                  pageSize={INTERNAL_PLANT_PAGE_SIZE}
                  onOffsetChange={setOffset}
                />
                <DataTable
                  className="internal-plant-table"
                  columns={columns}
                  rows={state.page.items}
                  rowKey={(row) => `${row['@type']}:${row.id}`}
                  {...(canEdit
                    ? {
                        onRowClick: (row: InternalPlantResourceRow) =>
                          setEditor({ resourceId: row.id }),
                      }
                    : {})}
                  emptyMessage="Nenhum recurso encontrado."
                />
                <DataTablePagination
                  navLabel="Paginação inferior"
                  count={state.page.items.length}
                  total={state.page.total}
                  label="recursos"
                  offset={offset}
                  pageSize={INTERNAL_PLANT_PAGE_SIZE}
                  onOffsetChange={setOffset}
                />
              </>
            )}
          </section>
        )}
      </main>

      {canEdit && editor ? (
        <ResourceEditorModal
          resourceId={editor.resourceId}
          initialTypeId={editor.typeId}
          initialPlace={editor.initialPlace}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setRetryToken((n) => n + 1);
          }}
        />
      ) : null}
      {canEdit && siteEditor ? (
        <SiteEditorModal
          siteId={siteEditor.siteId}
          initialAdministrativeCityId={siteEditor.initialAdministrativeCityId}
          onClose={() => setSiteEditor(null)}
          onChanged={refreshTree}
        />
      ) : null}
      {pendingSiteRemoval ? (
        <Modal
          title="Remover local"
          onClose={() => (removingSite ? undefined : setPendingSiteRemoval(null))}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setPendingSiteRemoval(null)}
                disabled={removingSite}
              >
                {pendingSiteRemoval.blocking.length > 0 ? 'Fechar' : 'Cancelar'}
              </Button>
              {pendingSiteRemoval.blocking.length === 0 ? (
                <Button
                  variant="danger"
                  onClick={() => void confirmRemoveSite()}
                  disabled={removingSite}
                >
                  {removingSite ? 'Removendo...' : 'Remover'}
                </Button>
              ) : null}
            </>
          }
        >
          {pendingSiteRemoval.blocking.length > 0 ? (
            <>
              <p className="text-[0.92rem] text-app-text">
                &ldquo;{pendingSiteRemoval.name}&rdquo; não pode ser removido enquanto houver:
              </p>
              <ul className="mt-2 list-disc pl-5 text-[0.88rem] text-app-text">
                {pendingSiteRemoval.blocking.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[0.92rem] text-app-text">
              Remover &ldquo;{pendingSiteRemoval.name}&rdquo;? O local será encerrado (não é
              removido fisicamente).
            </p>
          )}
          {siteRemovalError ? (
            <p role="alert" className="mt-2 text-[0.85rem] text-status-red">
              {siteRemovalError}
            </p>
          ) : null}
        </Modal>
      ) : null}
      {pendingDelete ? (
        <Modal
          title="Encerrar recurso"
          onClose={() => (deleting ? undefined : setPendingDelete(null))}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => void confirmDelete()} disabled={deleting}>
                {deleting ? 'Encerrando...' : 'Encerrar'}
              </Button>
            </>
          }
        >
          <p className="text-[0.92rem] text-app-text">
            Encerrar &ldquo;{pendingDelete.name}&rdquo;? O recurso fica bloqueado e deixa de
            aparecer nas listas, mas o histórico é mantido (não é removido fisicamente).
          </p>
          {deleteError ? (
            <p role="alert" className="mt-2 text-[0.85rem] text-status-red">
              {deleteError}
            </p>
          ) : null}
        </Modal>
      ) : null}

      <InternalPlantSearchBar
        value={draft}
        onChange={setDraft}
        width={dockWidth - INTERNAL_PLANT_SEARCH_GUTTER * 2}
        onSubmit={(term) =>
          confirm({ label: `Busca: ${term}`, filter: { q: term }, icon: { kind: 'search' } })
        }
        onClear={() => {
          setDraft('');
          setContext(null);
          setOffset(0);
        }}
        isMobile={isMobile}
        onOpenMainMenu={onOpenMainMenu}
      />
    </div>
  );
}
