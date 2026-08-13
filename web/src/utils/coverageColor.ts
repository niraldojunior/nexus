// Cor do mapa de calor de cobertura GPON (REQ-MOD01-014).
//
// Duas dimensões independentes:
//   · MATIZ pela disponibilidade — razão CDOs disponíveis / total. Interpola vermelho →
//     âmbar → verde, os mesmos tokens de status do design system (--status-red/amber/green).
//   · ALFA pela densidade — quantas CDOs cobrem a célula. Cresce até um teto para o mapa
//     base continuar legível por baixo da mancha.
//
// Hex literal com o nome do token em comentário (mesmo padrão de resourceIcon.ts/siteIcon.ts):
// canvas não lê variável CSS, e o design system proíbe hardcode de token só na árvore React.

// --status-red · --status-amber · --status-green (docs/4-design-system/tokens/colors.css).
const RED: [number, number, number] = [239, 68, 68];
const AMBER: [number, number, number] = [245, 158, 11];
const GREEN: [number, number, number] = [16, 185, 129];

// Densidade (CDOs por célula) que satura o alfa. Acima disso a célula já está no teto — mais
// CDOs não escurecem além, senão o centro dos bairros viraria um borrão opaco.
export const COVERAGE_DENSITY_SATURATION = 6;

// Alfa mínimo (célula mal coberta ainda precisa aparecer) e máximo (nunca tapa o mapa base).
export const COVERAGE_ALPHA_MIN = 0.18;
export const COVERAGE_ALPHA_MAX = 0.55;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const lerp = (from: number, to: number, t: number): number => Math.round(from + (to - from) * t);

const mix = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// RGB da rampa vermelho→âmbar→verde para uma razão de disponibilidade em [0,1].
export function coverageHue(availabilityRatio: number): [number, number, number] {
  const ratio = clamp01(availabilityRatio);
  // Duas metades: [0,0.5] vermelho→âmbar, [0.5,1] âmbar→verde.
  if (ratio <= 0.5) return mix(RED, AMBER, ratio / 0.5);
  return mix(AMBER, GREEN, (ratio - 0.5) / 0.5);
}

// Alfa em [COVERAGE_ALPHA_MIN, COVERAGE_ALPHA_MAX] pela densidade de CDOs na célula.
export function coverageAlpha(cdoTotal: number): number {
  const density = clamp01(Math.max(0, cdoTotal) / COVERAGE_DENSITY_SATURATION);
  return COVERAGE_ALPHA_MIN + (COVERAGE_ALPHA_MAX - COVERAGE_ALPHA_MIN) * density;
}

// `rgba(...)` pronto para o canvas: matiz pela disponibilidade, alfa pela densidade. `cdoTotal`
// é 0 no nível de bairro (polígono), onde a densidade não se aplica — aí o alfa vai ao teto.
export function coverageFill(
  availabilityRatio: number,
  cdoTotal: number,
  options: { solid?: boolean } = {},
): string {
  const [r, g, b] = coverageHue(availabilityRatio);
  const alpha = options.solid ? COVERAGE_ALPHA_MAX : coverageAlpha(cdoTotal);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

// Cor sólida (sem alfa) para a bolinha da legenda e o swatch do balão.
export function coverageSwatch(availabilityRatio: number): string {
  const [r, g, b] = coverageHue(availabilityRatio);
  return `rgb(${r}, ${g}, ${b})`;
}

// Swatch como data-URL SVG (círculo na cor da disponibilidade) para o ícone do balão de
// hover, no lugar do ícone de local/recurso — a cobertura não é um item pontual.
export function coverageSwatchDataUrl(availabilityRatio: number): string {
  const [r, g, b] = coverageHue(availabilityRatio);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<circle cx="20" cy="20" r="13" fill="rgb(${r},${g},${b})" stroke="#ffffff" stroke-width="3"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
