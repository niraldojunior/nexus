import type { LucideIcon } from 'lucide-react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

// Linha de campo compacta, com ícone no lugar do rótulo de texto — o nome do
// campo vira `title` (hint nativo do navegador) em vez de ocupar uma coluna
// fixa. Usado no painel de Endereço (só leitura, poucos campos) para deixar a
// leitura mais limpa; Site e Recurso seguem com `Info` (rótulo em texto), que
// tem mais campos e se beneficia do rótulo sempre visível. `icon` aceita também um elemento
// pronto (ex.: SiteIdentityIcon, a identidade visual do local referenciado).
function GlyphIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-[18px] w-[18px]" />;
}

export function IconInfoRow({
  icon,
  hint,
  value,
  mono,
}: {
  icon: LucideIcon | ReactElement;
  hint: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="flex min-h-[var(--geo-row-content-h,32px)] min-w-0 items-center gap-2.5 py-1"
      title={hint}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-app-muted shadow-none ring-0"
        aria-hidden="true"
      >
        {isValidElement(icon) ? icon : <GlyphIcon icon={icon as LucideIcon} />}
      </span>
      <span className="sr-only">{hint}</span>
      <span
        className={`min-w-0 max-w-full flex-1 break-words [overflow-wrap:anywhere] text-[0.84rem] leading-snug text-app-text ${mono ? 'font-mono text-[0.78rem]' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
