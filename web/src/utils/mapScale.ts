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

// Acima deste valor, a infra passiva (recursos + cabos) some do mapa. No lugar dela entra
// a camada de cobertura GPON (ver COVERAGE_MIN_SCALE_METERS); Estações continuam visíveis.
export const PASSIVE_INFRA_MAX_SCALE_METERS = 200;

// Cobertura GPON (mapa de calor por bairro) entra ACIMA desta escala — "visível para
// qualquer escala acima de 100 m". Em ≤ 100 m só a planta individual aparece; não há mais
// cluster (bolas azuis numeradas foram removidas). Na faixa 100–200 m a mancha e os ícones
// de caixa coexistem.
export const COVERAGE_MIN_SCALE_METERS = 100;

// Nível da cobertura por escala: grade fina de 150 m até aqui, grade grossa (750 m) até
// COVERAGE_COARSE_MAX_SCALE_METERS e polígonos de bairro acima disso.
export const COVERAGE_FINE_MAX_SCALE_METERS = 500;
export const COVERAGE_COARSE_MAX_SCALE_METERS = 10_000;

// Estações: tamanho cheio até aqui; a partir de 1 km viram pontos pequenos (sem agrupamento) —
// já nas escalas de 1 e 2 km. Permanecem visíveis em qualquer escala, inclusive acima de 50 km.
export const STATION_SMALL_MIN_SCALE_METERS = 1_000;

// Recursos (caixas/splitters): tamanho cheio bem de perto (≤ 50 m) e reduzidos a partir de
// 100 m — na faixa 100–200 m, onde ainda aparecem junto da cobertura, ícones menores poluem
// menos (mesmo espírito da redução das estações em escala grande).
export const RESOURCE_SMALL_MIN_SCALE_METERS = 100;

export type CoverageLevel = 'fine' | 'coarse' | 'area';
export type StationTier = 'full' | 'small';

// Cobertura visível? Acima de 100 m, em qualquer escala.
export const coverageVisibleAtScale = (scaleMeters: number | null): boolean =>
  scaleMeters !== null && scaleMeters > COVERAGE_MIN_SCALE_METERS;

// Nível de cobertura a pedir ao servidor para a escala atual (ver GeoCoverageService).
export function coverageLevelForScale(scaleMeters: number): CoverageLevel {
  if (scaleMeters <= COVERAGE_FINE_MAX_SCALE_METERS) return 'fine';
  if (scaleMeters <= COVERAGE_COARSE_MAX_SCALE_METERS) return 'coarse';
  return 'area';
}

// Como desenhar a Estação na escala atual: cheia (perto) ou pequena (longe). Nunca oculta —
// as estações permanecem visíveis em qualquer escala.
export function stationTierForScale(scaleMeters: number | null): StationTier {
  if (scaleMeters === null) return 'full';
  if (scaleMeters >= STATION_SMALL_MIN_SCALE_METERS) return 'small';
  return 'full';
}

// Como desenhar o Recurso (caixa/splitter) na escala atual: cheio em zoom bem fechado (≤ 50 m),
// reduzido a partir de 100 m (faixa 100–200 m).
export function resourceTierForScale(scaleMeters: number | null): StationTier {
  if (scaleMeters === null) return 'full';
  if (scaleMeters >= RESOURCE_SMALL_MIN_SCALE_METERS) return 'small';
  return 'full';
}

// Metros por pixel na tela para um dado zoom e latitude (projeção Web Mercator do
// Google). Exportado para a câmera (mapCamera.ts) estimar em pixels a distância de um
// salto — quantos viewports separam o centro atual do alvo — e decidir se afasta antes
// de voar.
export const metersPerPixel = (zoom: number, latDeg: number): number =>
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

// Escala-alvo ao saltar para a localização do dispositivo: ~20 m coloca o usuário na
// própria calçada, resolução de campo (ver zoomForScaleMeters e MapLocateButton).
export const DEVICE_LOCATION_SCALE_METERS = 20;

// Escala-alvo de chegada ao focar cada tipo de item, na régua do mapa (ver
// mapCamera.flyTo). Recurso é a caixa/porta — resolução de campo; Site é a estação — o
// prédio e a quadra dele; Endereço é a fachada. A câmera só APROXIMA até aqui quando o
// zoom atual está aberto demais (ver flyTo); se já estava perto, não mexe.
export const RESOURCE_FOCUS_SCALE_METERS = 20;
export const SITE_FOCUS_SCALE_METERS = 50;
export const ADDRESS_FOCUS_SCALE_METERS = 30;

// Escala final de uma seleção feita na consulta de locais.
export const MAP_SELECTION_SCALE_METERS = 50;

// Inverso de mapScaleMeters, sem o arredondamento "nice value": o zoom para o qual a
// barra de escala representaria ~`meters` metros na latitude dada.
//
// ATENÇÃO: o retorno é FRACIONÁRIO. No mapa raster do Google, `setZoom` com fração é
// desenhado aplicando um `scale()` no contêiner inteiro do mapa — os tiles borram e
// TODOS os marcadores (alfinete, recursos, sites) incham junto. Sempre `Math.round`
// antes de `setZoom` (ver mapCamera.flyTo e handleDeviceLocate).
export function zoomForScaleMeters(meters: number, latDeg: number): number {
  const metersPerPixelTarget = meters / SCALE_BAR_MAX_PX;
  const raw = Math.log2(
    (EARTH_METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((latDeg * Math.PI) / 180)) / metersPerPixelTarget,
  );
  // Limita à faixa útil do Google Maps (0–22); a 50 m cai perto de 17–18.
  return Math.min(21, Math.max(1, raw));
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
