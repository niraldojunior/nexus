import type { KeyboardEvent, ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

export type CharacteristicListRowProps = {
  name: string;
  typeLabel: string;
  group?: string | null;
  mandatory?: boolean;
  /** Metadados extras (ex.: "Padrão: X", "Ref: Y") renderizados abaixo do nome/tipo. */
  extraMeta?: ReactNode;
  /** Caixa de ícone à esquerda — só Papéis usa hoje; Locais não passa. */
  leadingIcon?: ReactNode;
  onClick?: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteTitle?: string;
  /** 'card' = cartão com borda própria (Papéis); 'row' = linha de lista com `divide-y` (Locais). */
  variant?: 'card' | 'row';
};

/**
 * Linha de característica compartilhada entre Studio > Papéis (`RoleCharacteristicsTab`) e
 * Studio > Locais (`LocationSpecDetail`) — as duas implementações eram quase idênticas
 * (nome + metadados + delete), divergindo só em formatação de texto e no slot de ícone.
 * `ResourceNodeDetail.tsx` tem seu próprio `CharacteristicListRow` privado e não usa este —
 * fora do escopo desta unificação.
 *
 * Formato do nome: `<name>` em negrito seguido de `(<typeLabel>)` em peso normal, na mesma linha
 * (substitui o antigo "Tipo: <type>" em linha separada). O botão de excluir só aparece no
 * hover/foco da linha (`group-hover:flex group-focus-within:flex`).
 */
export function CharacteristicListRow({
  name,
  typeLabel,
  group,
  mandatory,
  extraMeta,
  leadingIcon,
  onClick,
  onDelete,
  deleteDisabled,
  deleteTitle,
  variant = 'card',
}: CharacteristicListRowProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  const containerClass =
    variant === 'card'
      ? 'group flex items-center justify-between gap-3 rounded-[12px] border border-app-border bg-app-panel p-3 shadow-xs hover:border-app-accent/40'
      : 'group flex items-center justify-between gap-3 px-3.5 py-2.5 transition vt-hover-muted';

  return (
    <div
      className={containerClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
    >
      <div className={`flex min-w-0 flex-1 items-center gap-3 ${onClick ? 'cursor-pointer' : ''}`}>
        {leadingIcon}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate">
              <span className="font-bold text-app-text">{name}</span>{' '}
              <span className="font-normal text-app-muted">({typeLabel})</span>
            </span>
            {mandatory && (
              <span className="rounded bg-status-red-soft px-1.5 py-0.5 text-[0.68rem] font-medium text-status-red">
                Obrigatória
              </span>
            )}
            {group && (
              <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[0.68rem] text-app-muted">
                {group}
              </span>
            )}
          </div>
          {extraMeta}
        </div>
      </div>

      {onDelete && (
        <button
          type="button"
          title={deleteTitle ?? 'Remover característica'}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          disabled={deleteDisabled}
          className="hidden shrink-0 rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft disabled:opacity-50 group-hover:flex group-focus-within:flex"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
