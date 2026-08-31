// Write-through do índice de mapa. `geo_map_feature` é um read-model derivado:
// este sincronizador o mantém alinhado aos writes unitários da API, sem tornar o
// mapa dependente de um rebuild batch.

import type { DatabaseExecutor, DatabaseClient } from '../../shared/persistence/database-client.js';
import { MAP_TILE_ZOOM, tileForPoint } from './map-tile.js';

type Candidate = {
  entity_id: string;
  feature_kind: 'resource' | 'site';
  entity_type: 'PhysicalResource' | 'GeographicSite';
  type_code: string | null;
  site_category: string | null;
  status: string | null;
  label: string;
  sublabel: string | null;
  geometry: string;
};

export type MapFeatureSynchronizer = {
  syncEntity(entityId: string, tenantId: string): Promise<void>;
  syncLocation(locationId: string, tenantId: string): Promise<void>;
};

export class GeoMapFeatureSynchronizer implements MapFeatureSynchronizer {
  public constructor(private readonly db: DatabaseClient) {}

  public async syncEntity(entityId: string, tenantId: string): Promise<void> {
    await this.syncEntities([entityId], tenantId);
  }

  public async syncLocation(locationId: string, tenantId: string): Promise<void> {
    const rows = await this.db.all<{ id: string }>(
      `SELECT id FROM tmf_physical_resource WHERE place_id = ?
       UNION
       SELECT id FROM tmf_geographic_site WHERE geographic_location_id = ?`,
      [locationId, locationId],
    );
    await this.syncEntities(
      rows.map((row) => row.id),
      tenantId,
    );
  }

  public async syncEntities(entityIds: string[], tenantId: string): Promise<void> {
    const ids = [...new Set(entityIds)];
    if (ids.length === 0) return;
    await this.db.transaction(async (session) => {
      const placeholders = ids.map(() => '?').join(',');
      await session.execute(
        `DELETE FROM geo_map_feature
          WHERE tenant_id = ? AND entity_id IN (${placeholders})`,
        [tenantId, ...ids],
      );
      const candidates = await session.all<Candidate>(
        `SELECT r.id entity_id, 'resource' feature_kind, 'PhysicalResource' entity_type,
                rs.resource_type type_code, NULL site_category, r.status status, r.name label,
                NULL sublabel, l.geometry geometry
           FROM tmf_physical_resource r
           JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
           JOIN tmf_geographic_location l ON l.id = r.place_id
          WHERE r.id IN (${placeholders}) AND r.status <> 'terminated'
            AND rs.resource_type <> 'Splitter' AND l.geometry_type = 'Point'
         UNION ALL
         SELECT s.id entity_id, 'site' feature_kind, 'GeographicSite' entity_type,
                NULL type_code, spec.category site_category, s.status status, s.name label,
                spec.code sublabel, l.geometry geometry
           FROM tmf_geographic_site s
           JOIN tmf_geographic_site_specification spec ON spec.id = s.site_specification_id
           JOIN tmf_geographic_location l ON l.id = s.geographic_location_id
          WHERE s.id IN (${placeholders}) AND spec.category IN ('Site', 'SubSite')
            AND s.status NOT IN ('Retired', 'terminated') AND l.geometry_type = 'Point'`,
        [...ids, ...ids],
      );
      for (const candidate of candidates) await insertFeature(session, tenantId, candidate);
    });
  }
}

// Feature pontual do índice. `shape` é literal ('point' — o write-through só cobre ponto; cabo
// continua vindo do rebuild batch), `geometry` é NULL (só linha carrega traçado) e `rank` é 0.
// Exportado para o teste de aridade: a lista de colunas e a de VALUES são escritas à mão em
// linhas diferentes, e um `?` sobrando não quebra typecheck nem lint — só estoura em runtime,
// no primeiro recurso pontual que passar por aqui.
export const MAP_FEATURE_POINT_INSERT_SQL = `INSERT INTO geo_map_feature
      (tenant_id,tile_z,tile_x,tile_y,entity_id,shape,feature_kind,entity_type,
       type_code,site_category,status,label,sublabel,lng,lat,geometry,rank)
     VALUES (?,?,?,?,?,'point',?,?,?,?,?,?,?,?,?,NULL,0)`;

async function insertFeature(
  db: DatabaseExecutor,
  tenantId: string,
  candidate: Candidate,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.geometry);
  } catch {
    return;
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
    return;
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
    candidate.status,
    candidate.label,
    candidate.sublabel,
    lng,
    lat,
  ]);
}
