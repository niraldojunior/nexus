import type { ReactNode } from 'react';

// Primitivo de edição inline do painel unificado de Local (REQ-MOD01-016): o campo
// aparece como texto estático, e só vira um editor (o `children` de quem chama) quando o
// usuário clica em cima — Status vira uma combo, Local Pai vira um campo com autocomplete,
// sempre no mesmo padrão visual. `readOnlyNote`, quando presente, desativa o clique e
// mostra o motivo (ex.: "herdado do projeto X" enquanto o projeto está em curso, RN-007).
export function InlineEditRow({
  label,
  value,
  editing,
  onActivate,
  children,
  readOnlyNote,
}: {
  label: string;
  value: ReactNode;
  editing: boolean;
  onActivate: () => void;
  children?: ReactNode;
  readOnlyNote?: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[82px_minmax(0,1fr)] gap-x-3 py-2">
      <div className="min-w-0 break-words pt-1.5 text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.06em] text-app-muted [overflow-wrap:anywhere]">
        {label}
      </div>
      <div className="min-w-0">
        {editing ? (
          children
        ) : (
          <button
            type="button"
            onClick={readOnlyNote ? undefined : onActivate}
            disabled={Boolean(readOnlyNote)}
            aria-label={`Editar ${label}`}
            className="-mx-1.5 -my-1 flex w-full min-w-0 items-center rounded-[8px] px-1.5 py-1 text-left text-[0.84rem] leading-snug text-app-text outline-none transition [overflow-wrap:anywhere] hover:enabled:bg-app-accent-soft focus-visible:enabled:bg-app-accent-soft disabled:cursor-default"
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
