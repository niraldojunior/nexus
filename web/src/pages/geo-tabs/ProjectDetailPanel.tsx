import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, MoreVertical, Plus, Trash2 } from 'lucide-react';
import type {
  GeoProject,
  GeoProjectDeleteSummary,
  GeoProjectSiteCascade,
  ProjectArea,
} from '../../services/geoProjectApi';
import type { GeoStatus } from '../../services/geoApi';
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

export type ProjectDetailPanelProps = {
  isMobile: boolean;
  project: GeoProject;
  sites: GeoTreeNode[];
  sitesLoading: boolean;
  // Manchas de concentração/dispersão do projeto (REQ-MOD01-017), geradas por
  // scripts/build-project-areas.mjs — vazio quando o projeto não tem manchas ainda. Quando
  // presentes, `sites` é só uma PÁGINA (o total real é `project.siteCount`).
  areas?: ProjectArea[];
  selectedSiteId?: string | null;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  minimizeSignal?: number;
  onUpdate: (
    patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl' | 'status'>>,
  ) => Promise<{ siteCascade?: GeoProjectSiteCascade } | void>;
  onDelete: () => Promise<GeoProjectDeleteSummary>;
  onBack: () => void;
  onAddSite: () => void;
  onOpenSite: (site: GeoTreeNode) => void;
  onRemoveSite: (site: GeoTreeNode) => void;
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
  areas = [],
  selectedSiteId,
  onSnapChange,
  minimizeSignal,
  onUpdate,
  onDelete,
  onBack,
  onAddSite,
  onOpenSite,
  onRemoveSite,
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
  const [deleting, setDeleting] = useState(false);
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

  const commitTitle = () => {
    const next = titleDraft.trim() || 'Projeto sem título';
    setTitleDraft(next);
    if (next !== project.name) onUpdate({ name: next });
  };

  const commitDescription = () => {
    const next = descriptionDraft.trim();
    if (next !== (project.description ?? '')) onUpdate({ description: next || null });
  };

  const handleStatusChange = async (status: GeoStatus) => {
    setCascadeSkipped(null);
    const result = await onUpdate({ status });
    setCascadeSkipped(
      result?.siteCascade && result.siteCascade.skipped > 0 ? result.siteCascade.skipped : null,
    );
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const summary = await onDelete();
      setConfirmDelete(false);
      if (!summary.deleted) {
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
    <div className="flex items-start gap-2 border-t border-app-border px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Voltar para Projetos"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <ProjectIcon
        iconDataUrl={project.iconDataUrl}
        size={44}
        onChangeFile={handleIconFile}
        label="Alterar ícone do projeto"
      />
      <div className="min-w-0 flex-1">
        <input
          ref={titleInputRef}
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={handleTitleKeyDown}
          aria-label="Nome do projeto"
          className="-mx-1 w-full rounded-[8px] border border-transparent bg-transparent px-1 py-1 font-display text-[1.02rem] font-semibold leading-tight text-app-text outline-none transition hover:border-app-border focus:border-app-accent-border focus:bg-white"
        />
        {iconError ? <p className="mt-1 text-[0.72rem] text-status-red">{iconError}</p> : null}
      </div>
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
    </div>
  );

  const descriptionBlock = (
    <div className="flex items-start gap-2">
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
      {/* Projeto terminado não volta (RF-010): a combo de troca de status some — os
          locais já foram liberados (viraram Ativo, vida própria) e o projeto passa a
          ser só um registro histórico. */}
      {project.status === 'terminated' ? (
        <div className="flex h-8 shrink-0 items-center">
          <StatusBadge status={project.status} />
        </div>
      ) : (
        <select
          value={project.status}
          onChange={(event) => void handleStatusChange(event.target.value as GeoStatus)}
          aria-label="Status do projeto"
          className="h-8 shrink-0 rounded-[10px] border border-app-border bg-white px-2 text-[0.76rem] font-semibold text-app-text outline-none transition hover:border-app-accent-border focus:border-app-accent-border"
        >
          {PROJECT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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

  // Com manchas geradas (REQ-MOD01-017), `sites` é só uma página — o total real é
  // `project.siteCount`; sem manchas, os dois coincidem (lista completa, como sempre).
  const hasAreas = areas.length > 0;
  const totalCount = hasAreas ? project.siteCount : sites.length;
  const countLabel = (
    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
      {totalCount === 1 ? '1 local' : `${totalCount} locais`}
      {hasAreas && sites.length < totalCount ? ` (mostrando ${sites.length})` : ''}
    </span>
  );

  const concentrationCount = areas.filter((area) => area.kind === 'concentration').length;
  const dispersionCount = areas.filter((area) => area.kind === 'dispersion').length;
  const areasSummary = hasAreas ? (
    <div className="px-3 pb-1 text-[0.76rem] text-app-muted">
      {concentrationCount === 1 ? '1 concentração' : `${concentrationCount} concentrações`}
      {' · '}
      {dispersionCount === 1 ? '1 dispersão' : `${dispersionCount} dispersões`}
    </div>
  ) : null;

  const addSiteButton = (
    <button type="button" onClick={onAddSite} className="geo-btn primary w-full justify-center">
      <Plus className="h-4 w-4" />
      Adicionar Local
    </button>
  );

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
          <button
            type="button"
            onClick={() => setPendingRemoveSite(site)}
            title="Excluir local"
            aria-label={`Excluir local ${site.label}`}
            className="shrink-0 rounded-[8px] p-1.5 text-app-muted opacity-0 transition hover:bg-status-red-soft hover:text-status-red focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))
    );

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
          <div className="mt-3 border-t border-app-border pt-3">
            <div className="mb-1 flex items-center justify-between">{countLabel}</div>
            {areasSummary}
            <div className="grid gap-0.5">
              {addSiteButton}
              {siteRows}
            </div>
          </div>
        </div>
        {deleteConfirm}
        {removeSiteConfirm}
      </BottomSheet>
    );
  }

  return (
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
        <div className="px-3 pb-1 pt-3">{countLabel}</div>
        {areasSummary}
        <OverlayScrollArea className="px-3 pb-3" hostClassName="min-h-0">
          <div className="grid gap-0.5">
            {addSiteButton}
            {siteRows}
          </div>
        </OverlayScrollArea>
      </div>
      {deleteConfirm}
      {removeSiteConfirm}
    </div>
  );
}
