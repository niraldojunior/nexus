import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Primitivo de edição inline do painel unificado de Local (REQ-MOD01-016): o campo
// aparece como texto estático, e só vira um editor (o `children` de quem chama) quando o
// usuário clica em cima — Status vira uma combo, Local Pai vira um campo com autocomplete,
// sempre no mesmo padrão visual. `readOnlyNote`, quando presente, desativa o clique e
// mostra o motivo (ex.: "herdado do projeto X" enquanto o projeto está em curso, RN-007).
export function InlineEditRow({
  label,
  icon: Icon,
  value,
  editing,
  onActivate,
  children,
  readOnlyNote,
}: {
  label: string;
  icon?: LucideIcon;
  value: ReactNode;
  editing: boolean;
  onActivate: () => void;
  children?: ReactNode;
  readOnlyNote?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 py-1" title={Icon ? label : undefined}>
      {Icon ? (
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted" aria-hidden="true">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : (
        <div className="min-w-0 basis-[82px] break-words pt-1.5 text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.06em] text-app-muted">
          {label}
        </div>
      )}
      {Icon ? <span className="sr-only">{label}</span> : null}
      <div className="min-w-0 flex-1">
        {editing ? (
          children
        ) : (
          <button
            type="button"
            onClick={readOnlyNote ? undefined : onActivate}
            disabled={Boolean(readOnlyNote)}
            aria-label={`Editar ${label}`}
            className="-mx-1.5 -my-1 flex w-full min-w-0 items-center rounded-[8px] px-1.5 py-1 text-left text-[0.84rem] leading-snug text-app-text outline-none transition hover:enabled:bg-app-accent-soft focus-visible:enabled:bg-app-accent-soft disabled:cursor-default"
          >
            <span className="min-w-0 flex-1 break-words">{value}</span>
          </button>
        )}
        {readOnlyNote ? (
          <p className="mt-0.5 px-1.5 text-[0.72rem] leading-snug text-app-muted">{readOnlyNote}</p>
        ) : null}
      </div>
    </div>
  );
}
