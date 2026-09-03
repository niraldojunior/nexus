import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Boxes, ChevronLeft, Layers3, MapPinned, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react';
import {
  GeoProject,
  GeoProjectDeleteSummary,
  GeoProjectSiteCascade,
  ProjectArea,
  fetchProjectResources,
  listProjectStatusCatalog,
  searchProject,
  type GeoProjectStatusCatalogItem,
  createProjectResource,
} from '../../services/geoProjectApi';
import { loadResourceWorkspaceSnapshot, type PhysicalResourcePayload, type LogicalResourcePayload, type ResourceWorkspaceSnapshot } from '../../services/resourceApi';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import { ProjectIcon } from './ProjectIcon';
import { Modal } from './Modal';
import { NodeIcon } from './HierarchyTreeView';
import { StatusBadge } from './StatusBadge';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import {
  BottomSheet,
  useSheetSnapCommand,
  type BottomSheetSnapState,
} from '../../components/BottomSheet';
import { DOCK_WIDTH_CLASS, DOCK_ELEVATION_CLASS, DOCK_SEARCH_CLEARANCE_PT_CLASS } from './dock';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea';
import { readProjectIcon, ProjectIconError } from '../../utils/projectIconImage';
import { PROJECT_STATUS_OPTIONS } from '../../utils/geoLabels';
import { PanelBarButton } from './PanelBarButton';

const projectSearchCache = new Map<string, GeoTreeNode[]>();

// Dedupe do catálogo de status: o backend serializa requisições (AGENTS.md §3) e o painel
// refaz este GET a cada montagem — StrictMode monta duas vezes, e reabrir o mesmo projeto
// (fechar/abrir a doca) remonta o componente de novo. Mesmo padrão de useGeoProjects.ts.
let statusCatalogInFlight: Promise<GeoProjectStatusCatalogItem[]> | null = null;
const fetchStatusCatalogDeduped = (): Promise<GeoProjectStatusCatalogItem[]> => {
  if (!statusCatalogInFlight) {
    statusCatalogInFlight = listProjectStatusCatalog().finally(() => {
      statusCatalogInFlight = null;
    });
  }
  return statusCatalogInFlight;
};

export type ProjectDetailPanelProps = {
  isMobile: boolean;
  project: GeoProject;
  sites: GeoTreeNode[];
  sitesLoading: boolean;
  // Total real de locais do projeto, vindo do servidor (COUNT(*) OVER() em
  // GeoTreeService.projectSitePage) — o teto de 100 por página faz `sites.length` nunca
  // refletir o total de um projeto grande, com ou sem manchas geradas. Sem este prop, cai
  // para `sites.length` (compat).
  sitesTotal?: number;
  // Há mais locais além da página já carregada — mostra o botão "Carregar mais".
  hasMoreSites?: boolean;
  sitesLoadingMore?: boolean;
  onLoadMoreSites?: () => void;
  // Manchas de concentração/dispersão do projeto (REQ-MOD01-017), geradas por
  // scripts/build-project-areas.mjs — vazio quando o projeto não tem manchas ainda.
  areas?: ProjectArea[];
  selectedSiteId?: string | null;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  minimizeSignal?: number;
  // Gate de UI (inventory.editor/platform.admin) — sem ele, título/descrição/ícone/status
  // do projeto viram texto estático e os botões de criar/excluir (local, recurso, projeto)
  // somem.
  canEdit: boolean;
  onUpdate: (
    patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl' | 'status' | 'statusCode'>>,
  ) => Promise<{ siteCascade?: GeoProjectSiteCascade } | void>;
  onDelete: () => Promise<GeoProjectDeleteSummary>;
  onBack: () => void;
  onAddSite: () => void;
  addSiteDisabled?: boolean;
  // Descarta o painel de novo Local aberto ao lado — usado quando o usuário confirma a
  // troca de aba do painel de projeto com a criação de local em andamento.
  onDiscardNewSite?: () => void;
  onOpenSite: (site: GeoTreeNode) => void;
  onOpenResource?: (resource: GeoTreeNode) => void;
  onFocusArea?: (area: ProjectArea) => void;
  onRemoveSite: (site: GeoTreeNode) => void;
  onResourceCreated?: () => void;
};

