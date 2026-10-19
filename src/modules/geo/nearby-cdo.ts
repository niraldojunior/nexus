// Busca enxuta de CDOs (caixas de distribuição óptica) perto de uma coordenada — usada pelo
// enriquecimento em lote de viabilidade (scripts/enrich-installation-addresses.ts) e mantida à
// parte de GeoTreeService.resourcesInViewport de propósito: em lote não há mapa para desenhar, só
// a distância importa, então esta consulta pula LineString, LogicalResource e a contagem de
// filhos que toResourceNodes dispara — metade das idas ao banco por linha.
//
// place do recurso é sempre um GeographicSite (canon); o tipo vem como 'CTO' ou, nas cargas Netwin,
// 'category:CDOE' / 'category:CDOI'.
//
// Mesma definição canônica de CDO usada em build-coverage.mjs e useAddressViability.ts:
// PhysicalResource com ResourceType 'CTO' e nome começando em "CDO" (o tipo sozinho também
// pegaria CEO/CEOS, caixas de emenda onde não se puxa drop).

import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import { haversineMeters } from './coverage-grid.js';

export type NearbyCdo = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  straightMeters: number;
};

type CdoRow = {
  id: string;
  name: string;
  geometry: string | null;
};

// Mesmo recorte de scripts/build-coverage.mjs: só PhysicalResource CTO com nome
// começando em CDO (verificado de novo em JS após o LIKE — LIKE 'CDO%' já filtra o grosso
// no banco, mas o regex é quem decide de fato, para não depender de espaço/caixa da
// coluna). Diferente do build-coverage.mjs (que mapeia active/demais como
// disponível/indisponível para o mapa de calor), aqui só entra CDO com status = 'active'
// ("Ativa" na UI, ver ViabilityTab.tsx) — uma CDO suspensa/bloqueada não é candidata
// viável para um drop novo.
const CDO_NAME = /^\s*CDO/i;

// As duas expressões de coordenada abaixo precisam ficar exatamente nesta forma textual: é o que
// casa com o índice parcial geographic_idx_location_point_lnglat no Postgres (ver schema.ts) e
// o que os regex de transformOracleQuery reescrevem para Oracle (ver oracle-database.ts).
const NEARBY_CDO_SQL = `
  SELECT r.id, r.name, l.geometry
    FROM resource_physical r
    JOIN resource_specification rs ON rs.id = r.resource_specification_id
    JOIN resource_type rt ON rt.id = rs.resource_type_id
    JOIN geographic_site s ON s.id = r.place_id
    JOIN geographic_location l ON l.id = s.geographic_location_id
   WHERE rt.code IN ('CTO', 'CDO', 'category:CDOE', 'category:CDOI')
     AND r.status = 'active'
     AND UPPER(r.name) LIKE 'CDO%'
     AND l.geometry_type = 'Point'
     AND (l.geometry::jsonb->'coordinates'->>0)::float8 BETWEEN ? AND ?
     AND (l.geometry::jsonb->'coordinates'->>1)::float8 BETWEEN ? AND ?
   LIMIT ?`;

/**
 * CDOs candidatas dentro de `radiusMeters` de `origin`, ordenadas da mais próxima (linha reta)
 * para a mais distante, limitadas a `limit`. O corte redondo é feito aqui em JS via
 * `haversineMeters` — o bbox mandado ao banco é só o quadrado que circunscreve o círculo.
 */
