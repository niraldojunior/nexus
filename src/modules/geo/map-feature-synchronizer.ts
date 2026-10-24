// Write-through do índice de mapa. `geographic_map_feature` é um read-model derivado:
// este sincronizador o mantém alinhado aos writes unitários da API, sem tornar o
// mapa dependente de um rebuild batch. A régua de visibilidade (item interno,
// map_presence do catálogo, categoria de site, projeto em curso) espelha
// scripts/build-map-features.mjs de propósito — as duas fontes de escrita de
// geographic_map_feature têm que concordar, ou um recurso aparece/some conforme foi
// criado pela API ou por rebuild batch (foi assim que Porta de Splitter vazou
// no mapa: batch excluía por map_presence do catálogo, write-through não).

import type { DatabaseExecutor, DatabaseClient } from '../../shared/persistence/database-client.js';
import { MAP_DENSITY_ZOOMS, coarsenTile } from './map-density.js';
import { MAP_TILE_ZOOM, tileForPoint } from './map-tile.js';
import { excludeInternalResourceTypesSql } from './map-visibility.js';

type Candidate = {
  entity_id: string;
  feature_kind: 'resource' | 'site';
  entity_type: 'PhysicalResource' | 'GeographicSite';
  type_code: string | null;
  site_category: string | null;
  source_model_type: 'GEOGRAPHIC_SITE_SPECIFICATION' | 'RESOURCE_TYPE';
  source_model_id: string;
  status: string | null;
  label: string;
  sublabel: string | null;
  geometry: string;
};

// Linha pontual do índice, antes ou depois do write-through — o que a densidade precisa saber.
type PointRow = { feature_kind: string; tile_x: number; tile_y: number; lng: number; lat: number };

// Oracle limita `IN (...)` a 1000 expressões; um Site grande passa de 300 recursos.
const SYNC_CHUNK = 500;

export type MapFeatureSynchronizer = {
  syncEntity(entityId: string, tenantId: string): Promise<void>;
  /** Location mudou: ressincroniza o que está nela, direto ou via Site/Address. */
  syncLocation(locationId: string, tenantId: string): Promise<void>;
  /** Site mudou de Location: ressincroniza o Site e os recursos instalados nele. */
  syncSite(siteId: string, tenantId: string): Promise<void>;
};

export class GeoMapFeatureSynchronizer implements MapFeatureSynchronizer {
  public constructor(private readonly db: DatabaseClient) {}

  public async syncEntity(entityId: string, tenantId: string): Promise<void> {
    await this.syncEntities([entityId], tenantId);
  }

  // O place canônico de recurso é o Site (às vezes Address), não a Location — procurar só por
  // `place_id = location` deixava os recursos de um local movido na posição antiga (issue #425).
  public async syncLocation(locationId: string, tenantId: string): Promise<void> {
    const rows = await this.db.all<{ id: string }>(
      `SELECT r.id FROM resource_physical r
        WHERE r.tenant_id = ?
          AND (r.place_id = ?
               OR r.place_id IN (SELECT s.id FROM geographic_site s WHERE s.geographic_location_id = ?)
               OR r.place_id IN (SELECT a.id FROM geographic_address a WHERE a.geographic_location_id = ?))
       UNION
       SELECT id FROM geographic_site WHERE geographic_location_id = ? AND tenant_id = ?`,
      [tenantId, locationId, locationId, locationId, locationId, tenantId],
    );
    await this.syncEntities(
      rows.map((row) => row.id),
      tenantId,
    );
  }

  public async syncSite(siteId: string, tenantId: string): Promise<void> {
    const rows = await this.db.all<{ id: string }>(
      'SELECT id FROM resource_physical WHERE place_id = ? AND tenant_id = ?',
      [siteId, tenantId],
    );
    await this.syncEntities([siteId, ...rows.map((row) => row.id)], tenantId);
  }

  public async syncEntities(entityIds: string[], tenantId: string): Promise<void> {
    const ids = [...new Set(entityIds)];
    for (let start = 0; start < ids.length; start += SYNC_CHUNK) {
      await this.syncChunk(ids.slice(start, start + SYNC_CHUNK), tenantId);
    }
  }