/**
 * Painel de um Projeto de trabalho (REQ-MOD01-015), no espírito do painel "Salvos" do
 * Google Maps: título e descrição editáveis inline (sem botão salvar — o `onBlur` já grava),
 * ícone clicável para trocar a imagem, menu de excluir e a lista de locais do projeto com
 * scroll próprio. Mesma casca de doca dos demais painéis (AddressDetailPanel/GeoDetailPanel).
 */
export function ProjectDetailPanel({
  isMobile,
  project,
  sites,
  sitesLoading,
  sitesTotal,
  hasMoreSites = false,
  sitesLoadingMore = false,
  onLoadMoreSites,
  areas = [],
  selectedSiteId,
  onSnapChange,
  minimizeSignal,
  canEdit,
  onUpdate,
  onDelete,
  onBack,
  onAddSite,
  addSiteDisabled = false,
  onDiscardNewSite,
  onOpenSite,
  onOpenResource,
  onFocusArea,
  onRemoveSite,
  onResourceCreated,
}: ProjectDetailPanelProps) {
  const { snapCommand } = useSheetSnapCommand(minimizeSignal);
  const [titleDraft, setTitleDraft] = useState(project.name);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [pendingRemoveSite, setPendingRemoveSite] = useState<GeoTreeNode | null>(null);
  // Aviso de cascata parcial (PATCH de status que mudou o projeto, mas alguns Sites não
  // seguiram por causa de SITE_STATUS_TRANSITIONS) — some ao trocar de status de novo.
  const [cascadeSkipped, setCascadeSkipped] = useState<number | null>(null);
  const [statusCatalog, setStatusCatalog] = useState<GeoProjectStatusCatalogItem[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'sites' | 'infrastructure' | 'resources' | 'coverage'>('sites');
  const [resources, setResources] = useState<GeoTreeNode[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourceReloadToken, setResourceReloadToken] = useState(0);
  const [createResourceMode, setCreateResourceMode] = useState<'infrastructure' | 'resources' | null>(null);
  const [pendingTab, setPendingTab] = useState<'sites' | 'infrastructure' | 'resources' | 'coverage' | null>(null);
  const [searchMode, setSearchMode] = useState<'sites' | 'infrastructure' | 'resources' | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoTreeNode[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Local bloqueado (dependência ativa) mantém o projeto vivo em vez de sumir (issue #58) —
  // o painel precisa dizer por que ele continua aberto, em vez de fechar silenciosamente.
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const descriptionRef = useAutoResizeTextarea(descriptionDraft, 160);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Projeto trocado (não uma atualização de um `onUpdate` em curso): reabre os rascunhos a
  // partir do valor novo. Comparar só `project.id` evita que o próprio round-trip do PATCH
  // sobrescreva o que o usuário está digitando.
  useEffect(() => {
    setTitleDraft(project.name);
    setDescriptionDraft(project.description ?? '');
    setCascadeSkipped(null);
    setDeleteNotice(null);
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    void fetchStatusCatalogDeduped()
      .then((items) => { if (!cancelled) setStatusCatalog(items); })
      .catch(() => { if (!cancelled) setStatusCatalog([]); });
    return () => { cancelled = true; };
  }, []);

  const commitTitle = () => {
    const next = titleDraft.trim() || 'Projeto sem título';
    setTitleDraft(next);
    if (next !== project.name) onUpdate({ name: next });
  };

  const commitDescription = () => {
    const next = descriptionDraft.trim();
    if (next !== (project.description ?? '')) onUpdate({ description: next || null });
  };

  const handleStatusChange = async (statusCode: string) => {
    setCascadeSkipped(null);
    const result = await onUpdate({ statusCode });
    setCascadeSkipped(
      result?.siteCascade && result.siteCascade.skipped > 0 ? result.siteCascade.skipped : null,
    );
  };

  useEffect(() => {
    if (tab !== 'resources' && tab !== 'infrastructure') return;
    let stale = false;
    setResourcesLoading(true);
    void fetchProjectResources(project.id, { view: tab === 'infrastructure' ? 'infrastructure' : 'all' })
      .then((page) => { if (!stale) setResources(page.items); })
      .finally(() => { if (!stale) setResourcesLoading(false); });
    return () => { stale = true; };
  }, [project.id, tab, resourceReloadToken]);

  useEffect(() => {
    const term = query.trim();
    if (!searchMode || term.length < 2) {
      setResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    const cacheKey = `${project.id}:${searchMode}:${term.toLocaleLowerCase()}`;
    const cached = projectSearchCache.get(cacheKey);
    if (cached) setResults(cached);
    else {
      // Reaproveita imediatamente as sugestões do prefixo anterior enquanto a busca precisa
      // chega: o cache contém apenas itens deste projeto.
      const prefixRows = [...projectSearchCache.entries()]
        .filter(([key]) => key.startsWith(`${project.id}:${searchMode}:`) && term.toLocaleLowerCase().startsWith(key.split(':').slice(2).join(':')))
        .sort((left, right) => right[0].length - left[0].length)[0]?.[1];
      if (prefixRows) setResults(prefixRows.filter((item) => `${item.label} ${item.sublabel ?? ''} ${item.resourceType ?? ''}`.toLocaleLowerCase().includes(term.toLocaleLowerCase())));
    }
    const controller = new AbortController();
    setSearchLoading(!cached);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void searchProject(project.id, term, 0, controller.signal, searchMode)
        .then((page) => {
          projectSearchCache.set(cacheKey, page.items);
          setResults(page.items);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setSearchError('Não foi possível pesquisar os itens do projeto.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 80);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [project.id, query, searchMode]);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const summary = await onDelete();
      setConfirmDelete(false);
      if (!summary.archived && !summary.deleted) {
        setDeleteNotice(
          summary.blocked === 1
            ? '1 local não pôde ser encerrado (tem recurso, serviço ou sub-local ativo) — o projeto foi mantido.'
            : `${summary.blocked} locais não puderam ser encerrados (têm recurso, serviço ou sub-local ativo) — o projeto foi mantido.`,
        );
      }
    } catch {
      setDeleteNotice('Não foi possível excluir o projeto. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleInputRef.current?.blur();
    } else if (event.key === 'Escape') {
      setTitleDraft(project.name);
      titleInputRef.current?.blur();
    }
  };

  const handleIconFile = async (file: File) => {
    setIconError(null);
    try {
      const iconDataUrl = await readProjectIcon(file);
      onUpdate({ iconDataUrl });
    } catch (err) {
      setIconError(
        err instanceof ProjectIconError ? err.message : 'Não foi possível carregar a imagem.',
      );
    }
  };

  const headerBlock = (
    <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center border-t border-app-border px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Voltar para Projetos"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 items-center justify-center gap-2">
      <ProjectIcon
        iconDataUrl={project.iconDataUrl}
        size={44}
        onChangeFile={canEdit ? handleIconFile : undefined}
        label="Alterar ícone do projeto"
      />
      <div className="min-w-0 max-w-[220px] flex-1">
        {canEdit ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            aria-label="Nome do projeto"
            className="-mx-1 w-full rounded-[8px] border border-transparent bg-transparent px-1 py-1 font-display text-[1.02rem] font-semibold leading-tight text-app-text outline-none transition hover:border-app-border focus:border-app-accent-border focus:bg-white"
          />
        ) : (
          <p className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text">
            {project.name}
          </p>
        )}
        {iconError ? <p className="mt-1 text-[0.72rem] text-status-red">{iconError}</p> : null}
      </div>
      </div>
      {canEdit ? (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
            aria-label="Mais opções do projeto"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-[12px] border border-app-border bg-white py-1 shadow-soft"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.84rem] font-medium text-status-red transition hover:bg-status-red-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir projeto
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div aria-hidden="true" />
      )}
    </div>
  );

  const descriptionBlock = (
    <div className="flex items-start gap-2">
      {canEdit ? (
        <textarea
          ref={descriptionRef}
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          onBlur={commitDescription}
          placeholder="Adicione uma descrição para este projeto…"
          rows={1}
          aria-label="Descrição do projeto"
          className="-mx-1 w-full flex-1 resize-none rounded-[8px] border border-transparent bg-transparent px-1 py-1 text-[0.84rem] leading-snug text-app-text outline-none transition placeholder:text-app-muted hover:border-app-border focus:border-app-accent-border focus:bg-white"
        />
      ) : (
        <p className="-mx-1 w-full flex-1 break-words px-1 py-1 text-[0.84rem] leading-snug text-app-text">
          {descriptionDraft.trim() || '—'}
        </p>
      )}
      {/* Projeto terminado não volta (RF-010): a combo de troca de status some — os
          locais já foram liberados (viraram Ativo, vida própria) e o projeto passa a
          ser só um registro histórico. */}
      {project.status === 'terminated' || !canEdit ? (
        <div className="flex h-8 shrink-0 items-center">
          <StatusBadge status={project.status} />
        </div>
      ) : (
        <select
          value={project.statusCode ?? (project.status === 'planned' ? '11' : project.status === 'active' ? '22' : project.status === 'suspended' ? '23' : project.status === 'cancelled' ? 'legacy-cancelled' : '17')}
          onChange={(event) => void handleStatusChange(event.target.value)}
          aria-label="Status do projeto"
          className="h-8 shrink-0 rounded-[10px] border border-app-border bg-white px-2 text-[0.76rem] font-semibold text-app-text outline-none transition hover:border-app-accent-border focus:border-app-accent-border"
        >
          {(statusCatalog.length > 0
            ? statusCatalog.filter((option) => option.active || option.code === project.statusCode)
            : PROJECT_STATUS_OPTIONS.map((option) => ({
                code: option.value === 'planned' ? '11' : option.value === 'active' ? '22' : option.value === 'suspended' ? '23' : option.value === 'cancelled' ? 'legacy-cancelled' : '17',
                name: option.label,
                active: true,
              })))
            .map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  // Todo local herda o status do projeto (não é editável por local) — quando a cascata do
  // último PATCH não conseguiu levar todos os locais junto (SITE_STATUS_TRANSITIONS), o
  // painel avisa quantos ficaram para trás.
  const cascadeNotice =
    cascadeSkipped !== null ? (
      <div className="rounded-[10px] border border-status-amber/30 bg-status-amber-soft px-2.5 py-2 text-[0.76rem] leading-snug text-app-text">
        {cascadeSkipped === 1
          ? '1 local não pôde seguir para o novo status.'
          : `${cascadeSkipped} locais não puderam seguir para o novo status.`}
      </div>
    ) : null;

  const deleteNoticeBlock = deleteNotice ? (
    <div className="rounded-[10px] border border-status-amber/30 bg-status-amber-soft px-2.5 py-2 text-[0.76rem] leading-snug text-app-text">
      {deleteNotice}
    </div>
  ) : null;

  // `sites` é sempre uma PÁGINA (teto de 100 por vez, ver GET /v1/geo/projects/:id/sites em
  // app.ts) — o total real vem do servidor via `sitesTotal`, nunca de `sites.length`.
  const totalCount = sitesTotal ?? sites.length;
  const countLabel = (
    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
      {totalCount === 1 ? '1 local' : `${totalCount} locais`}
      {sites.length < totalCount ? ` (mostrando ${sites.length})` : ''}
    </span>
  );


  const addSiteButton = canEdit ? (
    <button
      type="button"
      onClick={onAddSite}
      disabled={addSiteDisabled}
      className="geo-btn primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Plus className="h-4 w-4" />
      Adicionar Local
    </button>
  ) : null;

  const siteRows =
    sitesLoading && sites.length === 0 ? (
      <div className="px-2 py-3 text-[0.82rem] text-app-muted">Carregando locais…</div>
    ) : sites.length === 0 ? (
      <div className="px-2 py-3 text-[0.82rem] text-app-muted">
        Nenhum local neste projeto ainda.
      </div>
    ) : (
      sites.map((site) => (
        <div
          key={site.id}
          className={`group flex items-center gap-1 rounded-[10px] pr-1 transition ${
            selectedSiteId === site.refId ? 'bg-app-accent-soft' : 'hover:bg-app-accent-soft'
          }`}
        >
          <button
            type="button"
            onClick={() => onOpenSite(site)}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
          >
            <NodeIcon node={site} />
            <span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-app-text">
              {site.label}
            </span>
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setPendingRemoveSite(site)}
              title="Excluir local"
              aria-label={`Excluir local ${site.label}`}
              className="shrink-0 rounded-[8px] p-1.5 text-app-muted opacity-0 transition hover:bg-status-red-soft hover:text-status-red focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))
    );

  // Mesmo padrão de "Carregar mais" da Hierarquia (HierarchyTreeView/useGeoTree.loadMore):
  // reabre a próxima página a partir do offset já carregado — nunca refaz a lista inteira.
  const loadMoreSitesButton =
    hasMoreSites && sites.length > 0 ? (
      <button
        type="button"
        onClick={onLoadMoreSites}
        disabled={sitesLoadingMore}
        className="flex items-center gap-1.5 rounded-[10px] px-2 py-2 text-left text-[0.78rem] font-semibold text-app-muted transition hover:bg-app-accent-soft disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        Carregar mais ({Math.max(0, totalCount - sites.length).toLocaleString('pt-BR')})
      </button>
    ) : null;

  const tabBar = (
    <div className="flex flex-wrap gap-1 border-b border-app-border px-3 py-2" role="tablist" aria-label="Conteúdo do projeto">
      {([
        ['sites', 'Locais', MapPinned], ['infrastructure', 'Infraestrutura', Layers3], ['resources', 'Recursos', Boxes], ['coverage', 'Cobertura', MapPinned],
      ] as const).map(([value, label, icon]) => (
        <PanelBarButton key={value} icon={icon} label={label} active={tab === value} onClick={() => { if (value === tab) return; if (createResourceMode || addSiteDisabled) setPendingTab(value); else setTab(value); }} ariaLabel={label} />
      ))}
    </div>
  );
  const addResourceButton = (mode: 'infrastructure' | 'resources') =>
    canEdit ? (
      <button type="button" onClick={() => setCreateResourceMode(mode)} disabled={Boolean(createResourceMode) || project.status === 'terminated' || project.status === 'cancelled'} className="geo-btn primary mb-2 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60">
        <Plus className="h-4 w-4" />
        {mode === 'infrastructure' ? 'Criar infraestrutura' : 'Criar recurso'}
      </button>
    ) : null;

  const resourceRows = resourcesLoading ? <p className="px-2 py-3 text-[0.82rem] text-app-muted">Carregando recursos…</p>
    : resources.length === 0 ? <p className="px-2 py-3 text-[0.82rem] text-app-muted">Nenhum recurso nesta visão.</p>
    : resources.map((resource) => <button key={resource.id} type="button" onClick={() => onOpenResource?.(resource)} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left hover:bg-app-accent-soft">
      <NodeIcon node={resource} /><span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-app-text">{resource.label}</span><span className="text-[0.68rem] text-app-muted">{resource.referredType === 'LogicalResource' ? 'Lógico' : resource.resourceType ?? 'Físico'}</span>
    </button>);

  const coverageRows = areas.length === 0 ? <p className="px-2 py-3 text-[0.82rem] text-app-muted">Nenhuma mancha de cobertura gerada.</p>
    : areas.slice().sort((left, right) => (right.siteCount + (right.resourceCount ?? 0)) - (left.siteCount + (left.resourceCount ?? 0))).map((area) => <button key={area.id} type="button" onClick={() => onFocusArea?.(area)} className="grid w-full grid-cols-[1fr_auto] gap-x-2 rounded-[10px] px-2 py-2 text-left hover:bg-app-accent-soft">
      <span className="text-[0.84rem] font-medium text-app-text">{area.kind === 'concentration' ? 'Concentração' : 'Dispersão'}</span>
      <span className="text-[0.72rem] text-app-muted">{area.areaKm2?.toFixed(2) ?? '—'} km²</span>
      <span className="text-[0.72rem] text-app-muted">{area.siteCount} locais · {area.resourceCount} recursos</span>
    </button>);

  const searchRows = query.trim().length < 2 ? null
    : searchLoading && results.length === 0 ? <p className="px-2 py-3 text-[0.82rem] text-app-muted">Pesquisando…</p>
    : searchError ? <p className="px-2 py-3 text-[0.82rem] text-status-red">{searchError}</p>
    : results.length === 0 ? <p className="px-2 py-3 text-[0.82rem] text-app-muted">Nenhum resultado neste projeto.</p>
    : results.map((item) => <button key={item.id} type="button" onClick={() => item.kind === 'site' ? onOpenSite(item) : onOpenResource?.(item)} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left hover:bg-app-accent-soft"><NodeIcon node={item} /><span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-app-text">{item.label}</span><span className="text-[0.68rem] text-app-muted">{item.kind === 'site' ? 'Local' : 'Recurso'}</span></button>);

  const searchActions = (scope: 'sites' | 'infrastructure' | 'resources', add: ReactNode) => (
    <div className="mb-2 flex gap-2">
      {searchMode === scope ? (
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar neste projeto" className="h-10 min-w-0 flex-1 rounded-[10px] border border-app-border bg-white px-3 text-[0.82rem] outline-none focus:border-app-accent-border" />
      ) : add}
      <button type="button" onClick={() => { if (searchMode === scope) { setSearchMode(null); setQuery(''); } else { setSearchMode(scope); setQuery(''); } }} aria-pressed={searchMode === scope} className="geo-btn secondary h-10 justify-center px-3">
        <Search className="h-4 w-4" />
        Pesquisar
      </button>
    </div>
  );
  const tabContent = tab === 'sites' ? <><div className="mb-1 flex items-center justify-between">{countLabel}</div>{searchActions('sites', addSiteButton)}<div className="grid gap-0.5">{searchMode === 'sites' && query.trim().length >= 2 ? searchRows : <>{siteRows}{loadMoreSitesButton}</>}</div></>
    : tab === 'coverage' ? <div className="grid gap-0.5">{coverageRows}</div>
    : <div className="grid gap-0.5"><div className="mb-1 flex items-center justify-between"><span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{tab === 'infrastructure' ? `${project.infrastructureCount ?? 0} itens de infraestrutura` : `${project.resourceCount ?? 0} recursos`}</span></div>{searchActions(tab, addResourceButton(tab))}{searchMode === tab && query.trim().length >= 2 ? searchRows : resourceRows}</div>;

  const deleteConfirm = confirmDelete ? (
    <Modal
      onClose={() => (deleting ? undefined : setConfirmDelete(false))}
      title="Excluir projeto"
      eyebrow="Projetos"
    >
      <div className="grid gap-4">
        <p className="text-[0.9rem] leading-snug text-app-text">
          Excluir <strong>{project.name}</strong>?{' '}
          {project.siteCount === 1
            ? '1 local criado neste projeto será encerrado.'
            : `${project.siteCount} locais criados neste projeto serão encerrados.`}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
            className="geo-btn secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmDelete()}
            disabled={deleting}
            className="geo-btn border-status-red/30 bg-status-red-soft text-status-red hover:brightness-95 disabled:opacity-60"
          >
            {deleting ? 'Encerrando locais…' : 'Excluir'}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  const removeSiteConfirm = pendingRemoveSite ? (
    <Modal onClose={() => setPendingRemoveSite(null)} title="Excluir local" eyebrow="Projetos">
      <div className="grid gap-4">
        <p className="text-[0.9rem] leading-snug text-app-text">
          Excluir <strong>{pendingRemoveSite.label}</strong> deste projeto? O local será encerrado.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingRemoveSite(null)}
            className="geo-btn secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onRemoveSite(pendingRemoveSite);
              setPendingRemoveSite(null);
            }}
            className="geo-btn border-status-red/30 bg-status-red-soft text-status-red hover:brightness-95"
          >
            Excluir
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  const tabChangeConfirm = pendingTab ? (
    <Modal onClose={() => setPendingTab(null)} title={addSiteDisabled ? 'Descartar novo local' : 'Descartar novo recurso'} eyebrow="Projeto">
      <div className="grid gap-4">
        <p className="text-[0.9rem] text-app-text">
          {addSiteDisabled
            ? 'Ao trocar de aba, o novo local será perdido. Tem certeza?'
            : `Ao trocar de aba, o novo ${createResourceMode === 'infrastructure' ? 'item de infraestrutura' : 'recurso'} será descartado.`}
        </p>
        <div className="flex justify-end gap-2"><button type="button" className="geo-btn secondary" onClick={() => setPendingTab(null)}>Cancelar</button><button type="button" className="geo-btn border-status-red/30 bg-status-red-soft text-status-red" onClick={() => { if (addSiteDisabled) onDiscardNewSite?.(); else setCreateResourceMode(null); setTab(pendingTab); setPendingTab(null); }}>Descartar</button></div>
      </div>
    </Modal>
  ) : null;

  if (isMobile) {
    return (
      <BottomSheet onClose={onBack} onSnapChange={onSnapChange} snapCommand={snapCommand}>
        {headerBlock}
        {/* `overflow-hidden` nos dois eixos: quem rola aqui é o próprio BottomSheet, não um
            filho — um scroll interno roubaria o gesto touch da folha. */}
        <div className="min-w-0 overflow-hidden px-4 py-3">
          {descriptionBlock}
          {cascadeNotice ? <div className="mt-2">{cascadeNotice}</div> : null}
          {deleteNoticeBlock ? <div className="mt-2">{deleteNoticeBlock}</div> : null}
          <div className="mt-3 border-t border-app-border pt-2">{tabBar}<div className="pt-3">{tabContent}</div></div>
        </div>
        {deleteConfirm}
        {removeSiteConfirm}
        {tabChangeConfirm}
        {createResourceMode ? <ProjectResourceModal projectId={project.id} mode={createResourceMode} isMobile onClose={() => setCreateResourceMode(null)} onCreated={() => { projectSearchCache.clear(); setResourceReloadToken((value) => value + 1); onResourceCreated?.(); }} /> : null}
      </BottomSheet>
    );
  }

  return (
    <>
      <div
        className={`${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock ${DOCK_SEARCH_CLEARANCE_PT_CLASS}`}
      >
        {headerBlock}
        <div className="grid gap-2 border-b border-app-border px-3 py-2">
          {descriptionBlock}
          {cascadeNotice}
          {deleteNoticeBlock}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {tabBar}
          <OverlayScrollArea className="px-3 pb-3" hostClassName="min-h-0">
            <div className="grid gap-0.5 pt-3">{tabContent}</div>
          </OverlayScrollArea>
        </div>
        {deleteConfirm}
        {removeSiteConfirm}
        {tabChangeConfirm}
      </div>
      {/* Sibling flex item (não `fixed`) — fica ao lado do painel de projeto, como o
          SitePanel de "novo local", em vez de colado na borda direita do mapa. */}
      {createResourceMode ? <ProjectResourceModal projectId={project.id} mode={createResourceMode} isMobile={false} onClose={() => setCreateResourceMode(null)} onCreated={() => { projectSearchCache.clear(); setResourceReloadToken((value) => value + 1); onResourceCreated?.(); }} /> : null}
    </>
  );
}

function ProjectResourceModal({ projectId, mode, isMobile, onClose, onCreated }: { projectId: string; mode: 'infrastructure' | 'resources'; isMobile: boolean; onClose: () => void; onCreated: () => void }) {
  const [snapshot, setSnapshot] = useState<ResourceWorkspaceSnapshot | null>(null);
  const [kind, setKind] = useState<'PhysicalResource' | 'LogicalResource'>('PhysicalResource');
  const [category, setCategory] = useState(mode === 'infrastructure' ? 'Infrastructure.Passive' : '');
  const [name, setName] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [specificationId, setSpecificationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = Boolean(name.trim() || resourceType || specificationId || (mode === 'resources' && (category || kind !== 'PhysicalResource')));
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };

  useEffect(() => { void loadResourceWorkspaceSnapshot({ tab: 'PhysicalResource', limit: 100, offset: 0 }).then(setSnapshot).catch(() => setError('Não foi possível carregar o catálogo.')); }, []);
  const types = snapshot?.resourceTypes.filter((item) => item.categoryCode === category && item.status === 'active') ?? [];
  const specs = snapshot?.resourceSpecificationOptions.filter((item) => item.category === category && (!resourceType || item.resourceType === resourceType)) ?? [];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !specificationId) return;
    setSaving(true); setError(null);
    try {
      const payload: PhysicalResourcePayload | LogicalResourcePayload = kind === 'PhysicalResource'
        ? { '@type': 'PhysicalResource', name: name.trim(), resourceSpecificationId: specificationId }
        : { '@type': 'LogicalResource', name: name.trim(), resourceSpecificationId: specificationId };
      await createProjectResource(projectId, payload);
      onCreated(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o recurso.'); }
    finally { setSaving(false); }
  };
  const wrapperClassName = isMobile
    ? 'fixed inset-y-0 right-0 z-[70] flex w-[396px] max-w-full flex-col border-l border-app-border bg-app-panel shadow-dock'
    : `${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock`;
  return <aside className={wrapperClassName} aria-label={mode === 'infrastructure' ? 'Novo item de infraestrutura' : 'Novo recurso'}>
    <div className="flex items-center justify-between border-b border-app-border px-4 py-3"><div><p className="text-[0.7rem] font-semibold uppercase tracking-[.1em] text-app-muted">Projeto</p><h2 className="font-display text-[1.05rem] font-semibold text-app-text">{mode === 'infrastructure' ? 'Criar infraestrutura' : 'Criar recurso'}</h2></div><button type="button" onClick={requestClose} className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft" aria-label="Fechar novo recurso"><X className="h-4 w-4"/></button></div>
    <form onSubmit={submit} className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
      {mode === 'resources' ? <label className="grid gap-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">Classe<select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setSpecificationId(''); }} className="geo-input"><option value="PhysicalResource">Recurso físico</option><option value="LogicalResource">Recurso lógico</option></select></label> : null}
      <label className="grid gap-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">Categoria<select value={category} onChange={(event) => { setCategory(event.target.value); setResourceType(''); setSpecificationId(''); }} disabled={mode === 'infrastructure'} className="geo-input"><option value="">Selecione uma categoria</option>{snapshot?.resourceCategories.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">Nome<input required value={name} onChange={(event) => setName(event.target.value)} className="geo-input" /></label>
      <label className="grid gap-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">Tipo<select required value={resourceType} onChange={(event) => { setResourceType(event.target.value); setSpecificationId(''); }} className="geo-input"><option value="">Selecione um tipo</option>{types.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">Modelo<select required value={specificationId} onChange={(event) => setSpecificationId(event.target.value)} className="geo-input"><option value="">Selecione um modelo</option>{specs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {error ? <p className="text-[0.8rem] text-status-red">{error}</p> : null}
      <div className="flex justify-end gap-2"><button type="button" onClick={requestClose} className="geo-btn secondary">Cancelar</button><button type="submit" disabled={saving || !snapshot} className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Criando…' : 'Criar'}</button></div>
    </form>
    {confirmDiscard ? <Modal onClose={() => setConfirmDiscard(false)} title="Descartar novo recurso" eyebrow="Projeto"><div className="grid gap-4"><p className="text-[0.9rem] text-app-text">Há campos preenchidos. Deseja descartar o novo recurso?</p><div className="flex justify-end gap-2"><button type="button" className="geo-btn secondary" onClick={() => setConfirmDiscard(false)}>Cancelar</button><button type="button" className="geo-btn border-status-red/30 bg-status-red-soft text-status-red" onClick={onClose}>Descartar</button></div></div></Modal> : null}
  </aside>;
}
