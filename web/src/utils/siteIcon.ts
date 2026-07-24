// Iconografia dos tipos de local (GeographicSite), par de `resourceIcon.ts`.
//
// Local e recurso compartilham o serializador (`renderIconSvg`) mas usam formas
// diferentes: local é quadrado arredondado, recurso é círculo. Assim, num mapa
// onde uma casa e a ONT dentro dela ficam na mesma coordenada, dá para separar
// "o lugar" de "o equipamento" sem legenda.
//
// A geometria dos glifos vem do lucide-react já usado na UI (ISC).

import { renderIconSvg, toDataUrl, type IconNode } from './resourceIcon';
import { siteKindLabel, type SiteKind } from './placeLabel';
import type { GeoStatus } from '../services/geoApi';

export type SiteIcon = {
  kind: SiteKind;
  glyph: string;
  node: IconNode;
  color: string;
  label: string;
};

// Espelha os tokens do design system (docs/03-design-system/tokens/colors.css).
// Precisa existir em JS porque o Google Maps só aceita hex literal.
export const siteKindColor: Record<SiteKind, string> = {
  CO: '#8b5cf6', // --status-purple
  POP: '#3b82f6', // --status-blue
  CTO: '#10b981', // --net-cto / --status-green
  PI: '#f59e0b', // --net-poste / --status-amber
  REGION: '#64748b', // --slate-500
  SUBSITE: '#64748b', // --slate-500
  SITE: '#ffd200', // --vt-yellow
};

// O estado de vida do site vence o tipo: um local terminado ou suspenso precisa
// gritar isso, não o seu papel na rede.
const STATUS_COLOR: Partial<Record<GeoStatus, string>> = {
  terminated: '#94a3b8', // --text-tertiary
  suspended: '#f59e0b', // --status-amber
};

const ICONS: Record<SiteKind, { glyph: string; node: IconNode }> = {
  CO: { glyph: 'building-2', node: [["path",{"d":"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"}],["path",{"d":"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"}],["path",{"d":"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"}],["path",{"d":"M10 6h4"}],["path",{"d":"M10 10h4"}],["path",{"d":"M10 14h4"}],["path",{"d":"M10 18h4"}]] },
  POP: { glyph: 'radio-tower', node: [["path",{"d":"M4.9 16.1C1 12.2 1 5.8 4.9 1.9"}],["path",{"d":"M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"}],["circle",{"cx":"12","cy":"9","r":"2"}],["path",{"d":"M16.2 4.8c2 2 2.26 5.11.8 7.47"}],["path",{"d":"M19.1 1.9a9.96 9.96 0 0 1 0 14.1"}],["path",{"d":"M9.5 18h5"}],["path",{"d":"m8 22 4-11 4 11"}]] },
  CTO: { glyph: 'box', node: [["path",{"d":"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{"d":"m3.3 7 8.7 5 8.7-5"}],["path",{"d":"M12 22V12"}]] },
  PI: { glyph: 'home', node: [["path",{"d":"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}],["polyline",{"points":"9 22 9 12 15 12 15 22"}]] },
  REGION: { glyph: 'map', node: [["polygon",{"points":"3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"}],["line",{"x1":"9","x2":"9","y1":"3","y2":"18"}],["line",{"x1":"15","x2":"15","y1":"6","y2":"21"}]] },
  SUBSITE: { glyph: 'door-open', node: [["path",{"d":"M13 4h3a2 2 0 0 1 2 2v14"}],["path",{"d":"M2 20h3"}],["path",{"d":"M13 20h9"}],["path",{"d":"M10 12v.01"}],["path",{"d":"M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"}]] },
  SITE: { glyph: 'map-pin', node: [["path",{"d":"M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"}],["circle",{"cx":"12","cy":"10","r":"3"}]] },
};

export function siteIconFor(kind: SiteKind, status?: GeoStatus): SiteIcon {
  const entry = ICONS[kind] ?? ICONS.SITE;
  return {
    kind,
    glyph: entry.glyph,
    node: entry.node,
    color: (status && STATUS_COLOR[status]) ?? siteKindColor[kind] ?? siteKindColor.SITE,
    label: siteKindLabel[kind] ?? siteKindLabel.SITE,
  };
}

export function siteIconSvg(icon: SiteIcon, options: { size?: number; badge?: boolean } = {}): string {
  return renderIconSvg(icon.node, icon.color, {
    size: options.size,
    shape: options.badge === false ? 'none' : 'squircle',
  });
}

// Mesma lógica de cache de `resourceIconDataUrl`: o mapa recalcula isto por marcador a cada
// re-render, mas o domínio (kind x status x tamanho) é pequeno e estável.
const siteIconDataUrlCache = new Map<string, string>();

export function siteIconDataUrl(icon: SiteIcon, options?: { size?: number; badge?: boolean }): string {
  const key = `${icon.kind}:${icon.color}:${options?.size ?? ''}:${options?.badge ?? ''}`;
  const cached = siteIconDataUrlCache.get(key);
  if (cached) return cached;
  const value = toDataUrl(siteIconSvg(icon, options));
  siteIconDataUrlCache.set(key, value);
  return value;
}
