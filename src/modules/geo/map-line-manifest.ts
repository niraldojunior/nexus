// Manifesto do índice de linhas do mapa (issue #318): uma linha por camada/LOD em
// `geo_map_line_index`, gravada por build-map-features na mesma transação do rebuild. Funções puras,
// compartilhadas pelo builder (resumo + diagnóstico) e testáveis sem banco.

import type { LineLodProfile } from './map-tile.js';

export type LineManifestEntry = {
  sourceModelId: string;
  lodKey: string;
  tileZoom: number;
  simplifyToleranceMeters: number;
  fragments: number;
  vertices: number;
};

export type LineIndexStatus = 'ok' | 'stale' | 'missing';

export type LineIndexDiagnostic = {
  sourceModelId: string;
  lodKey: string;
  status: LineIndexStatus;
  /** Motivo legível; só quando o status não é `ok`. */
  reason?: string;
};

type FragmentRow = {
  source_model_id: string | null;
  lod_key: string;
  tile_z: number;
  geometry: string | null;
};

const vertexCount = (geometry: string | null): number => {
  if (!geometry) return 0;
  try {
    const parsed = JSON.parse(geometry) as { coordinates?: unknown };
    return Array.isArray(parsed.coordinates) ? parsed.coordinates.length : 0;
  } catch {
    return 0;
  }
};

/** Resume os fragmentos de linha recém-gerados em entradas de manifesto (camada × LOD). */
export function summarizeLineManifest(
  rows: readonly FragmentRow[],
  profiles: ReadonlyMap<string, readonly LineLodProfile[]>,
): LineManifestEntry[] {
  const entries = new Map<string, LineManifestEntry>();
  for (const row of rows) {
    if (!row.source_model_id) continue;
    const key = `${row.source_model_id}\u0000${row.lod_key}`;
    let entry = entries.get(key);
    if (!entry) {
      const profile = profiles
        .get(row.source_model_id)
        ?.find((candidate) => candidate.key === row.lod_key);
      entry = {
        sourceModelId: row.source_model_id,
        lodKey: row.lod_key,
        tileZoom: row.tile_z,
        simplifyToleranceMeters: profile?.toleranceMeters ?? 0,
        fragments: 0,
        vertices: 0,
      };
      entries.set(key, entry);
    }
    entry.fragments += 1;
    entry.vertices += vertexCount(row.geometry);
  }
  return [...entries.values()].sort((a, b) =>
    `${a.sourceModelId}/${a.lodKey}`.localeCompare(`${b.sourceModelId}/${b.lodKey}`),
  );
}

/**
 * Compara os perfis publicados no Studio com o manifesto gravado: `missing` = perfil sem entrada;
 * `stale` = zoom ou tolerância diferem do publicado (o perfil mudou depois do último rebuild).
 * Entradas do manifesto sem perfil publicado também são `stale` (sobra de perfil removido).
 */
export function diagnoseLineIndex(
  published: ReadonlyMap<string, readonly LineLodProfile[]>,
  manifest: readonly LineManifestEntry[],
): LineIndexDiagnostic[] {
  const byKey = new Map(
    manifest.map((entry) => [`${entry.sourceModelId}\u0000${entry.lodKey}`, entry]),
  );
  const seen = new Set<string>();
  const result: LineIndexDiagnostic[] = [];
  for (const [sourceModelId, profiles] of [...published].sort(([a], [b]) => a.localeCompare(b))) {
    for (const profile of profiles) {
      const key = `${sourceModelId}\u0000${profile.key}`;
      seen.add(key);
      const entry = byKey.get(key);
      if (!entry) {
        result.push({
          sourceModelId,
          lodKey: profile.key,
          status: 'missing',
          reason: 'perfil publicado sem índice gerado',
        });
      } else if (
        entry.tileZoom !== profile.tileZoom ||
        entry.simplifyToleranceMeters !== profile.toleranceMeters
      ) {
        result.push({
          sourceModelId,
          lodKey: profile.key,
          status: 'stale',
          reason: `índice z${entry.tileZoom}/${entry.simplifyToleranceMeters} m, publicado z${profile.tileZoom}/${profile.toleranceMeters} m`,
        });
      } else {
        result.push({ sourceModelId, lodKey: profile.key, status: 'ok' });
      }
    }
  }
  for (const entry of manifest) {
    if (seen.has(`${entry.sourceModelId}\u0000${entry.lodKey}`)) continue;
    result.push({
      sourceModelId: entry.sourceModelId,
      lodKey: entry.lodKey,
      status: 'stale',
      reason: 'índice gerado para perfil que não está mais publicado',
    });
  }
  return result;
}
