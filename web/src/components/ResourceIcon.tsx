import { createElement } from 'react';
import { resourceIconFor, type IconResourceLike, type ResourceIcon as ResourceIconSpec } from '../utils/resourceIcon';

export type ResourceIconProps = {
  resource: IconResourceLike | string | undefined;
  // 'badge' desenha o disco na cor da família (igual ao pin do mapa);
  // 'glyph' desenha só o traço, herdando a cor do texto ao redor.
  variant?: 'badge' | 'glyph';
  size?: number;
  className?: string;
};

/**
 * Ícone do tipo de recurso. Renderiza a mesma geometria que `resourceIconDataUrl`
 * usa no marker do Google Maps, para que a árvore de Locais e o mapa mostrem
 * exatamente o mesmo desenho para o mesmo tipo.
 */
export function ResourceIcon({ resource, variant = 'badge', size, className }: ResourceIconProps) {
  const icon = resourceIconFor(resource);
  const box = size ?? (variant === 'badge' ? 20 : 16);
  const title = icon.label;

  if (variant === 'glyph') {
    return (
      <svg
        className={className}
        width={box}
        height={box}
        viewBox="0 0 24 24"
        fill="none"
        stroke={icon.color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <title>{title}</title>
        {glyphChildren(icon)}
      </svg>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[7px] text-white ${className ?? ''}`}
      style={{ background: icon.color, width: box, height: box }}
      title={title}
    >
      <svg
        width={box * 0.62}
        height={box * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {glyphChildren(icon)}
      </svg>
    </span>
  );
}

// O `node` do lucide é uma lista de [tag, atributos]; createElement evita ter de
// manter um switch por tipo de elemento SVG.
function glyphChildren(icon: ResourceIconSpec) {
  return icon.node.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: `${icon.glyph}-${index}` }));
}
