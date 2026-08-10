// Ícone da hierarquia usado no controle de abrir/fechar a árvore na barra de pesquisa
// (ver GeoSearchBar). Um desenho próprio, colorido, no lugar do glifo monocromático da
// lucide: um nó pai (âmbar) com dois filhos indentados (ink) ligados pelos galhos — lê
// como "lista em árvore" à primeira vista.
//
// Cores literais mirroring os tokens do design system (app-accent `#FFD200`, app-ink
// `#243041`) — mesmo padrão de NexusMark e resourceIcon.ts: SVG de marca/ícone não lê
// variável CSS, então trazemos o valor do token.
export function HierarchyIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Galhos: tronco vertical + duas hastes até os filhos */}
      <path
        d="M6.5 8 V18 M6.5 12 H10.5 M6.5 18 H10.5"
        stroke="#243041"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Nó raiz (item pai) — barra âmbar cheia */}
      <rect x="3" y="3" width="18" height="4.5" rx="2" fill="#FFD200" />
      {/* Nós filhos — barras ink indentadas */}
      <rect x="10.5" y="10" width="10.5" height="4" rx="1.8" fill="#243041" />
      <rect x="10.5" y="16" width="10.5" height="4" rx="1.8" fill="#243041" />
    </svg>
  );
}
