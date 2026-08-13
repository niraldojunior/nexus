// Peças visuais da simulação de drop desenhada no mapa quando uma CDO é escolhida na
// aba Viabilidade do painel de Endereço (ver GeoPage/GoogleMapPanel).
//
// A simulação não é planta: é um estudo do que *seria* o drop entre o endereço e a
// caixa. Por isso ela não usa a iconografia de cabo do inventário (ver
// CABLE_STROKE_WEIGHT em GeoPage) — tem tratamento próprio, animado e efêmero.

import { haversineMeters, type LngLat } from './googleRoutes';
import { toDataUrl } from './resourceIcon';

/**
 * Ponto no meio do **comprimento** do traçado, não o vértice do meio: uma rota a pé
 * tem segmentos de tamanhos muito diferentes (uma travessa curta vale um vértice
 * tanto quanto uma quadra inteira), e é o meio visual que se quer para pousar o
 * rótulo de distância.
 */
export function pathMidpoint(path: LngLat[]): LngLat | null {
  if (!path.length) return null;
  if (path.length === 1) return path[0];

  const segments = path.slice(1).map((point, index) => haversineMeters(path[index], point));
  const total = segments.reduce((sum, length) => sum + length, 0);
  if (total === 0) return path[0];

  let walked = 0;
  for (const [index, length] of segments.entries()) {
    if (walked + length >= total / 2) {
      // Interpola dentro do segmento que cruza a metade. Em 300 m a projeção plana é
      // indistinguível da geodésica, então a fração linear basta.
      const ratio = length === 0 ? 0 : (total / 2 - walked) / length;
      const [fromLng, fromLat] = path[index];
      const [toLng, toLat] = path[index + 1];
      return [fromLng + (toLng - fromLng) * ratio, fromLat + (toLat - fromLat) * ratio];
    }
    walked += length;
  }
  return path[path.length - 1];
}

// Duas coordenadas são "a mesma ponta" abaixo desta folga (m): a Routes API devolve a
// polyline já encaixada na via, com poucos metros até a fachada e a caixa reais.
const STITCH_TOLERANCE_METERS = 0.5;

/**
 * Costura as pontas reais do drop no traçado da rua. A Routes API devolve a polyline
 * ENCAIXADA na via (`snap to road`), então a primeira e a última coordenada não são o
 * alfinete do endereço nem a CDO — e é esse vão que o técnico enxerga como "drop
 * desconectado". Prefixa `origin` e sufixa `destination`, pulando a ponta da rota quando
 * ela já coincide com o ponto real (evita um vértice duplicado degenerado). Só geometria:
 * a distância exibida continua vindo da Routes API (ver ViabilityTab).
 */
export function stitchDropPath(origin: LngLat, routePath: LngLat[], destination: LngLat): LngLat[] {
  if (!routePath.length) return [origin, destination];
  const startsAtOrigin = haversineMeters(origin, routePath[0]) <= STITCH_TOLERANCE_METERS;
  const endsAtDestination =
    haversineMeters(destination, routePath[routePath.length - 1]) <= STITCH_TOLERANCE_METERS;
  const middle = routePath.slice(
    startsAtOrigin ? 1 : 0,
    endsAtDestination ? routePath.length - 1 : routePath.length,
  );
  return [origin, ...middle, destination];
}

/**
 * Extensão do traçado na tela: o maior lado do bbox que o circunscreve, em metros. É o
 * que a câmera precisa enquadrar para o drop nascer inteiro — o `pathMidpoint` só diz
 * onde centrar, não quanto cabe. Traçado vazio ou degenerado devolve 0 (nada a enquadrar).
 */
export function pathSpanMeters(path: LngLat[]): number {
  if (path.length < 2) return 0;
  let minLng = path[0][0];
  let maxLng = path[0][0];
  let minLat = path[0][1];
  let maxLat = path[0][1];
  for (const [lng, lat] of path) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const widthMeters = haversineMeters([minLng, minLat], [maxLng, minLat]);
  const heightMeters = haversineMeters([minLng, minLat], [minLng, maxLat]);
  return Math.max(widthMeters, heightMeters);
}

/**
 * Distância do drop em pt-BR: metros inteiros até 1 km, depois km com uma casa. O
 * arredondamento vem antes da comparação para 999,6 m sair como "1 km" e não "1000 m".
 */
export function formatDropDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '-';
  const rounded = Math.round(meters);
  if (rounded < 1000) return `${rounded} m`;
  return `${(rounded / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

// Cores literais porque o Google Maps não renderiza React nem lê variável CSS — mesmo
// motivo já documentado em `resourceIcon.ts`. Espelham os tokens do design system
// (docs/4-design-system/tokens/colors.css): `--vt-ink` e `--vt-yellow`, o par
// `--accent-on`/`--accent`.
export const DROP_INK = '#243041';
export const DROP_ACCENT = '#ffd200';

export const DROP_LABEL_HEIGHT = 24;
const LABEL_FONT_SIZE = 12;

/**
 * Largura da pílula. Estimada pelo número de caracteres — o SVG não tem como medir
 * texto, e nos dígitos a variação de avanço é pequena o bastante para não desalinhar.
 * Exportada porque o marcador no mapa precisa dela para se ancorar pelo centro.
 */
export function dropLabelWidth(text: string): number {
  return Math.max(44, Math.round(text.length * LABEL_FONT_SIZE * 0.62) + 20);
}

/**
 * Pílula com a distância do drop, para ancorar no meio do traçado. Fundo claro e
 * borda escura para o número continuar legível sobre satélite e sobre roadmap.
 */
export function dropLabelDataUrl(text: string): string {
  const width = dropLabelWidth(text);
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${DROP_LABEL_HEIGHT}" viewBox="0 0 ${width} ${DROP_LABEL_HEIGHT}">`,
    `<rect x="0.75" y="0.75" width="${width - 1.5}" height="${DROP_LABEL_HEIGHT - 1.5}" rx="${(DROP_LABEL_HEIGHT - 1.5) / 2}" fill="#ffffff" stroke="${DROP_INK}" stroke-width="1.5"/>`,
    `<text x="${width / 2}" y="${DROP_LABEL_HEIGHT / 2}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${LABEL_FONT_SIZE}" font-weight="700" fill="${DROP_INK}">${escaped}</text>`,
    `</svg>`,
  ].join('');
  return toDataUrl(svg);
}
