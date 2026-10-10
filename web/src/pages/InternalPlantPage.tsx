import { Layers, MapPin, Search } from 'lucide-react';
import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import EmptyState from '../components/EmptyState';
import { OverlayScrollArea } from '../components/OverlayScrollArea';
import { ResourceIcon } from '../components/ResourceIcon';
import Button from '../components/ui/Button';
import DataTable, { DataTablePagination, type DataTableColumn } from '../components/ui/DataTable';
import PageHead from '../components/ui/PageHead';
import { describeStatus } from '../components/ui/StatusPill';
import {
  INTERNAL_PLANT_PAGE_SIZE,
  useInternalPlantResources,
} from '../hooks/useInternalPlantResources';
import { useIsMobile } from '../hooks/useIsMobile';
import type {
  InternalPlantLocationNode,
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
import { LocationTree } from './internal-plant/LocationTree';
import { TypeTree, type TypeSelection } from './internal-plant/TypeTree';

type DockTab = 'locations' | 'types';

type ContextIcon = { kind: 'site' | 'type' | 'search'; resourceTypeCode?: string | undefined };

type Context = {
  label: string;
  filter: InternalPlantResourceFilter;
  icon: ContextIcon;
  key?: string;
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
    <span className="flex justify-center">
      <span
        role="img"
        aria-label={label}
        title={label}
        className={`inline-block h-2.5 w-2.5 rounded-full ${TONE_BG[tone]}`}
      />
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

const columns: DataTableColumn<InternalPlantResourceRow>[] = [
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
    render: (row) => <StatusLight status={row.status} />,
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
  const state = useInternalPlantResources(context?.filter ?? null, offset, retryToken);

  const confirm = (next: Context) => {
    setContext(next);
    setOffset(0);
  };

  const selectSite = (node: InternalPlantLocationNode) => {
    if (!node.refId) return;
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
      <aside
        style={{ width: dockWidth }}
        className={`flex h-full max-w-[80vw] shrink-0 flex-col border-r border-[var(--border-input-strong)] bg-white ${DOCK_SEARCH_CLEARANCE_PT_CLASS} ${DOCK_ELEVATION_CLASS} ${
          isMobile ? 'hidden' : ''
        }`}
      >
        <div
          role="tablist"
          aria-label="Navegação de Planta Interna"
          className="flex shrink-0 border-b border-[var(--border-input-strong)]"
        >
          <button
            type="button"
            role="tab"
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
            aria-selected={tab === 'types'}
            className={tabClass(tab === 'types')}
            onClick={() => setTab('types')}
          >
            <span className={tabLabelClass(tab === 'types')}>
              <Layers size={14} aria-hidden="true" />
              Tipo
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
            className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none transition hover:bg-app-accent-soft focus-visible:bg-app-accent-soft focus-visible:outline-none"
          />
        )}
        <OverlayScrollArea hostClassName="min-h-0 flex-1">
          {tab === 'locations' ? (
            <LocationTree onSelectSite={selectSite} selectedSiteId={context?.filter.siteId} />
          ) : (
            <TypeTree onSelect={selectType} selectedKey={context?.key} />
          )}
        </OverlayScrollArea>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto px-6 pb-6 pt-3">
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
                  emptyMessage="Nenhum recurso encontrado."
                />
                <DataTablePagination
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
