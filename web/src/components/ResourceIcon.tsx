import { Box } from 'lucide-react';
import { useResourceTypeVisualIdentities } from '../hooks/useResourceTypeVisualIdentities';
import { useVisualIdentityPreviewUrl } from '../hooks/useVisualIdentityPreviewUrl';
import type { VisualIdentity } from '../services/studioGeoApi';
import type { IconResourceLike } from '../utils/resourceIcon';
import { resourceTypeFallbackColor, resourceTypeFallbackIcon } from '../utils/resourceTypePresentation';

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
  const box = size ?? (variant === 'badge' ? 20 : 16);
  const resourceType = typeof resource === 'string' ? resource : resource?.resourceType;
  const presentationForResourceType = useResourceTypeVisualIdentities();
  const presentation = presentationForResourceType(resourceType);
  const resolvedVisualIdentity = visualIdentity ?? presentation?.visualIdentity;
  const title = presentation?.name ?? 'Recurso';
  const visualIdentityUrl = useVisualIdentityPreviewUrl(resolvedVisualIdentity, box, {
    shape: 'none',
    color: '#334155',
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

  const FallbackIcon = presentation
    ? resourceTypeFallbackIcon(presentation.nature)
    : Box;
  const fallbackColor = presentation ? resourceTypeFallbackColor(presentation.nature) : '#334155';

  if (variant === 'glyph') {
    return (
      <FallbackIcon
        className={`shrink-0 ${className ?? ''}`}
        style={{ width: box, height: box, color: fallbackColor, strokeWidth: 2 }}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[7px] text-white ${className ?? ''}`}
      style={{ background: fallbackColor, width: box, height: box }}
      title={title}
    >
      <FallbackIcon width={box * 0.62} height={box * 0.62} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}
