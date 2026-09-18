import { useEffect, useState } from 'react';
import type { StudioGeoEntityNode } from '../services/studioGeoApi';
import { getStudioSvgAssetDataUrl } from '../services/studioAssetApi';
import {
  canonicalPointIconPreviewUrl,
  type PointIconPreviewOptions,
} from '../utils/pointIconPreview';

/**
 * URL da imagem do ponto conforme a identidade canônica do modelo (`node.visualIdentity`) — nunca
 * o `visualConfig` do Studio GEO, que a partir do schema v3 só carrega aparência contextual. SVG
 * personalizado é resolvido de forma assíncrona pelo cache do `studioAssetApi`; enquanto ele não
 * chega, o ícone canônico é exibido, então nunca há espaço vazio no lugar do ícone.
 */
export function useStudioPointIconPreviewUrl(
  node: StudioGeoEntityNode | null,
  size: number,
  options: PointIconPreviewOptions = {},
): string | undefined {
  const [assetUrl, setAssetUrl] = useState<string>();
  const { color, opacity } = options;
  const identity = node?.visualIdentity;
  const assetId = identity?.kind === 'asset' ? identity.assetId : undefined;
  const iconCode = identity?.kind === 'system' ? identity.iconCode : undefined;

  useEffect(() => {
    let active = true;
    setAssetUrl(undefined);
    if (!assetId) {
      return () => {
        active = false;
      };
    }
    void getStudioSvgAssetDataUrl(assetId).then((url) => {
      if (active) setAssetUrl(url);
    });
    return () => {
      active = false;
    };
  }, [assetId]);

  return (
    assetUrl ??
    (node ? canonicalPointIconPreviewUrl(node, iconCode, size, { color, opacity }) : undefined)
  );
}
