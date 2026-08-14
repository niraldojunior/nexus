import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, MoreVertical, Plus, Trash2 } from 'lucide-react';
import type { GeoProject } from '../../services/geoProjectApi';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import { ProjectIcon } from './ProjectIcon';
import { Modal } from './Modal';
import { NodeIcon } from './HierarchyTreeView';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import {
  BottomSheet,
  useSheetSnapCommand,
  type BottomSheetSnapState,
} from '../../components/BottomSheet';
import { DOCK_WIDTH_CLASS, DOCK_ELEVATION_CLASS, DOCK_SEARCH_CLEARANCE_PT_CLASS } from './dock';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea';
import { readProjectIcon, ProjectIconError } from '../../utils/projectIconImage';

export type ProjectDetailPanelProps = {
  isMobile: boolean;
  project: GeoProject;
  sites: GeoTreeNode[];
  sitesLoading: boolean;
  selectedSiteId?: string | null;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  minimizeSignal?: number;
  onUpdate: (patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl'>>) => void;
  onDelete: () => void;
  onBack: () => void;
  onAddSite: () => void;
  onOpenSite: (site: GeoTreeNode) => void;
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
  selectedSiteId,
  onSnapChange,
  minimizeSignal,
  onUpdate,
  onDelete,
  onBack,
  onAddSite,
  onOpenSite,
}: ProjectDetailPanelProps) {
  const { snapCommand } = useSheetSnapCommand(minimizeSignal);
  const [titleDraft, setTitleDraft] = useState(project.name);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const descriptionRef = useAutoResizeTextarea(descriptionDraft, 160);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Projeto trocado (não uma atualização de um `onUpdate` em curso): reabre os rascunhos a
  // partir do valor novo. Comparar só `project.id` evita que o próprio round-trip do PATCH
  // sobrescreva o que o usuário está digitando.
  useEffect(() => {
    setTitleDraft(project.name);
    setDescriptionDraft(project.description ?? '');
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
    <textarea
      ref={descriptionRef}
      value={descriptionDraft}
      onChange={(event) => setDescriptionDraft(event.target.value)}
      onBlur={commitDescription}
      placeholder="Adicione uma descrição para este projeto…"
      rows={1}
      aria-label="Descrição do projeto"
      className="-mx-1 w-full resize-none rounded-[8px] border border-transparent bg-transparent px-1 py-1 text-[0.84rem] leading-snug text-app-text outline-none transition placeholder:text-app-muted hover:border-app-border focus:border-app-accent-border focus:bg-white"
    />
  );

  const countLabel = (
    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
      {sites.length === 1 ? '1 local' : `${sites.length} locais`}
    </span>
  );

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
        <button
          key={site.id}
          type="button"
          onClick={() => onOpenSite(site)}
          className={`flex items-center gap-2 rounded-[10px] px-2 py-2 text-left transition ${
            selectedSiteId === site.refId ? 'bg-app-accent-soft' : 'hover:bg-app-accent-soft'
          }`}
        >
          <NodeIcon node={site} />
          <span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-app-text">
            {site.label}
          </span>
        </button>
      ))
    );

  const deleteConfirm = confirmDelete ? (
    <Modal onClose={() => setConfirmDelete(false)} title="Excluir projeto" eyebrow="Projetos">
      <div className="grid gap-4">
        <p className="text-[0.9rem] leading-snug text-app-text">
          Excluir <strong>{project.name}</strong>? Os locais criados neste projeto serão encerrados.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="geo-btn secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              onDelete();
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
          <div className="mt-3 border-t border-app-border pt-3">
            <div className="mb-1 flex items-center justify-between">{countLabel}</div>
            <div className="grid gap-0.5">
              {addSiteButton}
              {siteRows}
            </div>
          </div>
        </div>
        {deleteConfirm}
      </BottomSheet>
    );
  }

  return (
    <div
      className={`${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock ${DOCK_SEARCH_CLEARANCE_PT_CLASS}`}
    >
      {headerBlock}
      <div className="border-b border-app-border px-3 py-2">{descriptionBlock}</div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-3 pb-1 pt-3">{countLabel}</div>
        <OverlayScrollArea className="px-3 pb-3" hostClassName="min-h-0">
          <div className="grid gap-0.5">
            {addSiteButton}
            {siteRows}
          </div>
        </OverlayScrollArea>
      </div>
      {deleteConfirm}
    </div>
  );
}
