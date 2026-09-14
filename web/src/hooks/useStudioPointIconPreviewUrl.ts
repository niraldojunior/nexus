import { useEffect, useState } from 'react';
import type {
  StudioGeoEntityNode,
  StudioGeoPointVisualConfig,
} from '../services/studioGeoApi';
import { getStudioSvgAssetDataUrl } from '../services/studioAssetApi';
import {
  canonicalPointIconPreviewUrl,
  type PointIconPreviewOptions,
} from '../utils/pointIconPreview';

/**
 * URL da imagem do ponto conforme publicado no Studio. SVG personalizado é resolvido de forma
 * assíncrona pelo cache do `studioAssetApi`; enquanto ele não chega, o ícone canônico é exibido,
 * então nunca há espaço vazio no lugar do ícone.
 */
export function useStudioPointIconPreviewUrl(
  node: StudioGeoEntityNode | null,
  pointConfig: StudioGeoPointVisualConfig | null,
  size: number,
  options: PointIconPreviewOptions = {},
): string | undefined {
  const [assetUrl, setAssetUrl] = useState<string>();
  const { color, opacity } = options;

  useEffect(() => {
    let active = true;
    setAssetUrl(undefined);
    if (!pointConfig?.assetId) {
      return () => {
        active = false;
      };
    }
    void getStudioSvgAssetDataUrl(pointConfig.assetId).then((url) => {
      if (active) setAssetUrl(url);
    });
    return () => {
      active = false;
    };
  }, [pointConfig?.assetId]);

  return (
    assetUrl ??
    (node && pointConfig
      ? canonicalPointIconPreviewUrl(node, pointConfig.iconCode ?? 'CO', size, { color, opacity })
      : undefined)
  );
}
