// Leitura agregada das LINHAS do mapa por bbox (issue #317). Cada camada LINE do Studio GEO tem
// perfis de LOD materializados em `geo_map_feature.lod_key`; o cliente pede, por camada, exatamente o
// LOD da faixa de escala atual. Uma chamada por viewport devolve só os fragmentos ocupados — sem
// enumerar tiles vazios. Fragmentos de tiles adjacentes são partes necessárias da geometria (a margem
// de recorte evita costuras), por isso não há DISTINCT por entidade.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { lngLatToTile, type TileBoundsRect } from './map-tile.js';
import { toMapTileFeature, type MapFeatureRow, type MapTileFeature } from './map-tile-service.js';

// Teto defensivo de fragmentos por viewport; estourá-lo sinaliza `truncated`, nunca silencioso.
export const MAP_LINE_MAX_FRAGMENTS = 20_000;
export const MAP_LINE_MAX_SELECTIONS = 50;

export type MapLineSelection = { sourceModelId: string; lodKey: string };

export type MapLineResult = {
  features: MapTileFeature[];
  truncated: boolean;
  /** Diagnóstico por seleção: fragmentos devolvidos. Não contém geometria. */
  selections: Array<
    MapLineSelection & {
      tileZoom: number | null;
      fragments: number;
      /** Índice desatualizado: o manifesto não tem este perfil (rebuild pendente). */
      stale: boolean;
    }
  >;
};

type LineRow = MapFeatureRow & { tile_z: number };

export class GeoMapLineService {
  public constructor(private readonly db: DatabaseClient) {}

  public async lines(
    bounds: TileBoundsRect,
    selections: readonly MapLineSelection[],
    options: { tenantId?: string; limit?: number } = {},
  ): Promise<MapLineResult> {
    const tenantId = options.tenantId ?? 'default';
    const limit = Math.min(options.limit ?? MAP_LINE_MAX_FRAGMENTS, MAP_LINE_MAX_FRAGMENTS);
    const features: MapTileFeature[] = [];
    const diagnostics: MapLineResult['selections'] = [];
    let truncated = false;
    const manifest = await this.manifestKeys(tenantId);
    const isStale = (selection: MapLineSelection): boolean =>
      manifest !== null && !manifest.has(`${selection.sourceModelId}\u0000${selection.lodKey}`);

    for (const selection of selections) {
      const remaining = limit - features.length;
      if (remaining <= 0) {
        truncated = true;
        diagnostics.push({ ...selection, tileZoom: null, fragments: 0, stale: isStale(selection) });
        continue;
      }
      // O zoom de armazenamento é propriedade do perfil: descobre-o no próprio índice.
      const zoomRow = await this.db.get<{ tile_z: number }>(
        `SELECT MIN(tile_z) AS tile_z
           FROM geo_map_feature
          WHERE tenant_id = ? AND feature_kind = 'resource' AND shape IN ('line', 'polygon')
            AND source_model_id = ? AND lod_key = ?`,
        [tenantId, selection.sourceModelId, selection.lodKey],
      );
      const tileZoom = zoomRow?.tile_z ?? null;
      if (tileZoom === null) {
        diagnostics.push({ ...selection, tileZoom: null, fragments: 0, stale: isStale(selection) });
        continue;
      }
      const nw = lngLatToTile(bounds.minLng, bounds.maxLat, tileZoom);
      const se = lngLatToTile(bounds.maxLng, bounds.minLat, tileZoom);
      const rows = await this.db.all<LineRow>(
        `SELECT entity_id, feature_kind, entity_type, shape, type_code, site_category,
                source_model_type, source_model_id, status, label, sublabel, lng, lat, geometry,
                tile_z
           FROM geo_map_feature
          WHERE tenant_id = ? AND feature_kind = 'resource' AND shape IN ('line', 'polygon')
            AND source_model_id = ? AND lod_key = ? AND tile_z = ?
            AND tile_x >= ? AND tile_x <= ? AND tile_y >= ? AND tile_y <= ?
          ORDER BY tile_x, tile_y, entity_id, rank
          FETCH FIRST ? ROWS ONLY`,
        [
          tenantId,
          selection.sourceModelId,
          selection.lodKey,
          tileZoom,
          nw.x,
          se.x,
          nw.y,
          se.y,
          remaining + 1,
        ],
      );
      if (rows.length > remaining) truncated = true;
      const kept = rows.slice(0, remaining);
      features.push(...kept.map(toMapTileFeature));
      diagnostics.push({
        ...selection,
        tileZoom,
        fragments: kept.length,
        stale: isStale(selection),
      });
    }
    return { features, truncated, selections: diagnostics };
  }

  // Chaves camada×LOD do manifesto; null se ele não existe (V28 não migrada ou nunca gerado) —
  // aí não há como afirmar que o índice está desatualizado.
  private async manifestKeys(tenantId: string): Promise<Set<string> | null> {
    try {
      const rows = await this.db.all<{ source_model_id: string; lod_key: string }>(
        'SELECT source_model_id, lod_key FROM geo_map_line_index WHERE tenant_id = ?',
        [tenantId],
      );
      if (rows.length === 0) return null;
      return new Set(rows.map((row) => `${row.source_model_id}\u0000${row.lod_key}`));
    } catch {
      return null;
    }
  }
}
