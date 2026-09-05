import type { ReactNode } from 'react';

/** Rótulo + controle num grid de formulário. Compartilhado pelos modais de Resource e Service. */
export default function Field({
  label,
  children,
  fullWidth,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <label
      className={`grid gap-2 ${fullWidth ? 'md:col-span-2' : ''}`}
      style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}
    >
      {label}
      {children}
    </label>
  );
}
