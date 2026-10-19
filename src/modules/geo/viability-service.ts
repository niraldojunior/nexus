// Leitura especializada de CDOs próximas para a aba Viabilidade. Não reutiliza o
// viewport da árvore: aquele projeta toda a infraestrutura visível do mapa; aqui só
// interessam caixas elegíveis para um drop novo — e só é elegível a CDO com status `active`.

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { haversineMeters } from './coverage-grid.js';
import { portAvailabilityByCdo } from './nearby-cdo.js';

export type ViabilityCdo = {
  id: string;
  name: string;
  resourceType: string;
  status?: string;
  substatus?: string;
  lng: number;
  lat: number;
  straightMeters: number;
  /** Portas livres (ativas, desbloqueadas, habilitadas e sem uso) contidas na CDO. */
  portsFree: number;
  /** Total de portas internas cadastradas na CDO. */
  portsTotal: number;
};

type ViabilityCdoRow = {
  id: string;
  name: string;
  resource_type: string | null;
  status: string | null;
  substatus: string | null;
  geometry: string | null;
};

const CDO_NAME = /^\s*CDO/i;

// A expressão permanece textual e idêntica à do índice funcional de Location. O
// Oracle a reescreve para JSON_VALUE pelo adapter; trocar sua forma degradaria o
// recorte espacial para uma varredura de geometria.
const VIABILITY_CDO_SQL = `
  SELECT r.id, r.name, rt.code AS resource_type, r.status,
         (SELECT ce->>'value'
            FROM jsonb_array_elements(NULLIF(r.characteristics, '')::jsonb) AS ce
           WHERE ce->>'name' = 'substatus' AND ce->>'group' IS NULL
           LIMIT 1) AS substatus,
         l.geometry
    FROM geographic_location l
    JOIN resource_physical r
      ON r.place_id = l.id AND r.tenant_id = ?
    JOIN resource_specification rs
      ON rs.id = r.resource_specification_id AND rs.tenant_id = r.tenant_id
    JOIN resource_type rt ON rt.id = rs.resource_type_id
   WHERE l.geometry_type = 'Point'
     AND r.status = 'active'
     AND rt.code IN ('CTO', 'CDO', 'category:CDOE', 'category:CDOI')
     AND UPPER(LTRIM(r.name)) LIKE 'CDO%'
     AND (l.geometry::jsonb->'coordinates'->>0)::float8 BETWEEN ? AND ?
     AND (l.geometry::jsonb->'coordinates'->>1)::float8 BETWEEN ? AND ?
  UNION ALL
  SELECT r.id, r.name, rt.code AS resource_type, r.status,
         (SELECT ce->>'value'
            FROM jsonb_array_elements(NULLIF(r.characteristics, '')::jsonb) AS ce
           WHERE ce->>'name' = 'substatus' AND ce->>'group' IS NULL
           LIMIT 1) AS substatus,
         l.geometry
    FROM geographic_location l
    JOIN geographic_site s ON s.geographic_location_id = l.id AND s.tenant_id = ?
    JOIN resource_physical r ON r.place_id = s.id AND r.tenant_id = s.tenant_id
    JOIN resource_specification rs
      ON rs.id = r.resource_specification_id AND rs.tenant_id = r.tenant_id
    JOIN resource_type rt ON rt.id = rs.resource_type_id
   WHERE l.geometry_type = 'Point'
     AND r.status = 'active'
     AND rt.code IN ('CTO', 'CDO', 'category:CDOE', 'category:CDOI')
     AND UPPER(LTRIM(r.name)) LIKE 'CDO%'
     AND (l.geometry::jsonb->'coordinates'->>0)::float8 BETWEEN ? AND ?
     AND (l.geometry::jsonb->'coordinates'->>1)::float8 BETWEEN ? AND ?
  UNION ALL
  SELECT r.id, r.name, rt.code AS resource_type, r.status,
         (SELECT ce->>'value'
            FROM jsonb_array_elements(NULLIF(r.characteristics, '')::jsonb) AS ce
           WHERE ce->>'name' = 'substatus' AND ce->>'group' IS NULL
           LIMIT 1) AS substatus,
         l.geometry
    FROM geographic_location l
    JOIN geographic_address a ON a.geographic_location_id = l.id AND a.tenant_id = ?
    JOIN resource_physical r ON r.place_id = a.id AND r.tenant_id = a.tenant_id
    JOIN resource_specification rs
      ON rs.id = r.resource_specification_id AND rs.tenant_id = r.tenant_id
    JOIN resource_type rt ON rt.id = rs.resource_type_id
   WHERE l.geometry_type = 'Point'
     AND r.status = 'active'
     AND rt.code IN ('CTO', 'CDO', 'category:CDOE', 'category:CDOI')
     AND UPPER(LTRIM(r.name)) LIKE 'CDO%'
     AND (l.geometry::jsonb->'coordinates'->>0)::float8 BETWEEN ? AND ?
     AND (l.geometry::jsonb->'coordinates'->>1)::float8 BETWEEN ? AND ?`;