export async function findNearbyCdos(
  db: DatabaseClient,
  origin: { lng: number; lat: number },
  options: { radiusMeters: number; limit: number },
): Promise<NearbyCdo[]> {
  const latDelta = options.radiusMeters / 111_320;
  const longitudeScale = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01);
  const lngDelta = options.radiusMeters / (111_320 * longitudeScale);
  const minLng = origin.lng - lngDelta;
  const maxLng = origin.lng + lngDelta;
  const minLat = origin.lat - latDelta;
  const maxLat = origin.lat + latDelta;

  // Sem ORDER BY/LIMIT ajustado ao raio: o bbox já restringe a área, então um teto generoso (200x
  // o limite pedido) é só válvula contra bairro anormalmente denso — o corte fino é o haversine.
  const rows = await db.all<CdoRow>(NEARBY_CDO_SQL, [
    minLng,
    maxLng,
    minLat,
    maxLat,
    Math.max(options.limit * 200, 1000),
  ]);

  const candidates: NearbyCdo[] = [];
  for (const row of rows) {
    if (!row.geometry || !CDO_NAME.test(row.name ?? '')) continue;
    let coordinates: unknown;
    try {
      coordinates = (JSON.parse(row.geometry) as { coordinates?: unknown })?.coordinates;
    } catch {
      continue;
    }
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const [lng, lat] = coordinates as [number, number];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const straightMeters = haversineMeters(origin.lng, origin.lat, lng, lat);
    if (straightMeters > options.radiusMeters) continue;
    candidates.push({ id: row.id, name: row.name, lng, lat, straightMeters });
  }

  candidates.sort((left, right) => left.straightMeters - right.straightMeters);
  return candidates.slice(0, options.limit);
}

export type CdoPortAvailability = {
  total: number;
  /** Porta livre = ativa, desbloqueada, habilitada e sem uso (usageState idle). */
  free: number;
  busy: number;
  /** Portas fora de operação (inativas, bloqueadas ou desabilitadas) — não contam como livres. */
  unavailable: number;
};

// Portas contidas na CDO diretamente ou via Splitter (containsAsChild em até 2 níveis).
const CDO_PORTS_SQL = (placeholders: string): string => `
  SELECT x.cdo_id, r.usage_state, r.administrative_state, r.operational_state, r.status,
         COUNT(*) AS n
    FROM (
      SELECT rr.resource_from_id AS cdo_id, rr.resource_to_id AS port_id
        FROM resource_relationship rr
       WHERE rr.relationship_type = 'containsAsChild'
         AND rr.resource_from_id IN (${placeholders})
      UNION
      SELECT rr1.resource_from_id AS cdo_id, rr2.resource_to_id AS port_id
        FROM resource_relationship rr1
        JOIN resource_relationship rr2
          ON rr2.resource_from_id = rr1.resource_to_id
         AND rr2.relationship_type = 'containsAsChild'
       WHERE rr1.relationship_type = 'containsAsChild'
         AND rr1.resource_from_id IN (${placeholders})
    ) x
    JOIN resource_physical r ON r.id = x.port_id
    JOIN resource_specification rs ON rs.id = r.resource_specification_id
    JOIN resource_type rt ON rt.id = rs.resource_type_id
   WHERE rt.code = 'Port'
   GROUP BY x.cdo_id, r.usage_state, r.administrative_state, r.operational_state, r.status`;

/** Disponibilidade de portas por CDO (id da CDO → contagens). CDO sem portas cadastradas → total 0. */
export async function portAvailabilityByCdo(
  db: DatabaseClient,
  cdoIds: string[],
): Promise<Map<string, CdoPortAvailability>> {
  const result = new Map<string, CdoPortAvailability>();
  for (const id of cdoIds) result.set(id, { total: 0, free: 0, busy: 0, unavailable: 0 });
  if (cdoIds.length === 0) return result;
  const placeholders = cdoIds.map(() => '?').join(', ');
  const rows = await db.all<{
    cdo_id: string;
    usage_state: string | null;
    administrative_state: string | null;
    operational_state: string | null;
    status: string | null;
    n: number | string;
  }>(CDO_PORTS_SQL(placeholders), [...cdoIds, ...cdoIds]);
  for (const row of rows) {
    const entry = result.get(row.cdo_id);
    if (!entry) continue;
    const n = Number(row.n);
    entry.total += n;
    const inService =
      row.status === 'active' &&
      row.administrative_state === 'unlocked' &&
      row.operational_state === 'enabled';
    if (!inService) entry.unavailable += n;
    else if (row.usage_state === 'idle') entry.free += n;
    else entry.busy += n;
  }
  return result;
}
