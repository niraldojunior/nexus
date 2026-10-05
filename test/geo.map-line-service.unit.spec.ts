import { describe, expect, it, vi } from 'vitest';
import { GeoMapLineService, MAP_LINE_MAX_FRAGMENTS } from '../src/modules/geo/map-line-service.js';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';

const bounds = { minLng: -44, minLat: -23, maxLng: -43, maxLat: -22 };
const row = (id: string) => ({
  entity_id: id,
  feature_kind: 'resource' as const,
  entity_type: 'PhysicalResource',
  shape: 'line' as const,
  type_code: 'EnergyTransmissionLine',
  site_category: null,
  source_model_type: 'RESOURCE_TYPE' as const,
  source_model_id: 'EnergyTransmissionLine',
  status: null,
  label: id,
  sublabel: null,
  lng: -43.5,
  lat: -22.5,
  geometry: JSON.stringify({
    type: 'LineString',
    coordinates: [
      [-43.6, -22.5],
      [-43.4, -22.5],
    ],
  }),
  tile_z: 8,
});
const fakeDb = (tileZ: number | null, rows: unknown[]) => {
  const get = vi.fn().mockResolvedValue(tileZ === null ? undefined : { tile_z: tileZ });
  const all = vi.fn().mockResolvedValue(rows);
  return { db: { get, all } as unknown as DatabaseClient, get, all };
};
const sel = { sourceModelId: 'EnergyTransmissionLine', lodKey: 'regional' };

describe('GeoMapLineService', () => {
  it('perfil sem índice devolve tileZoom null e não consulta fragmentos', async () => {
    const { db, all } = fakeDb(null, []);
    const result = await new GeoMapLineService(db).lines(bounds, [sel]);
    expect(result.features).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.selections[0]).toMatchObject({ tileZoom: null, fragments: 0 });
    expect(all).not.toHaveBeenCalled();
  });

  it('consulta o intervalo de tiles do perfil com tenant e limite+1', async () => {
    const { db, all } = fakeDb(8, [row('a')]);
    const result = await new GeoMapLineService(db).lines(bounds, [sel], { tenantId: 'vtal' });
    const binds = all.mock.calls[0]?.[1] as unknown[];
    expect(binds.slice(0, 4)).toEqual(['vtal', sel.sourceModelId, 'regional', 8]);
    const [x0, x1, y0, y1] = binds.slice(4, 8) as number[];
    expect(x0).toBeLessThanOrEqual(x1!);
    expect(y0).toBeLessThanOrEqual(y1!);
    expect(binds[8]).toBe(MAP_LINE_MAX_FRAGMENTS + 1);
    expect(result.features).toHaveLength(1);
    expect(result.selections[0]).toMatchObject({ tileZoom: 8, fragments: 1 });
  });

  it('sinaliza truncated e corta no limite', async () => {
    const { db } = fakeDb(8, [row('a'), row('b'), row('c')]);
    const result = await new GeoMapLineService(db).lines(bounds, [sel], { limit: 2 });
    expect(result.features.map((f) => f.entityId)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(true);
  });
});