const pointOf = (geometry: string | null): { lng: number; lat: number } | null => {
  if (!geometry) return null;
  try {
    const coordinates = (JSON.parse(geometry) as { coordinates?: unknown }).coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const [lng, lat] = coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
  } catch {
    return null;
  }
};

export class GeoViabilityService {
  public constructor(private readonly db: DatabaseClient) {}

  public async nearbyCdos(
    origin: { lng: number; lat: number },
    options: { tenantId: string; radiusMeters: number; limit: number },
  ): Promise<ViabilityCdo[]> {
    const latDelta = options.radiusMeters / 111_320;
    const longitudeScale = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01);
    const lngDelta = options.radiusMeters / (111_320 * longitudeScale);
    const bbox = [
      origin.lng - lngDelta,
      origin.lng + lngDelta,
      origin.lat - latDelta,
      origin.lat + latDelta,
    ];
    const rows = await this.db.all<ViabilityCdoRow>(VIABILITY_CDO_SQL, [
      options.tenantId,
      ...bbox,
      options.tenantId,
      ...bbox,
      options.tenantId,
      ...bbox,
    ]);

    const candidates: Array<Omit<ViabilityCdo, 'portsFree' | 'portsTotal'>> = [];
    for (const row of rows) {
      const point = pointOf(row.geometry);
      // Regra de viabilidade: só CDO ativa pode ser viabilizada; suspensa, inativa, bloqueada
      // etc. são descartadas (o SQL já filtra, a guarda protege contra mudança de consulta).
      if (row.status !== 'active') continue;
      if (!point || !row.resource_type || !CDO_NAME.test(row.name)) continue;
      const straightMeters = haversineMeters(origin.lng, origin.lat, point.lng, point.lat);
      if (straightMeters > options.radiusMeters) continue;
      candidates.push({
        id: row.id,
        name: row.name,
        resourceType: row.resource_type,
        ...(row.status ? { status: row.status } : {}),
        ...(row.substatus ? { substatus: row.substatus } : {}),
        ...point,
        straightMeters,
      });
    }

    candidates.sort((left, right) => left.straightMeters - right.straightMeters);
    if (candidates.length === 0) return [];

    // Regra de viabilidade: só serve CDO com ao menos uma porta livre. O corte vem antes do
    // limite — caixas lotadas não podem ocupar as vagas das que ainda têm porta.
    const ports = await portAvailabilityByCdo(
      this.db,
      candidates.map((candidate) => candidate.id),
    );
    const available: ViabilityCdo[] = [];
    for (const candidate of candidates) {
      const summary = ports.get(candidate.id);
      if (!summary || summary.free <= 0) continue;
      available.push({ ...candidate, portsFree: summary.free, portsTotal: summary.total });
      if (available.length >= options.limit) break;
    }
    return available;
  }
}
