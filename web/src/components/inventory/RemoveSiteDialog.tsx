import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import {
  fetchSiteReferences,
  retireSite,
  SiteEditorApiError,
  type SiteReferences,
} from '../../services/siteEditorApi';

export function describeSiteReferences(refs: SiteReferences): string[] {
  const items: Array<[number, string]> = [
    [refs.activeChildSiteCount, 'locais internos ativos'],
    [refs.activeRelationshipCount, 'relações ativas'],
    [refs.activeResourceCount, 'recursos ativos'],
    [refs.activeServiceCount, 'serviços ativos'],
    [refs.activeOrderCount, 'ordens em andamento'],
  ];
  return items.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
}

export type RemoveSiteDialogProps = {
  site: { id: string; name: string };
  /** Motivo registrado no histórico do Site (ex.: "Removido pela Planta Interna"). */
  statusReason: string;
  onClose: () => void;
  onRemoved: () => void;
};

/**
 * Confirmação de remoção (soft-retire, C6) de um Site, compartilhada entre a Planta Interna e os
 * painéis do mapa. Consulta o impacto antes de oferecer "Remover"; se o impacto falhar, a
 * confirmação segue e o servidor ainda bloqueia com 409.
 */
export function RemoveSiteDialog({
  site,
  statusReason,
  onClose,
  onRemoved,
}: RemoveSiteDialogProps) {
  const [blocking, setBlocking] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSiteReferences(site.id)
      .then((refs) => {
        if (active) setBlocking(refs.blocking ? describeSiteReferences(refs) : []);
      })
      .catch(() => {
        if (active) setBlocking([]);
      });
    return () => {
      active = false;
    };
  }, [site.id]);

  const confirm = async () => {
    setRemoving(true);
    setError(null);
    try {
      await retireSite(site.id, statusReason);
      onRemoved();
    } catch (cause) {
      setError(
        cause instanceof SiteEditorApiError && cause.status === 409
          ? `${cause.message} O local foi mantido.`
          : cause instanceof Error
            ? cause.message
            : 'Falha ao remover o local.',
      );
    } finally {
      setRemoving(false);
    }
  };

  const isBlocked = (blocking?.length ?? 0) > 0;

  return (
    <Modal
      title="Remover local"
      onClose={() => (removing ? undefined : onClose())}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={removing}>
            {isBlocked ? 'Fechar' : 'Cancelar'}
          </Button>
          {!isBlocked ? (
            <Button
              variant="danger"
              onClick={() => void confirm()}
              disabled={removing || blocking === null}
            >
              {removing ? 'Removendo...' : 'Remover'}
            </Button>
          ) : null}
        </>
      }
    >
      {blocking === null ? (
        <p className="text-[0.92rem] text-app-muted">Verificando referências…</p>
      ) : isBlocked ? (
        <>
          <p className="text-[0.92rem] text-app-text">
            &ldquo;{site.name}&rdquo; não pode ser removido enquanto houver:
          </p>
          <ul className="mt-2 list-disc pl-5 text-[0.88rem] text-app-text">
            {blocking.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[0.92rem] text-app-text">
          Tem certeza que deseja remover o local &ldquo;{site.name}&rdquo;?
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[0.85rem] text-status-red">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
