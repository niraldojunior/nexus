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
      className={`grid gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted ${
        fullWidth ? 'md:col-span-2' : ''
      }`}
    >
      {label}
      {children}
    </label>
  );
}
