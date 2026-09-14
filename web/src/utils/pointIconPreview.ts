// Composição do badge de um ponto a partir do que o Studio GEO publicou. É a mesma imagem
// usada na prévia do editor, no seletor de camadas e no marker do mapa — manter num só lugar
// evita que o ícone configurado apareça diferente em cada superfície.

import type { StudioGeoEntityNode } from '../services/studioGeoApi';
import { resourceIconDataUrl, resourceIconFor } from './resourceIcon';
import { siteIconDataUrl, siteIconFor } from './siteIcon';
import { nativeMapIconDataUrl, nativeMapIconForCode } from './nativeMapIcons';

type SiteIconCode = 'CO' | 'POP' | 'CTO' | 'PI';

const SITE_ICON_CODES = new Set<SiteIconCode>(['CO', 'POP', 'CTO', 'PI']);

const resourceTypeForIconCode = (iconCode: string): string => {
  const code = iconCode.toLowerCase();
  if (code === 'cdoe' || code === 'cdoi') return 'CTO';
  if (code === 'ceo') return 'SpliceClosure';
  if (code === 'dio') return 'DIO';
  if (code === 'pole') return 'Pole';
  if (code === 'tower') return 'Tower';
  if (code === 'olt') return 'OLT';
  if (code === 'splitter') return 'Splitter';
  return iconCode;
};

export type PointIconPreviewOptions = {
  /** Cor de fundo do badge. Ausente mantém a cor canônica do próprio ícone. */
  color?: string;
  opacity?: number;
};

/** A pré-visualização reutiliza o mesmo SVG que o mapa desenha para o ponto. */
export function canonicalPointIconPreviewUrl(
  node: StudioGeoEntityNode,
  iconCode: string,
  size: number,
  options: PointIconPreviewOptions = {},
): string {
  const nativeIcon = nativeMapIconForCode(iconCode);
  if (nativeIcon) {
    return nativeMapIconDataUrl(nativeIcon, {
      size,
      shape: node.entity.category === 'LOCAL' ? 'squircle' : 'circle',
      ...options,
    });
  }

  if (node.entity.category === 'LOCAL') {
    const code = iconCode.toUpperCase();
    const kind: SiteIconCode = SITE_ICON_CODES.has(code as SiteIconCode)
      ? (code as SiteIconCode)
      : 'CO';
    return siteIconDataUrl(siteIconFor(kind), { size });
  }

  const normalizedCode = resourceTypeForIconCode(iconCode);
  return resourceIconDataUrl(
    resourceIconFor({
      resourceType: normalizedCode,
      name: iconCode.toLowerCase() === 'cdoi' ? 'CDOI' : undefined,
    }),
    { size },
  );
}
