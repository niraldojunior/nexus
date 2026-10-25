import { CheckCircle2, Loader2 } from 'lucide-react';
import Diamond from '../Diamond';
import type {
  CopilotMessage,
  PendingConfirmation,
  PendingConfirmationItem,
} from './useCopilotConversation';

const LABELS: Record<string, { action: string; title: string }> = {
  delete_equipment_model: { action: 'Confirmar remoção', title: 'Remoção pendente' },
  create_equipment_models: { action: 'Confirmar cadastro', title: 'Cadastro em lote pendente' },
  create_equipment_model: { action: 'Confirmar cadastro', title: 'Cadastro pendente' },
  create_condominium: { action: 'Confirmar cadastro', title: 'Cadastro de condomínio pendente' },
  create_address: { action: 'Confirmar cadastro', title: 'Cadastro de endereço pendente' },
  create_site: { action: 'Confirmar cadastro', title: 'Cadastro de site pendente' },
  update_physical_resource: { action: 'Confirmar atualização', title: 'Atualização pendente' },
};

const actionLabel = (pending: PendingConfirmation): string =>
  LABELS[pending.operation ?? '']?.action ?? 'Confirmar operação';
const titleLabel = (pending: PendingConfirmation): string =>
  LABELS[pending.operation ?? '']?.title ?? 'Operação pendente';

const formatItem = (item: PendingConfirmationItem): string =>
  `${item.model} ${item.manufacturerName} ${item.equipmentType}`;

const parsePending = (confirmation: unknown): PendingConfirmation | undefined => {
  if (!confirmation || typeof confirmation !== 'object') return undefined;
  const record = confirmation as Record<string, unknown>;
  const token = record.confirmationToken;
  if (typeof token !== 'string' || !token.trim()) return undefined;

  return {
    confirmationToken: token,
    ...(typeof record.summary === 'string' ? { summary: record.summary } : {}),
    ...(typeof record.expiresAt === 'string' ? { expiresAt: record.expiresAt } : {}),
    ...(typeof record.domain === 'string' ? { domain: record.domain } : {}),
    ...(typeof record.operation === 'string' ? { operation: record.operation } : {}),
    ...(Array.isArray(record.items)
      ? {
          items: record.items
            .filter((item): item is PendingConfirmationItem => {
              if (!item || typeof item !== 'object') return false;
              const entry = item as Record<string, unknown>;
              return (
                typeof entry.model === 'string' &&
                typeof entry.manufacturerName === 'string' &&
                typeof entry.equipmentType === 'string'
              );
            })
            .map((item) => ({
              model: item.model,
              manufacturerName: item.manufacturerName,
              equipmentType: item.equipmentType,
            })),
        }
      : {}),
  };
};

export const readPendingConfirmations = (message: CopilotMessage): PendingConfirmation[] => {
  const confirmations = message.metadata?.pendingConfirmations;
  if (Array.isArray(confirmations)) {
    return confirmations
      .map(parsePending)
      .filter((item): item is PendingConfirmation => Boolean(item));
  }
  const legacy = parsePending(message.metadata?.pendingConfirmation);
  return legacy ? [legacy] : [];
};

type PendingConfirmationCardsProps = {
  message: CopilotMessage;
  resolvedTokens: Set<string>;
  confirmingToken: string | null;
  onConfirm: (message: CopilotMessage, pending: PendingConfirmation) => void;
};

/** Cartões "confirmar operação" do fluxo prepare → commit do Copilot. */
export function PendingConfirmationCards({
  message,
  resolvedTokens,
  confirmingToken,
  onConfirm,
}: PendingConfirmationCardsProps) {
  const pendingItems = readPendingConfirmations(message).filter(
    (pending) => !resolvedTokens.has(pending.confirmationToken),
  );
  if (pendingItems.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {pendingItems.map((pending) => {
        const isConfirming = confirmingToken === pending.confirmationToken;
        return (
          <div
            key={pending.confirmationToken}
            className="flex flex-wrap items-center justify-between gap-3 bg-app-panel px-4 py-3"
            style={{
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--vt-yellow)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div className="min-w-0">
              <div
                className="flex items-center gap-2 uppercase tracking-[0.08em]"
                style={{ font: 'var(--text-eyebrow)', color: 'var(--text-tertiary)' }}
              >
                <Diamond size={6} />
                {titleLabel(pending)}
              </div>
              <div
                className="mt-1"
                style={{
                  font: 'var(--fw-regular) var(--fs-body)/var(--lh-snug) var(--font-ui)',
                  color: 'var(--text-primary)',
                }}
              >
                {pending.summary ?? 'Confirme para concluir a operação.'}
              </div>
              {pending.items?.length ? (
                <div className="mt-3 space-y-2">
                  {pending.items.map((item) => (
                    <div
                      key={`${item.manufacturerName}-${item.equipmentType}-${item.model}`}
                      className="bg-app-bg px-3 py-2 text-[0.88rem] text-app-text"
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      {formatItem(item)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onConfirm(message, pending)}
              disabled={isConfirming}
              className="inline-flex items-center gap-2 px-4 py-2 text-[0.88rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: 'var(--vt-yellow)',
                color: 'var(--vt-ink)',
                border: '1px solid var(--vt-yellow)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {isConfirming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>{isConfirming ? 'Confirmando...' : actionLabel(pending)}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
