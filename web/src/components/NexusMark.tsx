interface NexusMarkProps {
  className?: string;
  // Cor da "tinta" do cubo/diamante (tudo que não é o amarelo da marca). Padrão escuro,
  // para superfícies claras; passe um tom claro (ex.: '#ffffff') para inverter e ganhar
  // contraste sobre fundo escuro (ex.: painel de marca da tela de login).
  ink?: string;
}

/**
 * Marca do Nexus — o mesmo desenho do favicon, sem o fundo preto, para pousar
 * sobre superfícies claras (ex.: dentro da barra de pesquisa da página Locais no
 * mobile, onde abre o menu principal). Em fundo escuro, use `ink` claro para contraste.
 * O rótulo acessível fica no botão que a envolve, então aqui a marca é `aria-hidden`.
 * Fonte canônica: docs/4-design-system/assets/nexus-mark.svg.
 */
export default function NexusMark({ className = '', ink = '#181919' }: NexusMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        points="32,6 58,32 32,58 6,32"
        fill="none"
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="58" cy="32" r="2.8" fill={ink} />
      <circle cx="32" cy="58" r="2.8" fill={ink} />
      <circle cx="6" cy="32" r="2.8" fill={ink} />
      <circle cx="32" cy="6" r="3.6" fill="#FFD919" stroke={ink} strokeWidth="1.5" />
      <polygon points="32,18 45,25.5 32,33 19,25.5" fill="#FFD919" />
      <polygon points="19,25.5 32,33 32,47 19,39.5" fill={ink} opacity="0.92" />
      <polygon points="45,25.5 32,33 32,47 45,39.5" fill={ink} opacity="0.55" />
    </svg>
  );
}
