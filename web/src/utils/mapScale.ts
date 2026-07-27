// Escala do mapa em metros, no mesmo espírito da barra de escala nativa do Google Maps
// (`scaleControl: true`, ver GeoPage.tsx): calcula metros por pixel a partir de
// zoom+latitude e arredonda para o maior valor "redondo" (1/2/5 × 10^n) que caberia na
// barra. É o número usado para decidir se a infra passiva aparece no mapa — ver
// PASSIVE_INFRA_MAX_SCALE_METERS.

// Metros por pixel no equador em zoom 0 (constante de projeção Web Mercator do Google Maps).
const EARTH_METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392;

// Largura de referência (px) da barra de escala — usada só no FALLBACK de mapScaleMeters,
// quando readGoogleScaleMeters não acha o controle no DOM. O caminho normal lê o valor
// exato da barra do Google, então esta constante quase nunca entra em jogo; ~64 px é a
// melhor estimativa da barra real do Google (100 px arredondava um passo acima).
const SCALE_BAR_MAX_PX = 64;

// Acima deste valor, a infra passiva (recursos + cabos) some do mapa — só Estações continuam.
export const PASSIVE_INFRA_MAX_SCALE_METERS = 200;

// Só agrupa (clusters azuis) acima desta escala. Em ≤ 100 m cada recurso vira um ícone
// individual — o usuário já está perto o bastante para ver caixa a caixa.
export const MARKER_CLUSTER_MIN_SCALE_METERS = 100;

const metersPerPixel = (zoom: number, latDeg: number): number =>
  (EARTH_METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom;

// Maior valor 1/2/5 × 10^n que não ultrapassa `maxMeters` — mesmo padrão de arredondamento
// da barra de escala do Google/Leaflet, para o corte de 200 m corresponder ao que o usuário
// vê na `scaleControl`.
const largestNiceValue = (maxMeters: number): number => {
  if (!Number.isFinite(maxMeters) || maxMeters <= 0) return 0;
  const exponent = Math.floor(Math.log10(maxMeters));
  const steps = [1, 2, 5, 10];
  let best = 10 ** exponent;
  for (const step of steps) {
    const candidate = step * 10 ** exponent;
    if (candidate <= maxMeters) best = candidate;
  }
  return best;
};

export function mapScaleMeters(zoom: number, latDeg: number): number {
  return largestNiceValue(metersPerPixel(zoom, latDeg) * SCALE_BAR_MAX_PX);
}

// Lê o valor da barra de escala nativa do Google (ex.: "100 m", "1 km") direto do DOM.
// É exatamente o número que o usuário vê no canto do mapa e sobre o qual as regras de
// escala (200 m / 100 m) são definidas — replicar o cálculo do Google por zoom+px erra por
// um passo de arredondamento. Devolve null se o controle não for achado (cai no cálculo).
export function readGoogleScaleMeters(container: HTMLElement | null): number | null {
  if (!container) return null;
  // Os controles de canto do Google (escala, atalhos, termos, copyright) usam esta classe.
  // Só o da escala casa com "<número> m|km"; os demais textos não têm esse padrão.
  const controls = container.querySelectorAll('.gm-style-cc');
  for (const el of Array.from(controls)) {
    const match = (el.textContent ?? '').match(/(\d+(?:[.,]\d+)?)\s*(m|km)\b/i);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      return match[2].toLowerCase() === 'km' ? value * 1000 : value;
    }
  }
  return null;
}
