import { useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { invalidateAllSiteChildren } from '../../hooks/useSiteChildren';
import {
  InternalPlantApiError,
  terminateInternalPlantResource,
} from '../../services/internalPlantApi';

export type TerminateResourceDialogProps = {
  resource: { id: string; name: string };
  onClose: () => void;
  onTerminated: () => void;
};

/**
 * Confirmação de encerramento (soft-terminate, C6) de um recurso, compartilhada entre a Planta
 * Interna e os painéis do mapa.
 */
export function TerminateResourceDialog({
  resource,
  onClose,
  onTerminated,
}: TerminateResourceDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasComponents, setHasComponents] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await terminateInternalPlantResource(resource.id, { cascade: hasComponents });
      invalidateAllSiteChildren();
      onTerminated();
    } catch (cause) {
      if (
        !hasComponents &&
        cause instanceof InternalPlantApiError &&
        cause.code === 'RESOURCE_HAS_ACTIVE_DEPENDENCIES'
      ) {
        setHasComponents(true);
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Falha ao excluir o recurso.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Encerrar recurso"
      onClose={() => (deleting ? undefined : onClose())}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={deleting}>
            {deleting ? 'Encerrando...' : 'Encerrar'}
          </Button>
        </>
      }
    >
      <p className="text-[0.92rem] text-app-text">
        {hasComponents
          ? `O recurso "${resource.name}" possui componentes internos. Tem certeza que deseja remover o recurso e todos os seus componentes internos?`
          : `Tem certeza que deseja remover o recurso "${resource.name}"?`}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] text-status-red">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
