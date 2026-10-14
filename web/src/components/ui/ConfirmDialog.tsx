import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';

/**
 * V.tal Nexus — ConfirmDialog. Substitui `window.confirm` por um diálogo do design system,
 * com focus trap, Escape e retorno de foco herdados de `Modal`. Para uso imperativo
 * (`await confirm(...)`), veja `hooks/useConfirmDialog`.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message ? (
        <p className="text-app-muted" style={{ fontSize: 'var(--fs-body-lg)' }}>
          {message}
        </p>
      ) : null}
    </Modal>
  );
}
