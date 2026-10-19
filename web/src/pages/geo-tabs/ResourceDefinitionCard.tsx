import { Cpu, Factory, Boxes, Radio } from 'lucide-react';
import { IconInfoRow } from './IconInfoRow';

export type ResourceDefinitionCardProps = {
  path: string | null;
  resourceTypeName: string | null;
  specificationName: string | null;
  manufacturerName: string | null;
};

export function ResourceDefinitionCard({
  path,
  resourceTypeName,
  specificationName,
  manufacturerName,
}: ResourceDefinitionCardProps) {
  const content = (
    <div className="grid gap-0.5">
      <IconInfoRow icon={Radio} hint="Path" value={path ?? '—'} />
      <IconInfoRow icon={Boxes} hint="Tipo do recurso" value={resourceTypeName ?? '—'} />
      <IconInfoRow icon={Cpu} hint="Especificação" value={specificationName ?? '—'} />
      <IconInfoRow icon={Factory} hint="Fabricante" value={manufacturerName ?? '—'} />
    </div>
  );

  return (
    <div className="min-w-0 rounded-[14px] border border-app-border bg-app-sidebar/70 p-3 shadow-sm">
      <div className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        Definição do recurso
      </div>
      {content}
    </div>
  );
}
