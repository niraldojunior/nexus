// Busca enxuta de CDOs (caixas de distribuição óptica) perto de uma coordenada — usada pelo
// enriquecimento em lote de viabilidade (scripts/enrich-installation-addresses.ts) e mantida à
// parte de GeoTreeService.resourcesInViewport de propósito: em lote não há mapa para desenhar, só
// a distância importa, então esta consulta pula LineString, LogicalResource e a contagem de
// filhos que toResourceNodes dispara — metade das idas ao banco por linha.
//
// Mesma definição canônica de CDO usada em build-gpon-coverage.mjs e useAddressViability.ts:
// PhysicalResource com resource_type 'CTO' e nome começando em "CDO" (o tipo sozinho também
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

// Mesmo recorte de scripts/build-gpon-coverage.mjs: só PhysicalResource CTO com nome
// começando em CDO (verificado de novo em JS após o LIKE — LIKE 'CDO%' já filtra o grosso
// no banco, mas o regex é quem decide de fato, para não depender de espaço/caixa da
// coluna). Diferente do build-gpon-coverage (que mapeia active/demais como
// disponível/indisponível para o mapa de calor), aqui só entra CDO com status = 'active'
// ("Ativa" na UI, ver ViabilityTab.tsx) — uma CDO suspensa/bloqueada não é candidata
// viável para um drop novo.
const CDO_NAME = /^\s*CDO/i;

// As duas expressões de coordenada abaixo precisam ficar exatamente nesta forma textual: é o que
// casa com o índice parcial idx_tmf_geographic_location_point_lnglat no Postgres (ver schema.ts) e
// o que os regex de transformOracleQuery reescrevem para Oracle (ver oracle-database.ts).
const NEARBY_CDO_SQL = `
  SELECT r.id, r.name, l.geometry
    FROM tmf_physical_resource r
    JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id
    JOIN tmf_geographic_location l ON l.id = r.place_id
   WHERE rs.resource_type = 'CTO'
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

  // Sem ORDER BY/LIMIT ajustado ao raio: o bbox já restringe a área, então um teto generoso (10x
  // o limite pedido) é só válvula contra bairro anormalmente denso — o corte fino é o haversine.
  const rows = await db.all<CdoRow>(NEARBY_CDO_SQL, [
    minLng,
    maxLng,
    minLat,
    maxLat,
    Math.max(options.limit * 10, 100),
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