  private async syncChunk(ids: string[], tenantId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db.transaction(async (session) => {
      const placeholders = ids.map(() => '?').join(',');
      // Só ponto: o write-through não sabe regravar traçado nem LOD de cabo (vem do rebuild
      // batch), então apagar as linhas `line` aqui faria o cabo editado sumir do mapa.
      const previous = await session.all<PointRow>(
        `SELECT feature_kind, tile_x, tile_y, lng, lat FROM geographic_map_feature
          WHERE tenant_id = ? AND shape = 'point' AND lod_key = 'base'
            AND entity_id IN (${placeholders})`,
        [tenantId, ...ids],
      );
      await session.execute(
        `DELETE FROM geographic_map_feature
          WHERE tenant_id = ? AND shape = 'point' AND entity_id IN (${placeholders})`,
        [tenantId, ...ids],
      );
      // Traçado de cabo só sai do mapa quando o recurso é terminado (C6).
      await session.execute(
        `DELETE FROM geographic_map_feature
          WHERE tenant_id = ? AND shape = 'line'
            AND entity_id IN (SELECT id FROM resource_physical
                               WHERE id IN (${placeholders}) AND tenant_id = ? AND status = 'terminated')`,
        [tenantId, ...ids, tenantId],
      );
      const candidates = await session.all<Candidate>(candidatesSql(placeholders), [
        ...ids,
        tenantId,
        ...ids,
        tenantId,
      ]);
      const inserted: PointRow[] = [];
      for (const candidate of candidates) {
        const row = await insertFeature(session, tenantId, candidate);
        if (row) inserted.push(row);
      }
      await applyDensityDelta(session, tenantId, densityDelta(previous, inserted));
    });
  }
}

// Variação de uma célula de densidade: contagens e soma de coordenadas que entram (+) ou saem (−).
export type DensityCellDelta = {
  z: number;
  x: number;
  y: number;
  features: number;
  resources: number;
  sites: number;
  sumLng: number;
  sumLat: number;
};

// Delta da densidade entre as linhas pontuais antes e depois do write-through. A densidade conta
// só `lod_key = 'base'` (build-map-density.mjs), que é exatamente uma linha pontual por entidade —
// então somar −1/+1 por célula reproduz o COUNT(DISTINCT) do rebuild, e as somas de lng/lat
// mantêm o centroide (AVG) exato. Recalcular a célula por GROUP BY não serve: uma célula z7 chega
// a ~3M features. Células que não mudam (entidade editada sem mover) ficam fora.
export function densityDelta(previous: PointRow[], inserted: PointRow[]): DensityCellDelta[] {
  const cells = new Map<string, DensityCellDelta>();
  const add = (row: PointRow, sign: 1 | -1) => {
    for (const zoom of MAP_DENSITY_ZOOMS) {
      const tile = coarsenTile({ z: MAP_TILE_ZOOM, x: row.tile_x, y: row.tile_y }, zoom);
      const key = `${tile.z}/${tile.x}/${tile.y}`;
      const cell = cells.get(key) ?? {
        ...tile,
        features: 0,
        resources: 0,
        sites: 0,
        sumLng: 0,
        sumLat: 0,
      };
      cell.features += sign;
      if (row.feature_kind === 'resource') cell.resources += sign;
      if (row.feature_kind === 'site') cell.sites += sign;
      cell.sumLng += sign * Number(row.lng);
      cell.sumLat += sign * Number(row.lat);
      cells.set(key, cell);
    }
  };
  for (const row of previous) add(row, -1);
  for (const row of inserted) add(row, 1);
  const EPSILON = 1e-9;
  return [...cells.values()].filter(
    (cell) =>
      cell.features !== 0 ||
      cell.resources !== 0 ||
      cell.sites !== 0 ||
      Math.abs(cell.sumLng) > EPSILON ||
      Math.abs(cell.sumLat) > EPSILON,
  );
}

