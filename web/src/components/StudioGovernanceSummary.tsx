import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, RotateCcw, Send } from 'lucide-react';
import {
  discardStudioDraft,
  getStudioStatus,
  publishStudioDraft,
  saveStudioDraft,
  validateStudioDraft,
  type StudioDomain,
  type StudioStatus,
  type StudioValidationIssue,
} from '../services/studioApi';
import { Button, Modal } from './ui';

export type StudioGovernanceSummaryProps = {
  domain: StudioDomain;
  canEdit: boolean;
  canAdmin: boolean;
  /** Notifica o pai sempre que o modo de edição (existência de um draft aberto) mudar. */
  onEditingChange?: (editing: boolean) => void;
};

type ModalErrorState = {
  title: string;
  message?: string;
  issues?: StudioValidationIssue[];
};

const formatDateTime = (value?: string): string => {
  if (!value) return 'Ainda não publicado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

export function StudioGovernanceSummary({
  domain,
  canEdit,
  canAdmin,
  onEditingChange,
}: StudioGovernanceSummaryProps) {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'edit' | 'publish' | 'cancel' | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<ModalErrorState | null>(null);

  const loadStatus = async () => {
    setFetchError(null);
    try {
      const next = await getStudioStatus(domain);
      setStatus(next);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar versão');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void loadStatus();
  }, [domain]);

  const draft = status?.draftVersion;
  const published = status?.publishedVersion;
  const editing = Boolean(draft);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  const handleEdit = async () => {
    setBusy('edit');
    try {
      await saveStudioDraft(domain, {});
      await loadStatus();
    } catch (err) {
      setModalError({
        title: 'Erro ao iniciar edição',
        message: err instanceof Error ? err.message : 'Não foi possível criar o draft.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!draft) return;
    setBusy('cancel');
    try {
      await discardStudioDraft(domain, draft.checksum);
      await loadStatus();
    } catch (err) {
      setModalError({
        title: 'Erro ao cancelar edição',
        message: err instanceof Error ? err.message : 'Não foi possível descartar o draft.',
      });
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async () => {
    if (!draft) return;
    setBusy('publish');
    try {
      // 1. Valida o draft — sem botão "Validar" separado no fluxo; a validação ocorre
      //    automaticamente dentro do clique de publicação.
      const validation = await validateStudioDraft(domain);
      if (!validation.valid) {
        setModalError({
          title: 'Impedimentos na validação',
          issues: validation.issues,
        });
        await loadStatus();
        return;
      }

      // 2. Busca o status atualizado para obter o checksum mais recente (o backend atualiza a
      //    versão persistindo o resultado da validação, o que pode alterar o checksum).
      const freshStatus = await getStudioStatus(domain);
      const freshDraft = freshStatus.draftVersion;
      if (!freshDraft) {
        throw new Error('Draft não encontrado após a validação.');
      }

      // 3. Publica com o checksum fresco
      await publishStudioDraft(domain, freshDraft.checksum);
      await loadStatus();
    } catch (err) {
      setModalError({
        title: 'Erro ao publicar',
        message: err instanceof Error ? err.message : 'Não foi possível publicar a versão.',
      });
      await loadStatus();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[0.82rem] text-app-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Carregando...</span>
      </div>
    );
  }

  if (fetchError && !status) {
    return (
      <div className="flex items-center gap-2 text-[0.82rem] text-red-600">
        <AlertTriangle className="h-4 w-4" />
        <span>{fetchError}</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-[0.78rem] font-semibold text-app-text">
            {editing
              ? `Draft v${draft?.versionNumber}`
              : published
                ? `v${published.versionNumber} publicado`
                : 'Sem versão publicada'}
          </p>
          <p className="text-[0.72rem] text-app-muted">
            {editing
              ? `Alterado ${formatDateTime(draft?.createdAt)}`
              : published
                ? formatDateTime(published.publishedAt)
                : '—'}
          </p>
        </div>

        {!editing && canEdit ? (
          <Button
            size="sm"
            variant="secondary"
            iconLeft={
              busy === 'edit' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pencil className="h-3.5 w-3.5" />
              )
            }
            onClick={handleEdit}
            disabled={busy !== null}
          >
            Editar
          </Button>
        ) : null}

        {editing && canAdmin ? (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              iconLeft={
                busy === 'cancel' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )
              }
              onClick={handleCancel}
              disabled={busy !== null}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              iconLeft={
                busy === 'publish' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )
              }
              onClick={handlePublish}
              disabled={busy !== null}
            >
              Publicar
            </Button>
          </div>
        ) : null}
      </div>

      {modalError ? (
        <Modal
          title={modalError.title}
          onClose={() => setModalError(null)}
          footer={
            <Button size="sm" variant="secondary" onClick={() => setModalError(null)}>
              Fechar
            </Button>
          }
        >
          {modalError.issues && modalError.issues.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[0.85rem] text-app-muted">
                Resolva os impedimentos abaixo antes de publicar esta versão:
              </p>
              <ul className="space-y-1.5 rounded-lg border border-app-border bg-app-panel p-3 text-[0.82rem] text-app-text">
                {modalError.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="flex items-start gap-2">
                    <AlertTriangle
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'
                      }`}
                    />
                    <span>
                      {issue.message}
                      {issue.path ? (
                        <span className="text-app-muted"> ({issue.path})</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : modalError.message ? (
            <p className="text-[0.85rem] text-app-text">{modalError.message}</p>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
