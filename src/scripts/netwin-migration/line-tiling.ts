import type { Connection } from 'oracledb';
import oracledb from 'oracledb';
import { studioGeoLineLodIndex, type LineLodProfile } from '../../modules/geo/map-tile.js';

/**
 * Perfis de LOD (zoom e simplificação) das camadas de linha, lidos do catálogo publicado do Studio GEO.
 * Sem publicação (ou sem a camada) o índice fica vazio e o escritor cai no padrão: z16, sem simplificar.
 */
export async function loadPublishedLineTiling(
  conn: Connection,
  t: (table: string) => string,
  tenantId: string,
): Promise<Map<string, LineLodProfile[]>> {
  const result = await conn.execute<{ SNAPSHOT: string }>(
    `SELECT v.snapshot AS "SNAPSHOT"
       FROM ${t('studio_workspace')} w
       JOIN ${t('studio_version')} v ON v.id = w.published_version_id
      WHERE w.domain = 'studio-geo' AND w.tenant_id = :tenantId`,
    { tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const raw = result.rows?.[0]?.SNAPSHOT;
  if (!raw) return new Map();
  try {
    return studioGeoLineLodIndex(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return new Map();
  }
}
