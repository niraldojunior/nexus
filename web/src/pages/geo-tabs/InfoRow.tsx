import type { ReactNode } from 'react';

// Linha de campo dos painéis de detalhe (Site, Recurso, Endereço) — rótulo em coluna
// fixa e valor que quebra em vez de vazar horizontalmente. Extraído de GeoPage para
// ser reusado também pelo painel de consulta de endereço (AddressDetailPanel).
export function Info({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid min-w-0 grid-cols-[82px_minmax(0,1fr)] gap-x-3 py-2">
      <div className="min-w-0 break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.06em] text-app-muted">
        {label}
      </div>
      <div
        className={`min-w-0 max-w-full break-words text-[0.84rem] leading-snug text-app-text ${mono ? 'font-mono text-[0.78rem]' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}
