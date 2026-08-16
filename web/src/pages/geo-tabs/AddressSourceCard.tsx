import type { ReactNode } from 'react';

// Card compartilhado pelas fontes de endereço (GEONET, Google Maps, DNE/Correios) — usado
// pela Visão geral do painel de Endereço (AddressDetailPanel) e pelo modal de edição de
// endereço do painel unificado de Local (SiteAddressModal). Extraído para os painéis
// renderizarem exatamente o mesmo cartão em vez de marcações quase-iguais divergindo com o tempo.
export function AddressSourceCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-[14px] border border-app-border p-3 shadow-sm ${tone}`}>
      <h4 className="mb-2 flex items-center gap-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        {icon}
        {title}
      </h4>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

const GEONET_PRECISION: Record<string, { quality: string; label: string; className: string }> = {
  'ENDEREÇO COMPLETO': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
  'ENDERECO COMPLETO': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
  'ENDEREÇO INTERPOLAÇÃO': {
    quality: 'Média',
    label: 'Endereço Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  'ENDERECO INTERPOLACAO': {
    quality: 'Média',
    label: 'Endereço Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  BAIRRO: {
    quality: 'Baixa',
    label: 'Ponto no Centro do Bairro',
    className: 'border-status-red/30 bg-status-red-soft text-status-red',
  },
  MUNICÍPIO: {
    quality: 'Baixa',
    label: 'Ponto no Centro do Município',
    className: 'border-status-red/30 bg-status-red-soft text-status-red',
  },
  MUNICIPIO: {
    quality: 'Baixa',
    label: 'Ponto no Centro do Município',
    className: 'border-status-red/30 bg-status-red-soft text-status-red',
  },
  'CEP + INTERPOLAÇÃO': {
    quality: 'Média',
    label: 'CEP + Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  'CEP + INTERPOLACAO': {
    quality: 'Média',
    label: 'CEP + Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  'CEP + NÚMERO DE PORTA': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
  'CEP + NUMERO DE PORTA': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
};

export function GeonetPrecisionBadge({ method }: { method?: string }) {
  const precision = method ? GEONET_PRECISION[method.trim().toUpperCase()] : undefined;
  const text = precision ? `${precision.quality} - ${precision.label}` : (method ?? 'Desconhecida');
  return (
    <span
      className={`inline-flex items-center rounded-[999px] border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.02em] ${precision?.className ?? 'border-app-border bg-app-sidebar text-app-muted'}`}
    >
      {text}
    </span>
  );
}
