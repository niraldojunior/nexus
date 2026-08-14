// Marcas das duas fontes de endereço (Google Maps e GEONET/V.tal), compartilhadas pelo
// cabeçalho dos cards, pelo seletor de base e — como gêmeas de referência — pelos alfinetes
// do mapa (ver `addressSourcePin` em utils/siteIcon.ts, que replica estes paths em string SVG
// porque o Google Maps não renderiza React).

export function GoogleMapsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#34A853" d="M3 5.5 9.5 2v16.5L3 22V5.5Z" />
      <path fill="#4285F4" d="M9.5 2 16 5.5V22l-6.5-3.5V2Z" />
      <path fill="#FBBC04" d="M16 5.5 21 2.8v16.5L16 22V5.5Z" />
      <path
        fill="#EA4335"
        d="M12.75 7.1a3.35 3.35 0 0 0-3.35 3.35c0 2.52 3.35 6.3 3.35 6.3s3.35-3.78 3.35-6.3a3.35 3.35 0 0 0-3.35-3.35Zm0 4.6a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"
      />
    </svg>
  );
}

// Ícone genérico dos Correios para o card de DNE: envelope postal nas cores da marca (amarelo
// #FFF000 + azul #002F87). Não é a logomarca oficial — só um selo temático colorido.
export function CorreiosIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2.5" fill="#FFF000" />
      <path
        d="M3.5 7.5 12 13l8.5-5.5"
        fill="none"
        stroke="#002F87"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 16.5 9 12M20.5 16.5 15 12"
        fill="none"
        stroke="#002F87"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VtalIcon() {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-app-text"
      aria-hidden="true"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24">
        <path fill="white" d="M2.5 3h4.1L12 16.2 17.4 3h4.1L12 21 2.5 3Z" />
        <path fill="currentColor" className="text-app-accent" d="M21 15h2v3h-2z" />
      </svg>
    </span>
  );
}
