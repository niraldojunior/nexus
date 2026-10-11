import oracledb, { type Connection } from 'oracledb';
import { infranodeScopeBinds } from './scope.js';
import type { MigrationScope } from './types.js';

const MAX_MUNICIPALITY_PREFILTER_IDS = 200;

export type MunicipalityScopePrefilter = {
  municipalityIds: number[];
  resolutionMs: number;
};

type MunicipalityLookupRow = {
  MUNICIPALITY_ID: number;
  MUNICIPALITY_NAME: string | null;
};

export const municipalityScopeResolutionQuery = (): string => `
  SELECT municipality.ID AS MUNICIPALITY_ID,
         municipality.NAME AS MUNICIPALITY_NAME
  FROM NETWIN.LOCATION municipality
  JOIN NETWIN.CAT_ENTITY category ON category.ID = municipality.ID_CAT_ENTITY
  WHERE category.NAME = 'LOC.LIMIT.LOCALIZATION.CITYAREA'
    AND NETWIN.LIMPASTRING(municipality.NAME) = :municipio
  ORDER BY municipality.ID
`;

export async function resolveMunicipalityScopePrefilter(
  source: Connection,
  scope: Pick<MigrationScope, 'bairro' | 'municipio' | 'uf'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MunicipalityScopePrefilter | undefined> {
  if (!scope.municipio || scope.bairro || env.NETWIN_SCOPE_PREFILTER === 'off') return undefined;

  const startedAt = Date.now();
  const scopeBinds = infranodeScopeBinds(scope);
  try {
    const result = await source.execute<MunicipalityLookupRow>(
      municipalityScopeResolutionQuery(),
      { municipio: scopeBinds.municipio },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((result.rows ?? []).length === 0) {
      throw new Error(
        `Município "${scope.municipio}" não foi encontrado no catálogo NETWIN.LOCATION.`,
      );
    }

    const municipalityIds = [
      ...new Set(
        (result.rows ?? []).map((row) => Number(row.MUNICIPALITY_ID)).filter(Number.isFinite),
      ),
    ].sort((left, right) => left - right);
    if (municipalityIds.length === 0) return undefined;
    if (municipalityIds.length > MAX_MUNICIPALITY_PREFILTER_IDS) {
      console.warn(
        `[Escopo] Município "${scope.municipio}" resolveu para ${municipalityIds.length} IDs; usando filtro textual para evitar excesso de binds.`,
      );
      return undefined;
    }

    return { municipalityIds, resolutionMs: Date.now() - startedAt };
  } catch (error) {
    if (String(error).includes('não foi encontrado')) throw error;
    console.warn(
      `[Escopo] Não foi possível resolver BADDR_MUNICIPIO_ID (${String(error)}); usando filtro textual.`,
    );
    return undefined;
  }
}
