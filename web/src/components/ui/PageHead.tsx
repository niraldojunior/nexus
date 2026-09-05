import type { ReactNode } from 'react';

/**
 * Cabeçalho de página do design system — porta de `docs/4-design-system/ui_kits/nexus/Shell.jsx`.
 * Vive dentro do conteúdo rolável (não há barra fixa): o título ocupa uma caixa de 48px
 * que alinha com a marca "Nexus" da sidebar. Sem ícone, sem busca, sem sino — isso
 * pertenceria a uma topbar real que este sistema não tem.
 */
export default function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 24,
        marginBottom: 'var(--space-5)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center' }}>
          <h1
            className="truncate text-app-text"
            style={{
              font: 'var(--text-h1)',
              letterSpacing: 'var(--tracking-snug)',
              lineHeight: 'var(--lh-tight)',
            }}
          >
            {title}
          </h1>
        </div>
        {subtitle && (
          <p
            className="mt-1"
            style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-tertiary)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, height: 48 }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
