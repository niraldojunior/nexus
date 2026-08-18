import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { GeoProject, GeoProjectDeleteSummary } from '../../services/geoProjectApi';
import { ProjectIcon } from './ProjectIcon';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';

export type ProjectListViewProps = {
  projects: GeoProject[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => Promise<GeoProjectDeleteSummary>;
};

/**
 * Conteúdo da aba Projetos do HierarchySidebar, no espírito do painel "Salvos" do Google
 * Maps: botão de criar no topo e a lista de projetos abaixo, cada um com ícone, nome,
 * volume de locais e um botão de excluir que aparece no hover.
 */
export function ProjectListView({
  projects,
  loading,
  onCreate,
  onOpen,
  onDelete,
}: ProjectListViewProps) {
  const [pendingDelete, setPendingDelete] = useState<GeoProject | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Some locais podem ter dependência ativa e ficar de fora (issue #58) — o projeto é
  // mantido íntegro nesse caso, e o usuário precisa saber por quê ele continua na lista.
  const [deleteNotice, setDeleteNotice] = useState<{
    projectName: string;
    message: string;
  } | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const summary = await onDelete(pendingDelete.id);
      setPendingDelete(null);
      if (!summary.deleted) {
        setDeleteNotice({
          projectName: pendingDelete.name,
          message:
            summary.blocked === 1
              ? '1 local não pôde ser encerrado (tem recurso, serviço ou sub-local ativo) — o projeto foi mantido.'
              : `${summary.blocked} locais não puderam ser encerrados (têm recurso, serviço ou sub-local ativo) — o projeto foi mantido.`,
        });
      }
    } catch {
      setDeleteNotice({
        projectName: pendingDelete.name,
        message: 'Não foi possível excluir o projeto. Tente novamente.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-3">
      <button type="button" onClick={onCreate} className="geo-btn primary w-full justify-center">
        <Plus className="h-4 w-4" />
        Novo Projeto
      </button>

      {loading && projects.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
          Carregando projetos…
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
          Nenhum projeto criado ainda.
        </div>
      ) : (
        <div className="grid gap-0.5">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group flex items-center gap-2 rounded-[12px] pr-1 transition hover:bg-app-accent-soft"
            >
              <button
                type="button"
                onClick={() => onOpen(project.id)}
                className="flex min-w-0 flex-1 items-center gap-3 py-1.5 pl-1.5 text-left"
              >
                <ProjectIcon iconDataUrl={project.iconDataUrl} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.86rem] font-semibold text-app-text">
                    {project.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[0.74rem] text-app-muted">
                    {project.siteCount === 1 ? '1 local' : `${project.siteCount} locais`}
                    <StatusBadge status={project.status} />
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(project)}
                title="Excluir projeto"
                aria-label={`Excluir projeto ${project.name}`}
                className="shrink-0 rounded-[8px] p-1.5 text-app-muted opacity-0 transition hover:bg-status-red-soft hover:text-status-red focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteNotice ? (
        <div className="rounded-[10px] border border-status-amber/30 bg-status-amber-soft px-2.5 py-2 text-[0.76rem] leading-snug text-app-text">
          <strong>{deleteNotice.projectName}</strong>: {deleteNotice.message}
        </div>
      ) : null}

      {pendingDelete ? (
        <Modal
          onClose={() => (deleting ? undefined : setPendingDelete(null))}
          title="Excluir projeto"
          eyebrow="Projetos"
        >
          <div className="grid gap-4">
            <p className="text-[0.9rem] leading-snug text-app-text">
              Excluir <strong>{pendingDelete.name}</strong>?{' '}
              {pendingDelete.siteCount === 1
                ? '1 local criado neste projeto será encerrado.'
                : `${pendingDelete.siteCount} locais criados neste projeto serão encerrados.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="geo-btn secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="geo-btn border-status-red/30 bg-status-red-soft text-status-red hover:brightness-95 disabled:opacity-60"
              >
                {deleting ? 'Encerrando locais…' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
