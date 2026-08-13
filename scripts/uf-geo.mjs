/**
 * Fonte única de dados geográficos por UF para os scripts de carga.
 *
 * Antes cada script trazia (ou hardcodava) sua própria caixa de coordenadas — o
 * conversor e o loader de recursos estavam travados no Rio de Janeiro, e a
 * carga de estações tinha sua própria cópia de `UF_BBOX`. Este módulo centraliza
 * as duas coisas para que qualquer UF no layout "estado" (recursos_<uf>_<data>.csv)
 * seja carregável passando apenas `--uf`.
 *
 *   · UF_BBOX  — caixa delimitadora aproximada por UF, [latMin, latMax, lonMin, lonMax],
 *     com folga. Não é precisão de fronteira: serve para rejeitar coordenada
 *     "consistente com o Brasil" mas claramente de outra região (lixo grosseiro
 *     de digitação/parse). Valores idênticos aos que viviam em estacoes_carregar.mjs.
 *   · UF_NAME_TO_ABBREV — nome por extenso (como vem na coluna `UF` do Netwin,
 *     sem acento e em caixa alta: "PARANA", "DISTRITO FEDERAL") → sigla de 2 letras.
 */

// [latMin, latMax, lonMin, lonMax]
export const UF_BBOX = {
  AC: [-11.4, -7.0, -74.2, -66.5],
  AL: [-10.6, -8.7, -38.3, -35.0],
  AP: [-1.3, 4.6, -54.9, -49.8],
  AM: [-9.9, 2.3, -73.9, -56.0],
  BA: [-18.5, -8.4, -46.7, -37.2],
  CE: [-8.0, -2.6, -41.5, -37.1],
  DF: [-16.2, -15.4, -48.4, -47.2],
  ES: [-21.4, -17.8, -42.0, -39.5],
  GO: [-19.6, -12.3, -53.4, -45.8],
  MA: [-10.4, -0.9, -48.9, -41.7],
  MT: [-18.1, -7.2, -61.7, -50.1],
  MS: [-24.2, -17.1, -58.3, -50.8],
  MG: [-23.0, -14.1, -51.1, -39.8],
  PA: [-9.9, 2.7, -59.0, -45.9],
  PB: [-8.4, -5.9, -38.9, -34.7],
  PR: [-26.8, -22.4, -54.7, -47.9],
  PE: [-9.6, -7.2, -41.5, -32.3],
  PI: [-11.0, -2.6, -46.0, -40.3],
  RJ: [-23.5, -20.6, -45.0, -40.8],
  RN: [-7.0, -4.7, -38.7, -34.8],
  RS: [-33.9, -26.9, -57.8, -49.5],
  RO: [-13.8, -7.8, -66.9, -59.6],
  RR: [-1.7, 5.4, -64.9, -58.9],
  SC: [-29.5, -25.8, -54.0, -48.2],
  SP: [-25.5, -19.6, -53.3, -44.0],
  SE: [-11.7, -9.4, -38.4, -36.3],
  TO: [-13.6, -5.0, -50.9, -45.6],
};

export const VALID_UF = new Set(Object.keys(UF_BBOX));

// Nome por extenso (sem acento, caixa alta) → sigla. As chaves batem com o que a
// coluna `UF` do export Netwin traz ("PARANA", "GOIAS", "DISTRITO FEDERAL").
export const UF_NAME_TO_ABBREV = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAPA: 'AP',
  AMAZONAS: 'AM',
  BAHIA: 'BA',
  CEARA: 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  GOIAS: 'GO',
  MARANHAO: 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  PARA: 'PA',
  PARAIBA: 'PB',
  PARANA: 'PR',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  RONDONIA: 'RO',
  RORAIMA: 'RR',
  'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP',
  SERGIPE: 'SE',
  TOCANTINS: 'TO',
};

// Remove acento, colapsa espaço e sobe a caixa — para casar "Paraná"/"PARANÁ"
// com a chave "PARANA".
const fold = (raw) =>
  String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

// Resolve uma sigla de UF a partir de uma sigla ("PR", "pr") OU de um nome por
// extenso ("Paraná", "PARANA", "DISTRITO FEDERAL"). Devolve null se não conhecer.
export function ufAbbrev(input) {
  const f = fold(input);
  if (!f) return null;
  if (VALID_UF.has(f)) return f;
  return UF_NAME_TO_ABBREV[f] ?? null;
}

// Caixa [latMin, latMax, lonMin, lonMax] da UF (aceita sigla ou nome). null se desconhecida.
export function bboxForUf(input) {
  const uf = ufAbbrev(input);
  return uf ? UF_BBOX[uf] : null;
}

// Converte a caixa para a convenção do load-recursos-netwin.mjs:
// { uf, LAT_RANGE: [min,max], LNG_RANGE: [min,max] }. null se UF desconhecida.
export function loaderRangesForUf(input) {
  const uf = ufAbbrev(input);
  if (!uf) return null;
  const [latMin, latMax, lonMin, lonMax] = UF_BBOX[uf];
  return { uf, LAT_RANGE: [latMin, latMax], LNG_RANGE: [lonMin, lonMax] };
}

export function inBbox(lat, lng, bbox) {
  const [latMin, latMax, lonMin, lonMax] = bbox;
  return lat >= latMin && lat <= latMax && lng >= lonMin && lng <= lonMax;
}
