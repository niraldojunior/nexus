// Leitura da densidade agregada da planta (geo_map_density — Fase 4 da issue #69).
//
// Diferente de GeoMapTileService, que serve UM tile por requisição (o cliente sabe quais tiles
// z16 faltam no cache local), aqui a leitura é por BBOX: em zoom aberto a viewport cobre poucas
// células grossas, e pedir uma a uma custaria mais em ida-e-volta do que a própria consulta.
// Mesmo padrão de GeoCoverageService.areaIndexLevel, inclusive o truncamento.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { MapDensityZoom } from './map-density.js';

export type MapDensityCell = {
  x: number;
  y: number;
  // Entidades distintas na célula. Um cabo que atravessa vários tiles finos conta uma vez só
  // (ver COUNT(DISTINCT) no build) — a pergunta é "quanta planta há", não "quantos trechos".
  count: number;
  resources: number;
  sites: number;
  // Centroide das features, não o centro do tile: o ponto desenhado cai onde a planta está.
  lng: number;
  lat: number;
};

export type MapDensityResponse = {
  z: MapDensityZoom;
  cells: MapDensityCell[];
  truncated: boolean;
};

export type MapDensityBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

// Teto por requisição. Uma viewport em z7 cobre poucas dezenas de células; este número é a
// válvula contra bbox anômalo (deep-link com coordenada corrompida, mundo inteiro), não o caso
// normal. Mesma postura de MAX_AREAS em GeoCoverageService.
const MAX_CELLS = 4000;

type DensityRow = {
  tile_x: number;
  tile_y: number;
  feature_count: number;
  resource_count: number;
  site_count: number;
  lng: number;
  lat: number;
};

export class GeoMapDensityService {
  public constructor(private readonly db: DatabaseClient) {}

  public async density(
    z: MapDensityZoom,
    bounds: MapDensityBounds,
    options: { tenantId?: string } = {},
  ): Promise<MapDensityResponse> {
    const tenantId = options.tenantId ?? 'default';
    // Recorte pelo CENTROIDE, não pelo retângulo do tile: o centroide é o que o cliente desenha,
    // então uma célula cujo centroide caiu fora da viewport não tem o que mostrar. Evita também
    // ter que reconstruir tileBounds no SQL (trigonometria de Mercator inverso).
    const rows = await this.db.all<DensityRow>(
      `SELECT tile_x, tile_y, feature_count, resource_count, site_count, lng, lat
         FROM geo_map_density
        WHERE tenant_id = ? AND tile_z = ?
          AND lng BETWEEN ? AND ?
          AND lat BETWEEN ? AND ?
        ORDER BY feature_count DESC
        LIMIT ?`,
      [tenantId, z, bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat, MAX_CELLS + 1],
    );

    // Pede MAX+1 e usa o excedente como flag; o ORDER BY faz o corte preservar as células mais
    // densas, que são as que o usuário precisa ver primeiro.
    const truncated = rows.length > MAX_CELLS;
    const scoped = truncated ? rows.slice(0, MAX_CELLS) : rows;

    return {
      z,
      truncated,
      cells: scoped.map((row) => ({
        x: row.tile_x,
        y: row.tile_y,
        count: row.feature_count,
        resources: row.resource_count,
        sites: row.site_count,
        lng: row.lng,
        lat: row.lat,
      })),
    };
  }
}
