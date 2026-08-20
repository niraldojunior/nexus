// Leitura do índice de exibição do mapa (geo_map_feature — Fase 2 da reengenharia de
// performance, issue #69). Serviço deliberadamente pequeno e separado de GeoTreeService: a
// árvore lê o grafo/hierarquia ao vivo, este lê um artefato pré-computado por tile
// (scripts/build-map-features.mjs) — dois read-models diferentes, sem relação de substituição
// direta (GeoTreeService.resourcesInViewport continua servindo useAddressViability e qualquer
// chamador que ainda não fala tile).
//
// A consulta é só uma igualdade de 4 colunas contra a PK de geo_map_feature — não há filtro,
// JOIN, parse de JSON ou grafo no caminho de leitura; o custo não cresce com o tamanho da base,
// só com a densidade do próprio tile (ver EXPLAIN ANALYZE no bench de performance da issue).

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { GeoJSONLineString } from './domain.js';
import type { Tile } from './map-tile.js';

export type MapTileFeature = {
  entityId: string;
  kind: 'resource' | 'site';
  entityType: string;
  shape: 'point' | 'line';
  typeCode?: string;
  siteCategory?: string;
  status?: string;
  label: string;
  sublabel?: string;
  lng: number;
  lat: number;
  // Só em shape 'line' — o trecho da rota já recortado (com margem) para este tile.
  geometry?: GeoJSONLineString;
};

type MapFeatureRow = {
  entity_id: string;
  feature_kind: 'resource' | 'site';
  entity_type: string;
  shape: 'point' | 'line';
  type_code: string | null;
  site_category: string | null;
  status: string | null;
  label: string;
  sublabel: string | null;
  lng: number;
  lat: number;
  geometry: string | null;
};

export class GeoMapTileService {
  public constructor(private readonly db: DatabaseClient) {}

  public async tile(tile: Tile, options: { tenantId?: string } = {}): Promise<MapTileFeature[]> {
    const tenantId = options.tenantId ?? 'default';
    const rows = await this.db.all<MapFeatureRow>(
      `SELECT entity_id, feature_kind, entity_type, shape, type_code, site_category, status,
              label, sublabel, lng, lat, geometry
         FROM geo_map_feature
        WHERE tenant_id = ? AND tile_z = ? AND tile_x = ? AND tile_y = ?`,
      [tenantId, tile.z, tile.x, tile.y],
    );
    return rows.map(toFeature);
  }
}

function toFeature(row: MapFeatureRow): MapTileFeature {
  const feature: MapTileFeature = {
    entityId: row.entity_id,
    kind: row.feature_kind,
    entityType: row.entity_type,
    shape: row.shape,
    label: row.label,
    lng: row.lng,
    lat: row.lat,
  };
  if (row.type_code) feature.typeCode = row.type_code;
  if (row.site_category) feature.siteCategory = row.site_category;
  if (row.status) feature.status = row.status;
  if (row.sublabel) feature.sublabel = row.sublabel;
  if (row.shape === 'line' && row.geometry) {
    try {
      feature.geometry = JSON.parse(row.geometry) as GeoJSONLineString;
    } catch {
      // Geometria corrompida no índice — devolve o ponto-âncora sem a rota; um rebuild do
      // índice (build-map-features.mjs) resolve na próxima execução.
    }
  }
  return feature;
}
