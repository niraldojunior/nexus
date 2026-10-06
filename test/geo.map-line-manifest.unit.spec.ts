import { describe, expect, it } from 'vitest';
import { diagnoseLineIndex, summarizeLineManifest } from '../src/modules/geo/map-line-manifest.js';

const profiles = new Map([
  [
    'L',
    [
      { key: 'overview', tileZoom: 6, toleranceMeters: 500 },
      { key: 'detail', tileZoom: 12, toleranceMeters: 5 },
    ],
  ],
]);
const line = (lod: string, z: number, coords: number) => ({
  source_model_id: 'L',
  lod_key: lod,
  tile_z: z,
  geometry: JSON.stringify({ type: 'LineString', coordinates: Array(coords).fill([0, 0]) }),
});

describe('manifesto do índice de linhas', () => {
  it('resume fragmentos e vértices por camada/LOD', () => {
    const entries = summarizeLineManifest(
      [line('overview', 6, 3), line('overview', 6, 4), line('detail', 12, 2)],
      profiles,
    );
    expect(entries).toEqual([
      {
        sourceModelId: 'L',
        lodKey: 'detail',
        tileZoom: 12,
        simplifyToleranceMeters: 5,
        fragments: 1,
        vertices: 2,
      },
      {
        sourceModelId: 'L',
        lodKey: 'overview',
        tileZoom: 6,
        simplifyToleranceMeters: 500,
        fragments: 2,
        vertices: 7,
      },
    ]);
  });

  it('classifica ok, missing e stale', () => {
    const manifest = summarizeLineManifest([line('overview', 6, 3)], profiles);
    manifest.push({
      sourceModelId: 'L',
      lodKey: 'old',
      tileZoom: 9,
      simplifyToleranceMeters: 0,
      fragments: 1,
      vertices: 2,
    });
    const diagnostics = diagnoseLineIndex(profiles, manifest);
    expect(diagnostics.map((d) => `${d.lodKey}:${d.status}`)).toEqual([
      'overview:ok',
      'detail:missing',
      'old:stale',
    ]);
  });

  it('perfil com zoom ou tolerância diferentes do manifesto fica stale', () => {
    const manifest = summarizeLineManifest([line('overview', 6, 3)], profiles);
    const changed = new Map([['L', [{ key: 'overview', tileZoom: 7, toleranceMeters: 500 }]]]);
    expect(diagnoseLineIndex(changed, manifest)[0]).toMatchObject({ status: 'stale' });
  });
});
