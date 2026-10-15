import { useEffect, useState } from 'react';
import type { VisualIdentity } from '../services/studioGeoApi';
import { getStudioSvgAssetDataUrl } from '../services/studioAssetApi';
import { nativeMapIconDataUrl, nativeMapIconForCode } from '../utils/nativeMapIcons';
import type { IconShape } from '../utils/resourceIcon';

export type VisualIdentityPreviewOptions = {
  shape?: IconShape;
  /** Cor de uma identidade do sistema. */
  color?: string;
  /** Cor aplicada ao SVG de uma identidade personalizada. */
  assetColor?: string;
  opacity?: number;
};

const tintSvgDataUrl = (dataUrl: string, color: string): string => {
  const prefix = 'data:image/svg+xml;charset=UTF-8,';
  if (!dataUrl.startsWith(prefix)) return dataUrl;
  const svg = decodeURIComponent(dataUrl.slice(prefix.length))
    .replace(
      /\s(fill|stroke)=(['"])(?!none\2)[^'"]*\2/gi,
      (_, property: string) => ` ${property}="${color}"`,
    )
    .replace(/<svg\b([^>]*)>/i, `<svg$1 color="${color}" fill="${color}" stroke="${color}">`);
  return `${prefix}${encodeURIComponent(svg)}`;
};

/**
 * URL de imagem para a identidade canônica de um modelo (`ResourceType.visualIdentity` ou
 * `GeographicSiteSpecification.visualIdentity`) — não depende de `StudioGeoEntityNode`, ao
 * contrário de `useStudioPointIconPreviewUrl` (que resolve a partir de um nó do Studio GEO).
 * Usado pelos cabeçalhos read-only de Resource/Location Modeling (plano #264 §5).
 */
export function useVisualIdentityPreviewUrl(
  identity: VisualIdentity | null | undefined,
  size: number,
  options: VisualIdentityPreviewOptions = {},
): string | undefined {
  const [assetUrl, setAssetUrl] = useState<string>();
  const { shape, color, assetColor, opacity } = options;
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

  if (assetUrl) return assetColor ? tintSvgDataUrl(assetUrl, assetColor) : assetUrl;
  if (!iconCode) return undefined;
  const nativeIcon = nativeMapIconForCode(iconCode);
  if (!nativeIcon) return undefined;
  return nativeMapIconDataUrl(nativeIcon, { size, shape, color, opacity });
}
