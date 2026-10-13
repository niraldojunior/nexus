// Glifos próprios (grade 24x24, traço) que complementam as geometrias Lucide de
// nativeMapIconNodes.ts. Existem para que cada glifo apareça em uma única aba do
// seletor de ícones nativos — nenhum desenho se repete entre indústrias.

import type { IconNode } from './resourceIcon';

type Entry = IconNode[number];

const p = (d: string): Entry => ['path', { d }];
const r = (x: number, y: number, w: number, h: number, rx?: number): Entry => [
  'rect',
  {
    x: String(x),
    y: String(y),
    width: String(w),
    height: String(h),
    ...(rx === undefined ? {} : { rx: String(rx) }),
  },
];
const c = (cx: number, cy: number, radius: number): Entry => [
  'circle',
  { cx: String(cx), cy: String(cy), r: String(radius) },
];

export const NATIVE_MAP_ICON_CUSTOM_NODES: Record<string, IconNode> = {
  // ── Imobiliário ──
  'house-chimney': [p('m3 11 9-8 9 8'), p('M5 10v10h14V10'), p('M16 6V3h3v6'), p('M10 20v-5h4v5')],
  apartments: [
    r(6, 2, 12, 20, 1),
    p('M9 6h2M13 6h2M9 10h2M13 10h2M9 14h2M13 14h2'),
    p('M10 22v-4h4v4'),
  ],
  condo: [
    r(9, 3, 6, 18, 1),
    p('M9 8H4v13h5'),
    p('M15 11h5v10h-5'),
    p('M2 21h20'),
    p('M11.5 7h1M11.5 11h1M11.5 15h1'),
  ],
  'tower-block': [
    p('M2 22h20'),
    r(4, 8, 7, 14, 1),
    r(13, 2, 7, 20, 1),
    p('M6.5 12h2M6.5 16h2M15.5 6h2M15.5 10h2M15.5 14h2'),
  ],
  campus: [
    r(4, 9, 10, 12, 1),
    p('M14 15h6v6h-6'),
    p('M9 9V3h5l-1.5 2L14 7H9'),
    p('M7 14h4M7 18h4'),
  ],
  shed: [p('M2 20V9l10-5 10 5v11'), p('M2 20h20'), p('M6 20v-6h12v6'), p('M6 12h12')],
  subsite: [
    p(
      'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3',
    ),
    r(9, 9, 6, 6, 1),
  ],
  'unit-door': [r(6, 2, 12, 20, 1), c(15, 12, 0.6), p('M3 22h18')],
  'tech-room': [r(2, 2, 20, 20, 2), r(7, 6, 10, 5, 1), r(7, 13, 10, 5, 1)],
  'dist-box': [
    r(5, 2, 14, 20, 2),
    p('M9 7h6'),
    p('M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01'),
  ],
  'electrical-panel': [r(4, 2, 16, 20, 2), p('m13 6-3 6h4l-3 6')],
  'common-area': [
    p('M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3'),
    p('M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z'),
    p('M5 18v2M19 18v2'),
  ],

  // ── Telecom ──
  'central-office': [
    r(5, 8, 14, 14, 1),
    p('M12 8V3'),
    p('M9 5a4 4 0 0 1 6 0'),
    p('M9 13h6M9 17h6'),
  ],
  'house-pin': [p('m3 10 9-7 9 7'), p('M5 9v11h14V9'), c(12, 14, 2)],
  cabinet: [r(5, 2, 14, 20, 2), p('M12 2v20'), p('M9 11v2M15 11v2')],
  cdoi: [r(4, 3, 16, 18, 2), c(12, 10, 3), p('M9 17h6')],
  cdoe: [p('M4 8h16v12H4z'), p('M2 4h20v4H2z'), p('M10 13h4')],
  cto: [r(4, 6, 16, 14, 2), p('M9 6V3h6v3'), c(12, 13, 2.5)],
  dio: [r(2, 8, 20, 8, 1), p('M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01')],
  olt: [r(2, 5, 20, 14, 2), p('M7 5v14M12 5v14M17 5v14')],
  'line-card': [
    r(4, 4, 16, 14, 1),
    r(8, 8, 4, 4),
    p('M15 8h2M15 12h2'),
    p('M8 18v3M12 18v3M16 18v3'),
  ],
  port: [r(4, 5, 16, 12, 1), p('M8 17v2h8v-2'), p('M8 9v4M11 9v4M14 9v4')],
  ont: [r(4, 9, 16, 10, 2), p('M8 9V5M16 9V5'), p('M8 14h.01M12 14h.01M16 14h.01')],
  cpe: [p('M5 12.5a10 10 0 0 1 14 0'), p('M8.5 16a5 5 0 0 1 7 0'), p('M12 20h.01')],
  'ip-router': [c(12, 12, 9), p('M8 12h8'), p('m13 9 3 3-3 3'), p('m11 9-3 3 3 3')],
  'switch-ports': [r(2, 7, 20, 10, 2), p('M6 11v2M10 11v2M14 11v2M18 11v2')],
  'power-supply': [r(2, 7, 20, 10, 2), p('m12 9-2 3h4l-2 3'), p('M5 7V4M19 7V4')],
  'telecom-pole': [p('M12 3v19'), p('M6 7h12'), p('M8 12h8'), p('M9 22h6')],
  'rising-tube': [p('M9 21V5a3 3 0 0 1 6 0v16'), p('M9 12h6')],
  'splice-closure': [r(3, 8, 18, 8, 4), p('M1 12h2M21 12h2'), p('M9 8v8M15 8v8')],
  'optical-node': [r(5, 5, 14, 14, 3), c(12, 12, 3), p('M12 2v3M12 19v3M2 12h3M19 12h3')],
  'buried-span': [p('M2 7h20'), r(3, 12, 18, 5, 2.5), p('M4 4v3M12 4v3M20 4v3')],
  'backbone-cable': [c(12, 12, 9), c(12, 12, 5), c(12, 12, 1)],
  fiber: [p('M4 20 20 4'), p('M12 3l-9 9'), p('M21 12l-9 9')],
  'route-target': [p('M4 22V4'), p('M4 4h14l-3 5 3 5H4')],

  // ── Data Center ──
  'dc-building': [r(4, 3, 16, 18, 2), p('M4 9h16M4 15h16'), p('M8 6h.01M8 12h.01M8 18h.01')],
  rack: [
    r(5, 2, 14, 20, 1),
    p('M5 8h14M5 14h14'),
    p('M8 5h.01M8 11h.01M8 17h.01'),
    p('M12 5h4M12 11h4M12 17h4'),
  ],
  'access-card': [r(3, 5, 18, 14, 2), c(9, 11, 2), p('M14 10h4M14 14h4')],

  // ── Energia ──
  'power-plant': [
    p('M2 21h20'),
    p('M4 21V10l6 4v-4l6 4V4h4v17'),
    p('M8 18h.01M12 18h.01M16 18h.01'),
  ],
  substation: [p('M4 21h16'), p('M7 21V6M17 21V6'), p('M4 6h16'), p('M12 6v6'), c(12, 15, 3)],
  pylon: [p('M12 2 6 22M12 2l6 20'), p('M3 7h18'), p('M8 12h8'), p('M7.5 17h9')],
  feeder: [c(4, 4, 2), p('M6 4h6a4 4 0 0 1 4 4v10'), c(16, 20, 2)],
  switchgear: [r(3, 3, 18, 18, 2), p('M9 3v18M15 3v18'), p('M6 8v3M12 8v3M18 8v3')],
  generator: [r(3, 8, 18, 10, 2), p('M7 8V5h6'), p('m13 10-2 3h3l-2 3')],
  'ev-charger': [
    r(5, 3, 10, 18, 1),
    p('M5 21h10'),
    p('M15 9h2a2 2 0 0 1 2 2v5'),
    p('m11 7-2 3h3l-2 3'),
  ],
  'control-center': [r(2, 3, 20, 14, 2), p('M8 21h8M12 17v4'), p('m13 6-3 4h4l-3 4')],
  'power-cable': [p('M2 12h4M18 12h4'), r(6, 9, 12, 6, 3), p('m12 10-1.5 2H13l-1.5 2')],
  outlet: [r(3, 3, 18, 18, 3), p('M9 9v3M15 9v3'), p('M9 16c1.5 1 4.5 1 6 0')],

  // ── Gás & Óleo ──
  derrick: [p('M12 3 7 21M12 3l5 18'), p('M8.5 14h7M10 9h4'), p('M5 21h14')],
  refinery: [
    r(3, 8, 5, 13, 1),
    r(10, 3, 5, 18, 1),
    r(17, 10, 4, 11, 1),
    p('M8 12h2M15 14h2'),
    p('M2 21h20'),
  ],
  terminal: [p('M2 21h20'), p('M4 21V9a4 4 0 0 1 8 0v12'), p('M12 14h8v7')],
  'storage-tank': [
    p('M5 5c0-1.5 3-3 7-3s7 1.5 7 3v14c0 1.5-3 3-7 3s-7-1.5-7-3z'),
    p('M5 5c0 1.5 3 3 7 3s7-1.5 7-3'),
    p('M5 12c0 1.5 3 3 7 3s7-1.5 7-3'),
  ],
  pipeline: [p('M2 7h9v10h11'), p('M2 4v6'), p('M22 14v6')],
  pump: [c(9, 13, 6), p('M9 7V3h6'), p('M15 13h6v-3')],
  compressor: [r(3, 6, 14, 12, 2), c(10, 12, 3), p('M17 10h4v4h-4')],
  'flow-meter': [p('M2 12h5M17 12h5'), c(12, 12, 5), p('M12 7V3M9 3h6'), p('m12 12 2-2')],
  'control-room': [r(2, 3, 20, 14, 2), p('M8 21h8M12 17v4'), p('m6 12 3-3 3 2 4-4')],
  'process-temp': [p('M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z'), p('M18 6h3M18 10h3')],
  'loading-arm': [p('M4 21h8'), p('M4 21V4h10l4 4v3'), p('M18 11v4a2 2 0 0 1-2 2')],
  lifebuoy: [
    c(12, 12, 10),
    c(12, 12, 4),
    p('m4.9 4.9 4.2 4.2M14.9 14.9l4.2 4.2M19.1 4.9l-4.2 4.2M9.1 14.9l-4.2 4.2'),
  ],
  emergency: [c(12, 12, 10), p('M12 8v8M8 12h8')],

  // ── Logística ──
  'distribution-center': [
    p('M2 21V9l10-6 10 6v12'),
    p('M2 21h20'),
    p('M6 21v-6h4v6M14 21v-6h4v6'),
    p('M8 11h8'),
  ],
  'pin-check': [p('M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z'), p('m9 10 2 2 4-4')],
  'parking-square': [r(3, 3, 18, 18, 3), p('M9 17V7h4a3 3 0 0 1 0 6H9')],
  'cross-dock': [p('M3 7h14'), p('m13 3 4 4-4 4'), p('M21 17H7'), p('m11 13-4 4 4 4')],
  'port-crane': [p('M3 21h18'), p('M6 21V3'), p('M6 5h15v3'), p('M18 8v6'), r(16, 14, 4, 4)],
};
