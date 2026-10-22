// Leitura genérica de Recursos pontuais do mapa por bbox (issue #416). Mesmo desenho de
// GeoMapSiteService (#314): uma consulta por viewport estabilizada, filtrada no servidor pelos
// ResourceTypes cujas camadas POINT estão visíveis no Studio GEO (`sourceModelIds`).
//
// Substitui, no mapa, o fan-out de tiles z16 de GET /v1/geo/map/tile: lá o custo crescia com a
// ÁREA da viewport (um fetch por tile de ~570 m, todos os tipos misturados), e uma camada pontual
// ligada em "Acima de 1 km" travava o browser em escala nacional mesmo com poucos recursos. Aqui o
// custo é o número de pontos das camadas ligadas, com teto e `truncated`.
//
// Lê o mesmo read-model (geographic_map_feature); um recurso pontual mora em exatamente uma linha
// (`lod_key = 'base'`), então não há duplicidade.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { TileBoundsRect } from './map-tile.js';
import { toMapTileFeature, type MapFeatureRow, type MapTileFeature } from './map-tile-service.js';

// Teto defensivo de linhas devolvidas por viewport. Estourá-lo sinaliza `truncated`, nunca falha
// silenciosamente: o cliente sabe que há mais Recursos do que os desenhados.
export const MAP_RESOURCE_MAX_RESULTS = 5_000;

export type MapResourceResult = { features: MapTileFeature[]; truncated: boolean };

export class GeoMapResourceService {
  public constructor(private readonly db: DatabaseClient) {}

  public async resources(
    bounds: TileBoundsRect,
    sourceModelIds: readonly string[],
    options: { tenantId?: string; limit?: number } = {},
  ): Promise<MapResourceResult> {
    if (sourceModelIds.length === 0) return { features: [], truncated: false };
    const tenantId = options.tenantId ?? 'default';
    const limit = Math.min(options.limit ?? MAP_RESOURCE_MAX_RESULTS, MAP_RESOURCE_MAX_RESULTS);
    const placeholders = sourceModelIds.map(() => '?').join(', ');
    // Sem filtro de status: a régua de quem entra no índice (terminated fora) é do synchronizer
    // e de build-map-features.mjs — mesma semântica que GET /v1/geo/map/tile sempre teve.
    const rows = await this.db.all<MapFeatureRow>(
      `SELECT f.entity_id, f.feature_kind, f.entity_type, f.shape, f.type_code, f.site_category,
              f.source_model_type, f.source_model_id, f.status, f.label, f.sublabel, f.lng, f.lat,
              f.geometry
         FROM geographic_map_feature f
        WHERE f.tenant_id = ?
          AND f.feature_kind = 'resource'
          AND f.shape = 'point'
          AND f.source_model_type = 'RESOURCE_TYPE'
          AND f.source_model_id IN (${placeholders})
          AND f.lng >= ? AND f.lng <= ?
          AND f.lat >= ? AND f.lat <= ?
          AND f.lod_key = 'base'
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
