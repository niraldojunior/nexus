import { describe, expect, it, vi } from 'vitest';
import {
  GeoMapResourceService,
  MAP_RESOURCE_MAX_RESULTS,
} from '../src/modules/geo/map-resource-service.js';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';

const bounds = { minLng: -44, minLat: -23, maxLng: -43, maxLat: -22 };
const row = (id: string) => ({
  entity_id: id,
  feature_kind: 'resource' as const,
  entity_type: 'PhysicalResource',
  shape: 'point' as const,
  type_code: 'REPETIDOR',
  site_category: null,
  source_model_type: 'RESOURCE_TYPE' as const,
  source_model_id: 'REPETIDOR',
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

describe('GeoMapResourceService', () => {
  it('não consulta o banco sem ResourceTypes visíveis', async () => {
    const { db, all } = fakeDb([]);
    expect(await new GeoMapResourceService(db).resources(bounds, [])).toEqual({
      features: [],
      truncated: false,
    });
    expect(all).not.toHaveBeenCalled();
  });

  it('filtra por tipo no servidor e monta binds com tenant, tipos, bbox e limite+1', async () => {
    const { db, all } = fakeDb([row('r1')]);
    const result = await new GeoMapResourceService(db).resources(
      bounds,
      ['REPETIDOR', 'DERIVACAO'],
      { tenantId: 'vtal' },
    );
    const sql = String(all.mock.calls[0]?.[0]);
    expect(sql).toContain("f.feature_kind = 'resource'");
    expect(sql).toContain("f.shape = 'point'");
    expect(sql).toContain('f.source_model_id IN (?, ?)');
    expect(sql).toContain('FETCH FIRST ? ROWS ONLY');
    expect(all.mock.calls[0]?.[1]).toEqual([
      'vtal',
      'REPETIDOR',
      'DERIVACAO',
      -44,
      -43,
      -23,
      -22,
      MAP_RESOURCE_MAX_RESULTS + 1,
    ]);
    expect(result.features[0]).toMatchObject({
      entityId: 'r1',
      kind: 'resource',
      shape: 'point',
      sourceModelId: 'REPETIDOR',
    });
    expect(result.truncated).toBe(false);
  });

  it('sinaliza truncated e corta no limite', async () => {
    const { db } = fakeDb([row('a'), row('b'), row('c')]);
    const result = await new GeoMapResourceService(db).resources(bounds, ['REPETIDOR'], {
      limit: 2,
    });
    expect(result.features.map((f) => f.entityId)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(true);
  });
});
