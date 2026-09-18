import { createElement } from 'react';
import { useResourceTypeVisualIdentities } from '../hooks/useResourceTypeVisualIdentities';
import { useVisualIdentityPreviewUrl } from '../hooks/useVisualIdentityPreviewUrl';
import type { VisualIdentity } from '../services/studioGeoApi';
import {
  resourceIconFor,
  type IconResourceLike,
  type ResourceIcon as ResourceIconSpec,
} from '../utils/resourceIcon';
import {
  resourceTypeFallbackColor,
  resourceTypeFallbackIcon,
} from '../utils/resourceTypePresentation';

export type ResourceIconProps = {
  resource: IconResourceLike | string | undefined;
  /** Identidade canônica do ResourceType; a instância Resource nunca a duplica. */
  visualIdentity?: VisualIdentity;
  // 'badge' só preserva o fundo histórico quando o tipo não pertence ao catálogo modelado.
  // Tipos modelados sempre seguem o glifo canônico da Modelagem.
  variant?: 'badge' | 'glyph';
  size?: number;
  className?: string;
};

/**
 * Ícone operacional de Resource. A identidade e o fallback genérico vêm do Resource Model;
 * `resourceIconFor` existe apenas para referências históricas ou tipos ainda não modelados.
 */
export function ResourceIcon({
  resource,
  visualIdentity,
  variant = 'badge',
  size,
  className,
}: ResourceIconProps) {
  const legacyIcon = resourceIconFor(resource);
  const box = size ?? (variant === 'badge' ? 20 : 16);
  const resourceType = typeof resource === 'string' ? resource : resource?.resourceType;
  const presentationForResourceType = useResourceTypeVisualIdentities();
  const presentation = presentationForResourceType(resourceType);
  const resolvedVisualIdentity = visualIdentity ?? presentation?.visualIdentity;
  const title = legacyIcon.label;
  const visualIdentityUrl = useVisualIdentityPreviewUrl(resolvedVisualIdentity, box, {
    shape: 'none',
    color: '#0284c7',
  });

  if (visualIdentityUrl) {
    return (
      <img
        src={visualIdentityUrl}
        alt=""
        aria-hidden="true"
        className={`shrink-0 ${className ?? ''}`}
        style={{ width: box, height: box }}
        title={title}
      />
    );
  }

  // A falta de visualIdentity em tipo modelado é intencional: corresponde exatamente ao
  // fallback Box/Cpu exibido pela Modelagem, sem inferir Splitter, Porta etc. pelo nome.
  if (presentation) {
    const FallbackIcon = resourceTypeFallbackIcon(presentation.nature);
    return (
      <FallbackIcon
        className={`shrink-0 ${className ?? ''}`}
        style={{
          width: box,
          height: box,
          color: resourceTypeFallbackColor(presentation.nature),
          strokeWidth: 2,
        }}
        aria-hidden="true"
        data-resource-type-fallback={
          presentation.nature === 'LogicalResource' ? 'logical' : 'physical'
        }
      />
    );
  }

  if (variant === 'glyph') {
    return (
      <svg
        className={className}
        width={box}
        height={box}
        viewBox="0 0 24 24"
        fill="none"
        stroke={legacyIcon.color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <title>{title}</title>
        {glyphChildren(legacyIcon)}
      </svg>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[7px] text-white ${className ?? ''}`}
      style={{ background: legacyIcon.color, width: box, height: box }}
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
        {glyphChildren(legacyIcon)}
      </svg>
    </span>
  );
}

function glyphChildren(icon: ResourceIconSpec) {
  return icon.node.map(([tag, attrs], index) =>
    createElement(tag, { ...attrs, key: `${icon.glyph}-${index}` }),
  );
}
