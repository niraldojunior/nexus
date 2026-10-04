import { describe, expect, it, vi } from 'vitest';
import { GeoMapSiteService, MAP_SITE_MAX_RESULTS } from '../src/modules/geo/map-site-service.js';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';

const bounds = { minLng: -44, minLat: -23, maxLng: -43, maxLat: -22 };
const row = (id: string) => ({
  entity_id: id,
  feature_kind: 'site' as const,
  entity_type: 'GeographicSite',
  shape: 'point' as const,
  type_code: null,
  site_category: null,
  source_model_type: 'GEOGRAPHIC_SITE_SPECIFICATION' as const,
  source_model_id: 'CO',
  status: null,
  label: id,
  sublabel: null,
  lng: -43.5,
  lat: -22.5,
  geometry: null,
});
const fakeDb = (rows: unknown[]) => {
  const all = vi.fn().mockResolvedValue(rows);
  return { db: { all } as unknown as DatabaseClient, all };
};

describe('GeoMapSiteService', () => {
  it('não consulta o banco sem specifications', async () => {
    const { db, all } = fakeDb([]);
    expect(await new GeoMapSiteService(db).sites(bounds, [])).toEqual({
      features: [],
      truncated: false,
    });
    expect(all).not.toHaveBeenCalled();
  });

  it('monta binds com tenant, specs, bbox e limite+1', async () => {
    const { db, all } = fakeDb([row('s1')]);
    const result = await new GeoMapSiteService(db).sites(bounds, ['CO', 'X'], {
      tenantId: 'vtal',
    });
    expect(all.mock.calls[0]?.[1]).toEqual([
      'vtal',
      'CO',
      'X',
      -44,
      -43,
      -23,
      -22,
      MAP_SITE_MAX_RESULTS + 1,
    ]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({ entityId: 's1', kind: 'site', sourceModelId: 'CO' });
    expect(result.truncated).toBe(false);
  });

  it('sinaliza truncated e corta no limite', async () => {
    const { db } = fakeDb([row('a'), row('b'), row('c')]);
    const result = await new GeoMapSiteService(db).sites(bounds, ['CO'], { limit: 2 });
    expect(result.features.map((f) => f.entityId)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(true);
  });
});
