// Manchas de concentração/dispersão de um Projeto de trabalho (REQ-MOD01-017).
//
// Um projeto carregado em massa acumula dezenas de milhares de GeographicSite. Olhar pin a pin
// não revela onde a planta está concentrada nem onde há erro de coordenada/cadastro (locais
// isolados, longe de todo o resto). Este módulo agrupa os locais por proximidade espacial —
// mesma técnica de `coverage-grid.ts` (grade Mercator + componente conexo + traçado suavizado),
// mas com UMA classe sintética só (não há "bairro": todo local do projeto concorre no mesmo
// espaço) e o critério de corte é CONTAGEM DE LOCAIS por componente, não de células.
//
// Mancha com `minSites` locais ou mais = concentração (região onde o cadastro está coerente);
// abaixo disso = dispersão (candidato a erro de coordenada — ver o script
// scripts/build-project-areas.mjs, que também lista as dispersões com distância ao centroide da
// maior concentração).
//
// Função pura (sem banco, sem I/O) — o mesmo motivo de coverage-grid.ts: o script de geração
// (via dist/) e o teste unitário compõem em cima.

import type { GeoJSONPolygon } from './domain.js';
import {
  connectedComponents,
  lngLatToMercator,
  stampCells,
  tracePolygon,
  type CdoPoint,
} from './coverage-grid.js';

// Raio de agrupamento: dois locais a menos de 2× isto caem na mesma mancha (mesmo raciocínio do
// disco de cobertura em coverage-grid.ts). 200 m — validado contra a carga real (Onitel):
// separa a mancha urbana das dispersões sem fragmentar demais uma área densa.
export const PROJECT_AREA_RADIUS_METERS = 200;

// Célula de traçado — mesma resolução da cobertura GPON (COVERAGE_CELL_METERS), suave o
// bastante para o contorno da mancha sem custo extra de grade.
export const PROJECT_AREA_CELL_METERS = 50;

// Abaixo desta contagem de locais, o componente é dispersão (roxo); a partir daqui, concentração
// (azul). Local isolado (1) sempre é dispersão — nunca há componente com 0 locais.
export const PROJECT_AREA_MIN_SITES = 5;

// Chave sintética única: o algoritmo de coverage-grid.ts agrupa por "bairro dominante", mas aqui
// não há classe — todo local do projeto disputa o mesmo espaço, então uma chave fixa faz todos
// os discos competirem entre si (sem isso, cada local viraria sua própria "classe" e nunca se
// fundiria com o vizinho).
const SYNTHETIC_KEY = '_project';

export type ProjectSitePoint = {
  siteId: string;
  lng: number;
  lat: number;
};

export type ProjectAreaKind = 'concentration' | 'dispersion';

export type ProjectArea = {
  kind: ProjectAreaKind;
  siteCount: number;
  // Amostra de ids do componente (não a lista inteira — uma mancha de milhares de locais não
  // precisa carregar todos os ids na characteristic gravada). Cap em MAX_SAMPLE_SITE_IDS.
  siteIds: string[];
  centroid: [number, number];
  areaKm2: number;
  geometry: GeoJSONPolygon;
};

export type BuildProjectAreasOptions = {
  radiusMeters?: number;
  cellMeters?: number;
  minSites?: number;
};

export type BuildProjectAreasResult = {
  areas: ProjectArea[];
  // Locais que carimbaram alguma célula mas cujo componente não produziu um polígono válido
  // (grade degenerada, caso raríssimo) — o chamador decide se relata como "sem mancha".
  orphanSiteIds: string[];
};

const MAX_SAMPLE_SITE_IDS = 50;

const cellKeyOf = (lng: number, lat: number, cellMeters: number): string => {
  const [x, y] = lngLatToMercator(lng, lat);
  return `${Math.floor(x / cellMeters)},${Math.floor(y / cellMeters)}`;
};

export function buildProjectAreas(
  points: ProjectSitePoint[],
  options: BuildProjectAreasOptions = {},
): BuildProjectAreasResult {
  const radiusMeters = options.radiusMeters ?? PROJECT_AREA_RADIUS_METERS;
  const cellMeters = options.cellMeters ?? PROJECT_AREA_CELL_METERS;
  const minSites = options.minSites ?? PROJECT_AREA_MIN_SITES;

  if (points.length === 0) return { areas: [], orphanSiteIds: [] };

  const cdos: CdoPoint[] = points.map((point) => ({
    lng: point.lng,
    lat: point.lat,
    available: true,
    neighborhoodKey: SYNTHETIC_KEY,
    neighborhood: SYNTHETIC_KEY,
    city: SYNTHETIC_KEY,
    uf: SYNTHETIC_KEY,
  }));

  const cells = stampCells(cdos, cellMeters, radiusMeters);
  const components = connectedComponents(cells);

  // Índice célula → índice do componente, para atribuir cada local (não cada célula) ao seu
  // componente — um local sempre carimba a própria célula (distância 0 ao próprio ponto).
  const componentIndexByCell = new Map<string, number>();
  components.forEach((component, index) => {
    for (const cell of component) componentIndexByCell.set(`${cell.gridX},${cell.gridY}`, index);
  });

  const sitesByComponent = new Map<number, ProjectSitePoint[]>();
  const orphanSiteIds: string[] = [];
  for (const point of points) {
    const key = cellKeyOf(point.lng, point.lat, cellMeters);
    const index = componentIndexByCell.get(key);
    if (index === undefined) {
      orphanSiteIds.push(point.siteId);
      continue;
    }
    const list = sitesByComponent.get(index) ?? [];
    list.push(point);
    sitesByComponent.set(index, list);
  }

  const areas: ProjectArea[] = [];
  components.forEach((componentCells, index) => {
    const sites = sitesByComponent.get(index);
    if (!sites || sites.length === 0) return;

    const geometry = tracePolygon(componentCells, cellMeters);
    if (!geometry) {
      orphanSiteIds.push(...sites.map((site) => site.siteId));
      return;
    }

    const lngSum = sites.reduce((sum, site) => sum + site.lng, 0);
    const latSum = sites.reduce((sum, site) => sum + site.lat, 0);
    const centroid: [number, number] = [
      round(lngSum / sites.length, 6),
      round(latSum / sites.length, 6),
    ];

    areas.push({
      kind: sites.length >= minSites ? 'concentration' : 'dispersion',
      siteCount: sites.length,
      siteIds: sites.slice(0, MAX_SAMPLE_SITE_IDS).map((site) => site.siteId),
      centroid,
      areaKm2: round(componentAreaKm2(componentCells, cellMeters), 4),
      geometry,
    });
  });

  return { areas, orphanSiteIds };
}

function componentAreaKm2(
  cells: Array<{ gridX: number; gridY: number }>,
  cellMeters: number,
): number {
  // Área verdadeira no chão por célula é `cellMeters²` em Mercator no equador; a distorção por
  // latitude é irrelevante aqui (é só um número de contexto no relatório, não um cálculo
  // regulatório) — soma simples, sem correção de cosseno.
  return (cells.length * cellMeters * cellMeters) / 1_000_000;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
