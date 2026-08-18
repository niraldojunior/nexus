// Cor das manchas de concentração/dispersão de um Projeto de trabalho (REQ-MOD01-017).
//
// Duas classes fixas, sem gradiente: azul para concentração (região onde o cadastro do
// projeto está coerente), roxo para dispersão (< PROJECT_AREA_MIN_SITES locais — candidato a
// erro de coordenada/cadastro, o alvo de inspeção).
//
// Hex literal com o nome do token em comentário (mesmo padrão de coverageColor.ts): canvas não
// lê variável CSS, e o design system proíbe hardcode de token só na árvore React.

// --status-blue (docs/4-design-system/tokens/colors.css).
const CONCENTRATION_RGB: [number, number, number] = [59, 130, 246];
// --status-purple.
const DISPERSION_RGB: [number, number, number] = [139, 92, 246];

export type ProjectAreaKind = 'concentration' | 'dispersion';

const FILL_ALPHA = 0.28;
const STROKE_ALPHA = 0.85;

export function projectAreaFill(kind: ProjectAreaKind): string {
  const [r, g, b] = kind === 'concentration' ? CONCENTRATION_RGB : DISPERSION_RGB;
  return `rgba(${r}, ${g}, ${b}, ${FILL_ALPHA})`;
}

export function projectAreaStroke(kind: ProjectAreaKind): string {
  const [r, g, b] = kind === 'concentration' ? CONCENTRATION_RGB : DISPERSION_RGB;
  return `rgba(${r}, ${g}, ${b}, ${STROKE_ALPHA})`;
}

// Cor sólida (sem alfa) para o swatch do balão de hover.
export function projectAreaSwatch(kind: ProjectAreaKind): string {
  const [r, g, b] = kind === 'concentration' ? CONCENTRATION_RGB : DISPERSION_RGB;
  return `rgb(${r}, ${g}, ${b})`;
}

// Swatch como data-URL SVG (círculo na cor da classe) para o ícone do balão de hover, no
// lugar do ícone de local/recurso — a mancha não é um item pontual (mesmo padrão de
// coverageSwatchDataUrl em coverageColor.ts).
export function projectAreaSwatchDataUrl(kind: ProjectAreaKind): string {
  const [r, g, b] = kind === 'concentration' ? CONCENTRATION_RGB : DISPERSION_RGB;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<circle cx="20" cy="20" r="13" fill="rgb(${r},${g},${b})" stroke="#ffffff" stroke-width="3"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