// Aplica o delta em `geographic_map_density`. Tenant sem densidade construída fica como está: criar
// células avulsas a partir de um write-through daria um mapa agregado parcial, pior que nenhum.
// O UPDATE é aritmético no próprio banco (no Oracle todo SET lê o valor anterior da linha), e a
// célula que zera é removida em vez de ficar com contagem 0 e centroide indefinido.
async function applyDensityDelta(
  db: DatabaseExecutor,
  tenantId: string,
  cells: DensityCellDelta[],
): Promise<void> {
  if (cells.length === 0) return;
  const built = await db.get<{ found: number }>(
    'SELECT 1 AS found FROM geographic_map_density WHERE tenant_id = ? FETCH FIRST 1 ROWS ONLY',
    [tenantId],
  );
  if (!built) return;
  for (const cell of cells) {
    const key = [tenantId, cell.z, cell.x, cell.y];
    const updated = await db.execute(
      `UPDATE geographic_map_density
          SET lng = (lng * feature_count + ?) / (feature_count + ?),
              lat = (lat * feature_count + ?) / (feature_count + ?),
              feature_count = feature_count + ?,
              resource_count = resource_count + ?,
              site_count = site_count + ?
        WHERE tenant_id = ? AND tile_z = ? AND tile_x = ? AND tile_y = ?
          AND feature_count + ? > 0`,
      [
        cell.sumLng,
        cell.features,
        cell.sumLat,
        cell.features,
        cell.features,
        cell.resources,
        cell.sites,
        ...key,
        cell.features,
      ],
    );
    if (updated.changes > 0) continue;
    const removed = await db.execute(
      `DELETE FROM geographic_map_density
        WHERE tenant_id = ? AND tile_z = ? AND tile_x = ? AND tile_y = ? AND feature_count + ? <= 0`,
      [...key, cell.features],
    );
    if (removed.changes > 0 || cell.features <= 0) continue;
    await db.execute(
      `INSERT INTO geographic_map_density
         (tenant_id, tile_z, tile_x, tile_y, feature_count, resource_count, site_count, lng, lat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ...key,
        cell.features,
        Math.max(cell.resources, 0),
        Math.max(cell.sites, 0),
        cell.sumLng / cell.features,
        cell.sumLat / cell.features,
      ],
    );
  }
}

// Query de candidatos do write-through. Espelha a régua de scripts/build-map-features.mjs de
// propósito (ver comentário de topo do arquivo) — exportada como função pura, parametrizada só
// pelos placeholders de `id IN (...)`, para o teste de regressão da régua não precisar de banco
// (geo.map-feature-synchronizer.unit.spec.ts): confere a presença de 'Port' na exclusão de tipo
// interno, do JOIN de map_presence e do filtro de projeto em curso direto no texto do SQL.
export function candidatesSql(idPlaceholders: string): string {
  return `SELECT r.id entity_id, 'resource' feature_kind, 'PhysicalResource' entity_type,
                rt.code type_code, NULL site_category, 'RESOURCE_TYPE' source_model_type,
                rt.code source_model_id, r.status status, r.name label, NULL sublabel, l.geometry geometry
           FROM resource_physical r
           JOIN resource_specification rs
             ON rs.id = r.resource_specification_id AND rs.tenant_id = r.tenant_id
           JOIN resource_type rt
             ON rt.id = rs.resource_type_id
           LEFT JOIN geographic_site place_site
             ON place_site.id = r.place_id AND place_site.tenant_id = r.tenant_id
           LEFT JOIN geographic_address place_address
             ON place_address.id = r.place_id
           JOIN geographic_location l
             ON l.id = COALESCE(place_site.geographic_location_id, place_address.geographic_location_id, r.place_id)
          WHERE r.id IN (${idPlaceholders}) AND r.tenant_id = ? AND r.status <> 'terminated'
            AND ${excludeInternalResourceTypesSql('rt')}
            AND COALESCE(rt.map_presence, 1) = 1
            AND l.geometry_type = 'Point'
         UNION ALL
         SELECT s.id entity_id, 'site' feature_kind, 'GeographicSite' entity_type,
                NULL type_code, spec.category site_category,
                'GEOGRAPHIC_SITE_SPECIFICATION' source_model_type, spec.code source_model_id,
                s.status status, s.name label, spec.code sublabel, l.geometry geometry
           FROM geographic_site s
           JOIN geographic_site_specification spec ON spec.id = s.site_specification_id
           JOIN geographic_location l ON l.id = s.geographic_location_id
          WHERE s.id IN (${idPlaceholders}) AND s.tenant_id = ? AND spec.category = 'Site'
            AND s.status NOT IN ('Retired', 'terminated') AND l.geometry_type = 'Point'
            AND NOT EXISTS (
                  SELECT 1 FROM project_site ps
                    JOIN project p ON p.id = ps.project_id
                   WHERE ps.site_id = s.id AND p.status <> 'terminated'
                )`;
}

// Feature pontual do índice. `shape` é literal ('point' — o write-through só cobre ponto; cabo
// continua vindo do rebuild batch), `geometry` é NULL (só linha carrega traçado) e `rank` é 0.
// Exportado para o teste de aridade: a lista de colunas e a de VALUES são escritas à mão em
// linhas diferentes, e um `?` sobrando não quebra typecheck nem lint — só estoura em runtime,
// no primeiro recurso pontual que passar por aqui.
export const MAP_FEATURE_POINT_INSERT_SQL = `INSERT INTO geographic_map_feature
      (tenant_id,tile_z,tile_x,tile_y,entity_id,shape,feature_kind,entity_type,
       type_code,site_category,source_model_type,source_model_id,status,label,sublabel,lng,lat,geometry,rank)
     VALUES (?,?,?,?,?,'point',?,?,?,?,?,?,?,?,?,?,?,NULL,0)`;

async function insertFeature(
  db: DatabaseExecutor,
  tenantId: string,
  candidate: Candidate,
): Promise<PointRow | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.geometry);
  } catch {
    return undefined;
  }
  const coordinates =
    typeof parsed === 'object' && parsed !== null && 'coordinates' in parsed
      ? (parsed as { coordinates?: unknown }).coordinates
      : undefined;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  )
    return undefined;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  const tile = tileForPoint([lng, lat], MAP_TILE_ZOOM);
  await db.execute(MAP_FEATURE_POINT_INSERT_SQL, [
    tenantId,
    tile.z,
    tile.x,
    tile.y,
    candidate.entity_id,
    candidate.feature_kind,
    candidate.entity_type,
    candidate.type_code,
    candidate.site_category,
    candidate.source_model_type,
    candidate.source_model_id,
    candidate.status,
    candidate.label,
    candidate.sublabel,
    lng,
    lat,
  ]);
  return { feature_kind: candidate.feature_kind, tile_x: tile.x, tile_y: tile.y, lng, lat };
}
