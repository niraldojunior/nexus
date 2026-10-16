import { useState } from 'react';
import { AlertCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Modal } from '../../../components/ui';

export function ResourceRelationshipRuleRetireModal({
  sourceName,
  relationshipName,
  targetName,
  retiring,
  error,
  onClose,
  onConfirm,
}: {
  sourceName: string;
  relationshipName: string;
  targetName: string;
  retiring: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setConfirmError(null);
    try {
      await onConfirm();
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : 'Falha ao inativar relação.');
    }
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-red-200 bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3>Inativar relação</h3>
            <p className="text-[0.78rem] text-app-muted">{relationshipName}</p>
          </div>
        </div>
      }
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={retiring}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="sm"
            iconLeft={<Trash2 className="h-4 w-4" />}
            loading={retiring}
            onClick={() => void handleConfirm()}
          >
            Confirmar inativação
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(error ?? confirmError) && (
          <div
            className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
            style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{confirmError ?? error}</span>
          </div>
        )}
        <p className="text-[0.88rem] leading-relaxed text-app-text">
          Você está prestes a inativar a regra <strong>{sourceName}</strong> →{' '}
          <strong>{relationshipName}</strong> → <strong>{targetName}</strong>.
        </p>
        <p className="text-[0.82rem] leading-relaxed text-app-muted">
          A regra deixará de estar disponível para novas configurações. Recursos e relações já
          existentes serão preservados; esta ação aplica uma inativação lógica.
        </p>
      </div>
    </Modal>
  );
}
