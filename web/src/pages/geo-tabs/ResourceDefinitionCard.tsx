import { Cpu, Factory, Boxes, Radio } from 'lucide-react';
import { IconInfoRow } from './IconInfoRow';

export type ResourceDefinitionCardProps = {
  path: string | null;
  resourceTypeName: string | null;
  specificationName: string | null;
  manufacturerName: string | null;
  canEdit?: boolean;
  onOpenEdit?: () => void;
};

export function ResourceDefinitionCard({
  path,
  resourceTypeName,
  specificationName,
  manufacturerName,
  canEdit = false,
  onOpenEdit,
}: ResourceDefinitionCardProps) {
  const content = (
    <div className="grid gap-0.5">
      <IconInfoRow icon={Radio} hint="Path" value={path ?? '—'} />
      <IconInfoRow icon={Boxes} hint="Tipo do recurso" value={resourceTypeName ?? '—'} />
      <IconInfoRow icon={Cpu} hint="Especificação" value={specificationName ?? '—'} />
      <IconInfoRow icon={Factory} hint="Fabricante" value={manufacturerName ?? '—'} />
    </div>
  );

  if (!canEdit) {
    return (
      <div className="min-w-0 rounded-[14px] border border-app-border bg-app-sidebar/70 p-3 shadow-sm">
        <div className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
          Definição do recurso
        </div>
        {content}
      </div>
    );
  }

  return (
    // `border-solid` é obrigatório aqui: index.css tem um reset global `button { border: 0 }`
    // que, por ser shorthand, zera border-style para `none` num <button> com especificidade
    // maior que o reset universal do Tailwind (`*,::before,::after`). As utilities `border`
    // (width) e `border-app-border` (color) não tocam em border-style, então sem
    // `border-solid` a borda fica com largura e cor corretas mas invisível — foi o que
    // deixou a borda cinza deste card sumir só na variante clicável (canEdit).
    <button
      type="button"
      onClick={onOpenEdit}
      aria-label="Editar definição do recurso"
      className="group min-w-0 w-full rounded-[14px] border border-solid border-app-border bg-app-sidebar/70 p-3 shadow-sm text-left transition hover:bg-app-accent-soft/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-accent/20 cursor-pointer"
    >
      <div className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        Definição do recurso
      </div>
      {content}
    </button>
  );
}
