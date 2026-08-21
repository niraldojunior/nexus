// Níveis de densidade agregada da planta (Fase 4 da issue #69) — função pura, sem I/O.
//
// Abaixo de PASSIVE_INFRA_MAX_SCALE_METERS (50 m) o mapa desenha feature por feature, lendo
// `geo_map_feature` por tile. Acima disso, desenhar centenas de milhares de pontos individuais
// não é só caro: é ilegível. Esta camada responde "onde há planta", não "qual é cada item".
//
// A grade não é métrica nova: é o PRÓPRIO tile de `geo_map_feature` (z16) reduzido por potência
// de 2. Isso mantém um só endereçamento entre índice, densidade, servidor e cliente, e faz a
// agregação virar divisão inteira — barata em SQL, sem trigonometria e sem materializar
// geometria no processo.

import { MAP_TILE_ZOOM, type Tile } from './map-tile.js';

// Zoom de armazenamento de cada nível. Escolhidos para casar com os degraus de escala que o
// cliente já usa para a cobertura GPON (ver coverageLevelForScale em web/src/utils/mapScale.ts),
// de modo que trocar de nível coincida com um degrau que o usuário já percebe:
//
//   z13 ≈ 4,6 km de lado  → escala 50 m .. 500 m   (bairro/cidade de perto)
//   z10 ≈ 36 km           → escala 500 m .. 10 km  (município/região)
//   z7  ≈ 300 km          → escala > 10 km         (estado/país)
//
// Todos precisam ser ≤ MAP_TILE_ZOOM: a redução só sabe agregar de um zoom fino para um mais
// grosso (dividir), nunca o contrário.
export const MAP_DENSITY_ZOOMS = [13, 10, 7] as const;

export type MapDensityZoom = (typeof MAP_DENSITY_ZOOMS)[number];

// Degraus de escala (metros da barra do Google) que selecionam o nível. Espelham
// COVERAGE_NEIGHBORHOOD_MAX_SCALE_METERS / COVERAGE_CITY_MAX_SCALE_METERS do cliente.
const DENSITY_FINE_MAX_SCALE_METERS = 500;
const DENSITY_MID_MAX_SCALE_METERS = 10_000;

// Nível a pedir para a escala atual. Só faz sentido acima da escala em que a planta individual
// some — abaixo disso quem responde é `geo_map_feature`, e o chamador nem chega aqui.
export function densityZoomForScale(scaleMeters: number): MapDensityZoom {
  if (scaleMeters <= DENSITY_FINE_MAX_SCALE_METERS) return 13;
  if (scaleMeters <= DENSITY_MID_MAX_SCALE_METERS) return 10;
  return 7;
}

export function isMapDensityZoom(value: number): value is MapDensityZoom {
  return (MAP_DENSITY_ZOOMS as readonly number[]).includes(value);
}

// Fator de redução de MAP_TILE_ZOOM para um zoom de densidade: quantos tiles finos cabem no
// lado de um tile grosso. z16 → z13 = 2^3 = 8, ou seja 8×8 = 64 tiles finos por célula.
export function densityFactor(zoom: MapDensityZoom): number {
  return 2 ** (MAP_TILE_ZOOM - zoom);
}

// Tile de densidade que contém um tile fino. `Math.floor` (não truncamento) porque índice de
// tile nunca é negativo na grade slippy — mas deixar explícito evita que uma mudança futura de
// origem da grade introduza o clássico bug de divisão com negativo.
export function coarsenTile(fine: Tile, zoom: MapDensityZoom): Tile {
  const factor = densityFactor(zoom);
  return { z: zoom, x: Math.floor(fine.x / factor), y: Math.floor(fine.y / factor) };
}
