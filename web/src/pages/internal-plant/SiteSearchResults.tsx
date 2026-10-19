import { ListTree, MapPin, Pencil, Search } from 'lucide-react';
import Button from '../../components/ui/Button';
import DataTable, {
  DataTablePagination,
  type DataTableColumn,
} from '../../components/ui/DataTable';
import PageHead from '../../components/ui/PageHead';
import { describeStatus } from '../../components/ui/StatusPill';
import {
  INTERNAL_PLANT_SITES_PAGE_SIZE,
  type InternalPlantSitesState,
} from '../../hooks/useInternalPlantSites';
import { useVisualIdentityPreviewUrl } from '../../hooks/useVisualIdentityPreviewUrl';
import type { InternalPlantSiteRow } from '../../services/internalPlantApi';
import {
  STUDIO_GEO_CUSTOM_ICON_COLOR,
  STUDIO_GEO_NEUTRAL_ICON_COLOR,
} from '../../utils/studioGeoDefaults';

const TONE_BG: Record<string, string> = {
  green: 'bg-status-green',
  blue: 'bg-status-blue',
  amber: 'bg-status-amber',
  red: 'bg-status-red',
  purple: 'bg-status-purple',
  neutral: 'bg-app-muted',
};

function SiteRowIcon({ row }: { row: InternalPlantSiteRow }) {
  const previewUrl = useVisualIdentityPreviewUrl(row.visualIdentity, 18, {
    shape: 'none',
    color: STUDIO_GEO_NEUTRAL_ICON_COLOR,
    assetColor: STUDIO_GEO_CUSTOM_ICON_COLOR,
  });
  return previewUrl ? (
    <img src={previewUrl} alt="" aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
  ) : (
    <MapPin size={16} aria-hidden="true" className="shrink-0 text-app-muted" />
  );
}

function SiteStatus({ status }: { status: string }) {
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

const actionButtonClass =
  'rounded-md p-1 text-app-muted transition hover:text-app-text focus-visible:opacity-100';

type Props = {
  term: string;
  state: InternalPlantSitesState;
  offset: number;
  onOffsetChange: (offset: number) => void;
  onRetry: () => void;
  canEdit: boolean;
  onOpenTree: (row: InternalPlantSiteRow) => void;
  onEdit: (row: InternalPlantSiteRow) => void;
};

/** Resultado da busca por Locais: lista paginada com as ações "Abrir na árvore" e "Editar local". */
export function SiteSearchResults({
  term,
  state,
  offset,
  onOffsetChange,
  onRetry,
  canEdit,
  onOpenTree,
  onEdit,
}: Props) {
  const columns: DataTableColumn<InternalPlantSiteRow>[] = [
    {
      key: 'icon',
      header: <span className="sr-only">Ícone</span>,
      cellClassName: 'w-10',
      render: (row) => <SiteRowIcon row={row} />,
    },
    { key: 'name', header: 'Nome', render: (row) => row.name },
    { key: 'type', header: 'Tipo', render: (row) => row.siteSpecification.name },
    { key: 'address', header: 'Endereço', render: (row) => row.address ?? '—' },
    { key: 'stateOrProvince', header: 'UF', render: (row) => row.stateOrProvince ?? '—' },
    { key: 'city', header: 'Cidade', render: (row) => row.city ?? '—' },
    {
      key: 'status',
      header: <div className="text-center">Status</div>,
      render: (row) => <SiteStatus status={row.status} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Ações</span>,
      cellClassName: 'w-20',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            aria-label={`Abrir ${row.name} na árvore`}
            title="Abrir na árvore"
            className={actionButtonClass}
            onClick={(event) => {
              event.stopPropagation();
              onOpenTree(row);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <ListTree size={16} aria-hidden="true" />
          </button>
          {canEdit ? (
            <button
              type="button"
              aria-label={`Editar ${row.name}`}
              title="Editar local"
              className={actionButtonClass}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(row);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <section aria-label="Locais" className="grid min-w-0 w-full gap-0.5">
      <PageHead
        title={
          <span className="flex min-w-0 w-full items-center gap-3">
            <Search size={22} aria-hidden="true" className="shrink-0 text-app-muted" />
            <span className="min-w-0 truncate" title={`Busca: ${term}`}>
              Busca: {term}
            </span>
          </span>
        }
        marginBottom="8px"
      />
      {state.status === 'error' ? (
        <div role="alert" className="grid justify-items-start gap-2 text-[0.92rem]">
          <p className="text-app-text">{state.message}</p>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      ) : state.status === 'loading' || state.status === 'idle' ? (
        <p role="status" className="text-app-muted">
          Carregando locais...
        </p>
      ) : (
        <>
          <DataTablePagination
            navLabel="Paginação superior"
            count={state.page.items.length}
            total={state.page.total}
            label="locais"
            offset={offset}
            pageSize={INTERNAL_PLANT_SITES_PAGE_SIZE}
            onOffsetChange={onOffsetChange}
          />
          <DataTable
            className="internal-plant-table"
            columns={columns}
            rows={state.page.items}
            rowKey={(row) => row.id}
            onRowClick={onOpenTree}
            emptyMessage="Nenhum local encontrado."
          />
          <DataTablePagination
            navLabel="Paginação inferior"
            count={state.page.items.length}
            total={state.page.total}
            label="locais"
            offset={offset}
            pageSize={INTERNAL_PLANT_SITES_PAGE_SIZE}
            onOffsetChange={onOffsetChange}
          />
        </>
      )}
    </section>
  );
}
