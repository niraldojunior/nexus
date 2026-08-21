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

export type SiteIcon = {
  kind: SiteKind;
  glyph: string;
  node: IconNode;
  color: string;
  label: string;
};

// Tamanho de referência do pin de local no mapa, em px — usado no zoom mais fechado (ver
// siteIconSizeForScale em mapScale.ts, que devolve o tamanho real por escala) e como base do
// balão/alfinete de seleção, que não variam por escala.
export const SITE_ICON_SIZE = 25;

// Espelha os tokens do design system (docs/4-design-system/tokens/colors.css).
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

// O estado de vida do site vence o tipo: um local aposentado ou em desativação precisa
// gritar isso, não o seu papel na rede. Chaves no vocabulário canônico de
// GeographicSite.status (GeoSiteStatus) — quem chama passa `site.status`/`node.status`
// direto, sem cast, já que a busca abaixo é seguro para qualquer string.
const STATUS_COLOR: Record<string, string> = {
  Retired: '#94a3b8', // --text-tertiary
  InDeactivation: '#f59e0b', // --status-amber
};

const ICONS: Record<SiteKind, { glyph: string; node: IconNode }> = {
  CO: {
    glyph: 'building-2',
    node: [
      ['path', { d: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z' }],
      ['path', { d: 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2' }],
      ['path', { d: 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2' }],
      ['path', { d: 'M10 6h4' }],
      ['path', { d: 'M10 10h4' }],
      ['path', { d: 'M10 14h4' }],
      ['path', { d: 'M10 18h4' }],
    ],
  },
  POP: {
    glyph: 'radio-tower',
    node: [
      ['path', { d: 'M4.9 16.1C1 12.2 1 5.8 4.9 1.9' }],
      ['path', { d: 'M7.8 4.7a6.14 6.14 0 0 0-.8 7.5' }],
      ['circle', { cx: '12', cy: '9', r: '2' }],
      ['path', { d: 'M16.2 4.8c2 2 2.26 5.11.8 7.47' }],
      ['path', { d: 'M19.1 1.9a9.96 9.96 0 0 1 0 14.1' }],
      ['path', { d: 'M9.5 18h5' }],
      ['path', { d: 'm8 22 4-11 4 11' }],
    ],
  },
  CTO: {
    glyph: 'box',
    node: [
      [
        'path',
        {
          d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
        },
      ],
      ['path', { d: 'm3.3 7 8.7 5 8.7-5' }],
      ['path', { d: 'M12 22V12' }],
    ],
  },
  PI: {
    glyph: 'home',
    node: [
      ['path', { d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
      ['polyline', { points: '9 22 9 12 15 12 15 22' }],
    ],
  },
  REGION: {
    glyph: 'map',
    node: [
      ['polygon', { points: '3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21' }],
      ['line', { x1: '9', x2: '9', y1: '3', y2: '18' }],
      ['line', { x1: '15', x2: '15', y1: '6', y2: '21' }],
    ],
  },
  SUBSITE: {
    glyph: 'door-open',
    node: [
      ['path', { d: 'M13 4h3a2 2 0 0 1 2 2v14' }],
      ['path', { d: 'M2 20h3' }],
      ['path', { d: 'M13 20h9' }],
      ['path', { d: 'M10 12v.01' }],
      [
        'path',
        {
          d: 'M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z',
        },
      ],
    ],
  },
  SITE: {
    glyph: 'map-pin',
    node: [
      ['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }],
      ['circle', { cx: '12', cy: '10', r: '3' }],
    ],
  },
};

export function siteIconFor(kind: SiteKind, status?: string): SiteIcon {
  const entry = ICONS[kind] ?? ICONS.SITE;
  return {
    kind,
    glyph: entry.glyph,
    node: entry.node,
    color: (status && STATUS_COLOR[status]) ?? siteKindColor[kind] ?? siteKindColor.SITE,
    label: siteKindLabel[kind] ?? siteKindLabel.SITE,
  };
}

export function siteIconSvg(
  icon: SiteIcon,
  options: { size?: number; badge?: boolean } = {},
): string {
  return renderIconSvg(icon.node, icon.color, {
    size: options.size,
    shape: options.badge === false ? 'none' : 'squircle',
  });
}

// Mesma lógica de cache de `resourceIconDataUrl`: o mapa recalcula isto por marcador a cada
// re-render, mas o domínio (kind x status x tamanho) é pequeno e estável.
const siteIconDataUrlCache = new Map<string, string>();

export function siteIconDataUrl(
  icon: SiteIcon,
  options?: { size?: number; badge?: boolean },
): string {
  const key = `${icon.kind}:${icon.color}:${options?.size ?? ''}:${options?.badge ?? ''}`;
  const cached = siteIconDataUrlCache.get(key);
  if (cached) return cached;
  const value = toDataUrl(siteIconSvg(icon, options));
  siteIconDataUrlCache.set(key, value);
  return value;
}

// Alfinete de seleção no mapa (estilo Google Maps): marca o Site ou Recurso que o
// usuário clicou por último, sem ambiguidade com o "+" amarelo do rascunho de
// endereço (círculo) nem com o pin vermelho padrão do Google (outra silhueta e
// cor). Ponta para baixo, ancorada na coordenada exata do objeto selecionado.
export const SELECTION_PIN_ASPECT = 24 / 32;

const selectionPinDataUrlCache = new Map<number, string>();

export function selectionPinDataUrl(height: number): string {
  const cached = selectionPinDataUrlCache.get(height);
  if (cached) return cached;
  const width = Math.round(height * SELECTION_PIN_ASPECT);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 32" fill="none">` +
    `<path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0Z" fill="#2E3238" stroke="#FFFFFF" stroke-width="1.5"/>` +
    `<circle cx="12" cy="12" r="4.5" fill="#FFD200"/>` +
    `</svg>`;
  const value = toDataUrl(svg);
  selectionPinDataUrlCache.set(height, value);
  return value;
}

export type AddressSourcePin = {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
};

// Gota com ponta arredondada num viewBox 40×52 (o resto é folga para a sombra). Ancorada na
// ponta inferior (20, 46).
const ADDRESS_PIN_PATH =
  'M20 4 C 12 4 6 10 6 18 C 6 27 15 38 20 46 C 25 38 34 27 34 18 C 34 10 28 4 20 4 Z';

// Glifos das duas fontes, gêmeos dos componentes JSX em geo-tabs/AddressSourceIcons.tsx —
// aqui como string SVG porque o Google Maps não renderiza React. Centrados no miolo da gota
// (translate+scale mapeiam o centro ~(12,12) do viewBox 24×24 para (20,18)).
const GOOGLE_GLYPH =
  '<g transform="translate(13.4 11.4) scale(0.55)">' +
  '<path fill="#34A853" d="M3 5.5 9.5 2v16.5L3 22V5.5Z"/>' +
  '<path fill="#4285F4" d="M9.5 2 16 5.5V22l-6.5-3.5V2Z"/>' +
  '<path fill="#FBBC04" d="M16 5.5 21 2.8v16.5L16 22V5.5Z"/>' +
  '<path fill="#EA4335" d="M12.75 7.1a3.35 3.35 0 0 0-3.35 3.35c0 2.52 3.35 6.3 3.35 6.3s3.35-3.78 3.35-6.3a3.35 3.35 0 0 0-3.35-3.35Zm0 4.6a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"/>' +
  '</g>';

// V.tal V em tinta (#243041), sobre o disco branco — mesmo desenho do GoogleMapsIcon gêmeo.
const GEONET_GLYPH =
  '<g transform="translate(13.4 11.4) scale(0.55)"><path fill="#243041" d="M2.5 3h4.1L12 16.2 17.4 3h4.1L12 21 2.5 3Z"/></g>';

const addressSourcePinCache = new Map<string, AddressSourcePin>();

/**
 * Alfinetes de comparação das fontes de endereço (Google × GEONET) no mapa Geo. Os dois
 * compartilham o mesmo corpo em tinta com disco branco — a única diferença entre as fontes é o
 * glifo do miolo (marca Google × marca V.tal). O escolhido ganha anel amarelo e ~15% de
 * tamanho; a alternativa fica com contorno branco fino. Traz as próprias medidas (o chamador
 * crava tamanho/âncora no Google Maps).
 */
export function addressSourcePin(source: 'google' | 'geonet', selected: boolean): AddressSourcePin {
  const key = `${source}:${selected}`;
  const cached = addressSourcePinCache.get(key);
  if (cached) return cached;
  const glyph = source === 'google' ? GOOGLE_GLYPH : GEONET_GLYPH;
  const shadow = '<ellipse cx="20" cy="48.5" rx="6.5" ry="2" fill="rgba(15,23,42,0.25)"/>';
  const stroke = selected ? '#FFD200' : '#FFFFFF';
  const strokeWidth = selected ? 2.5 : 1.75;
  const pin =
    `${shadow}<path d="${ADDRESS_PIN_PATH}" fill="#243041" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
    `<circle cx="20" cy="18" r="8" fill="#FFFFFF"/>${glyph}`;
  const width = selected ? 34 : 30;
  const height = Math.round((width * 52) / 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 40 52">${pin}</svg>`;
  const value: AddressSourcePin = {
    url: toDataUrl(svg),
    width,
    height,
    anchorX: width / 2,
    anchorY: (height * 46) / 52,
  };
  addressSourcePinCache.set(key, value);
  return value;
}
