// Leitura genérica de GeographicSites do mapa por bbox (issue #314). Todo Site pontual publicado
// no Studio GEO — Estação, Subestação ou qualquer specification futura — passa por este único
// caminho: uma consulta por viewport estabilizada, sem enumerar tiles técnicos z16 e sem tratar
// nenhum código de specification de forma especial. Quem decide QUAIS specifications entram é o
// chamador (catálogo publicado do Studio GEO), via `sourceModelIds`.
//
// Lê o mesmo read-model de GeoMapTileService (geo_map_feature); um Site pontual mora em exatamente
// uma linha, então não há duplicidade entre tiles.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { TileBoundsRect } from './map-tile.js';
import { toMapTileFeature, type MapFeatureRow, type MapTileFeature } from './map-tile-service.js';

// Teto defensivo de linhas devolvidas por viewport. Estourá-lo sinaliza `truncated`, nunca falha
// silenciosamente: o cliente sabe que há mais Sites do que os desenhados.
export const MAP_SITE_MAX_RESULTS = 5_000;

export type MapSiteResult = { features: MapTileFeature[]; truncated: boolean };

export class GeoMapSiteService {
  public constructor(private readonly db: DatabaseClient) {}

  public async sites(
    bounds: TileBoundsRect,
    sourceModelIds: readonly string[],
    options: { tenantId?: string; limit?: number } = {},
  ): Promise<MapSiteResult> {
    if (sourceModelIds.length === 0) return { features: [], truncated: false };
    const tenantId = options.tenantId ?? 'default';
    const limit = Math.min(options.limit ?? MAP_SITE_MAX_RESULTS, MAP_SITE_MAX_RESULTS);
    const placeholders = sourceModelIds.map(() => '?').join(', ');
    const rows = await this.db.all<MapFeatureRow>(
      `SELECT f.entity_id, f.feature_kind, f.entity_type, f.shape, f.type_code, f.site_category,
              f.source_model_type, f.source_model_id, f.status, f.label, f.sublabel, f.lng, f.lat,
              f.geometry
         FROM geo_map_feature f
        WHERE f.tenant_id = ?
          AND f.feature_kind = 'site'
          AND f.shape = 'point'
          AND f.source_model_type = 'GEOGRAPHIC_SITE_SPECIFICATION'
          AND f.source_model_id IN (${placeholders})
          AND f.lng >= ? AND f.lng <= ?
          AND f.lat >= ? AND f.lat <= ?
          AND (f.status IS NULL OR f.status NOT IN ('Retired', 'terminated'))
          AND NOT EXISTS (
            SELECT 1 FROM geo_project_site ps
              JOIN geo_project p ON p.id = ps.project_id
             WHERE ps.site_id = f.entity_id AND p.status <> 'terminated'
          )
        ORDER BY f.lng, f.lat, f.entity_id
        FETCH FIRST ? ROWS ONLY`,
      [
        tenantId,
        ...sourceModelIds,
        bounds.minLng,
        bounds.maxLng,
        bounds.minLat,
        bounds.maxLat,
        limit + 1,
      ],
    );
    const truncated = rows.length > limit;
    return { features: rows.slice(0, limit).map(toMapTileFeature), truncated };
  }
}
