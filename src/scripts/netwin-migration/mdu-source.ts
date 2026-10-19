import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import {
  COMPLEMENT_ATTR_COLUMNS,
  condominiumKey,
  type ComplementAttrs,
  type ComplementCatalog,
} from './mdu-mapping.js';
import { chunksOf, namedInBinds } from './source-batches.js';

/**
 * Leitura (somente) do contrato MDU do Netwin — issue #310. Cadeia provada por FK:
 *   LOCATION ← OSP_SURVEYS(ID_ENDERECO → ADDRESS)
 *   OSP_SURVEYS_CAIXA_ENT(ID_SURVEY) ← OSP_SURVEYS_PRUMADA(ID_CE)
 *   OSP_SURVEYS_UCS(ID_SURVEY, ID_PRUM, ID_ENDERECO → ADDRESS)
 *   OSP_SURVEYS_DATASHEET(SURVEY_ID, PRUM_ID, PDO_ID → OSP_EQUIPMENT)
 * Binds nomeados, sem DISTINCT e aliases <= 30 caracteres (Oracle 19c).
 */

type SourceConnection = Awaited<ReturnType<MigrationContext['getSourceConnection']>>;

const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;

export type SurveyRow = ComplementAttrs & {
  ID: number;
  NUM_PISOS: number | null;
  ID_ENDERECO: number;
  ID_BASE_ADDRESS: number | null;
  ATTR28: string | null;
};

export type PrumadaRow = {
  ID_SURVEY: number;
  NUM_CE: string | null;
  CE_PISO: string | null;
  PRUM_ID: number | null;
  NUM_PRUM: string | null;
  PRUM_TOTAL_UCS: number | null;
  TOTAL_PISOS: number | null;
  ATENDIMENTO: string | null;
};

export type UnitRow = ComplementAttrs & {
  ID: number;
  ID_SURVEY: number;
  ID_PRUM: number | null;
  PISO: string | null;
  DESTINACAO: string | null;
  OBSTRUIDA: string | null;
  ID_ENDERECO: number;
  ADDRESS_NAME: string | null;
};

const attrSelect = (alias: string): string =>
  COMPLEMENT_ATTR_COLUMNS.map((column) => `${alias}.${column}`).join(', ');

export async function loadComplementCatalog(source: SourceConnection): Promise<ComplementCatalog> {
  const result = await source.execute<{ ID: number; COMPLEMENTO: string; ABREV: string | null }>(
    'SELECT ID, COMPLEMENTO, ABREV FROM NETWINOI.OSP_TP_ADDR_COMPLEMENTOS',
    {},
    { ...OBJECT, fetchArraySize: 500, prefetchRows: 501 },
  );
  return new Map(
    (result.rows ?? []).map((row) => [
      row.ID,
      { id: row.ID, name: row.COMPLEMENTO, abbreviation: row.ABREV ?? '' },
    ]),
  );
}

export async function hydrateSurveys(
  source: SourceConnection,
  ids: number[],
): Promise<Map<number, SurveyRow>> {
  const surveys = new Map<number, SurveyRow>();
  for (const chunk of chunksOf(ids)) {
    const { clause, binds } = namedInBinds(chunk, 'survey');
    const result = await source.execute<SurveyRow>(
      `SELECT s.ID, s.NUM_PISOS, s.ID_ENDERECO, a.ID_BASE_ADDRESS, a.ATTR28, ${attrSelect('a')}
         FROM NETWINOI.OSP_SURVEYS s
         JOIN NETWIN.ADDRESS a ON a.ID = s.ID_ENDERECO
        WHERE s.ID IN (${clause})`,
      binds,
      { ...OBJECT, fetchArraySize: chunk.length, prefetchRows: chunk.length + 1 },
    );
    for (const row of result.rows ?? []) surveys.set(row.ID, row);
  }
  return surveys;
}

/** Contagem real de UCs por survey (não o `TOTAL_UCS` declarado). */
export async function countSurveyUnits(
  source: SourceConnection,
  surveyIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  for (const chunk of chunksOf(surveyIds)) {
    const { clause, binds } = namedInBinds(chunk, 'survey');
    const result = await source.execute<{ ID_SURVEY: number; TOTAL: number }>(
      `SELECT u.ID_SURVEY, COUNT(*) AS TOTAL
         FROM NETWINOI.OSP_SURVEYS_UCS u
        WHERE u.ID_SURVEY IN (${clause})
        GROUP BY u.ID_SURVEY`,
      binds,
      OBJECT,
    );
    for (const row of result.rows ?? []) counts.set(row.ID_SURVEY, Number(row.TOTAL));
  }
  return counts;
}

export async function hydratePrumadas(
  source: SourceConnection,
  surveyIds: number[],
): Promise<PrumadaRow[]> {
  const rows: PrumadaRow[] = [];
  for (const chunk of chunksOf(surveyIds)) {
    const { clause, binds } = namedInBinds(chunk, 'survey');
    const result = await source.execute<PrumadaRow>(
      `SELECT ce.ID_SURVEY, ce.NUM_CE, ce.PISO AS CE_PISO, p.ID AS PRUM_ID, p.NUM_PRUM,
              p.TOTAL_UCS AS PRUM_TOTAL_UCS, p.TOTAL_PISOS, p.ATENDIMENTO
         FROM NETWINOI.OSP_SURVEYS_CAIXA_ENT ce
         LEFT JOIN NETWINOI.OSP_SURVEYS_PRUMADA p ON p.ID_CE = ce.ID
        WHERE ce.ID_SURVEY IN (${clause})`,
      binds,
      OBJECT,
    );
    for (const row of result.rows ?? []) rows.push(row);
  }
  return rows;
}

export async function hydrateUnits(
  source: SourceConnection,
  surveyIds: number[],
): Promise<UnitRow[]> {
  const rows: UnitRow[] = [];
  for (const chunk of chunksOf(surveyIds, 200)) {
    const { clause, binds } = namedInBinds(chunk, 'survey');
    const result = await source.execute<UnitRow>(
      `SELECT u.ID, u.ID_SURVEY, u.ID_PRUM, u.PISO, u.DESTINACAO, u.OBSTRUIDA, u.ID_ENDERECO,
              a.NAME AS ADDRESS_NAME, ${attrSelect('a')}
         FROM NETWINOI.OSP_SURVEYS_UCS u
         JOIN NETWIN.ADDRESS a ON a.ID = u.ID_ENDERECO
        WHERE u.ID_SURVEY IN (${clause})`,
      binds,
      { ...OBJECT, fetchArraySize: 2000, prefetchRows: 2001 },
    );
    for (const row of result.rows ?? []) rows.push(row);
  }
  return rows;
}

/**
 * Quantos surveys (nacional) compartilham cada `(ID_BASE_ADDRESS, ATTR28)`. A contagem é
 * independente do escopo e do corte do lote, para o agrupamento ser estável entre execuções.
 */
export async function countSurveysByCondominiumKey(
  source: SourceConnection,
  surveys: Iterable<SurveyRow>,
): Promise<Map<string, number>> {
  const wanted = new Set<string>();
  const bases = new Set<number>();
  for (const survey of surveys) {
    const key = condominiumKey(survey.ID_BASE_ADDRESS, survey.ATTR28);
    if (!key) continue;
    wanted.add(key);
    bases.add(Number(survey.ID_BASE_ADDRESS));
  }
  const counts = new Map<string, number>();
  for (const chunk of chunksOf([...bases])) {
    const { clause, binds } = namedInBinds(chunk, 'base');
    const result = await source.execute<{
      ID_BASE_ADDRESS: number;
      ATTR28: string | null;
      TOTAL: number;
    }>(
      `SELECT a.ID_BASE_ADDRESS, a.ATTR28, COUNT(*) AS TOTAL
         FROM NETWIN.ADDRESS a
         JOIN NETWINOI.OSP_SURVEYS s ON s.ID_ENDERECO = a.ID
        WHERE a.ID_BASE_ADDRESS IN (${clause})
        GROUP BY a.ID_BASE_ADDRESS, a.ATTR28`,
      binds,
      OBJECT,
    );
    for (const row of result.rows ?? []) {
      const key = condominiumKey(row.ID_BASE_ADDRESS, row.ATTR28);
      if (key && wanted.has(key)) counts.set(key, Number(row.TOTAL));
    }
  }
  return counts;
}

/** CDOI → survey pelo DATASHEET (PDO_ID indexado). Devolve só o conjunto de surveys por PDO. */
export async function hydrateDatasheets(
  source: SourceConnection,
  equipmentIds: number[],
): Promise<Map<number, Array<{ surveyId: number; prumadaId: number | null }>>> {
  const byPdo = new Map<number, Array<{ surveyId: number; prumadaId: number | null }>>();
  for (const chunk of chunksOf(equipmentIds)) {
    const { clause, binds } = namedInBinds(chunk, 'pdo');
    const result = await source.execute<{
      PDO_ID: number;
      SURVEY_ID: number;
      PRUM_ID: number | null;
    }>(
      `SELECT d.PDO_ID, d.SURVEY_ID, d.PRUM_ID
         FROM NETWINOI.OSP_SURVEYS_DATASHEET d
        WHERE d.PDO_ID IN (${clause})`,
      binds,
      OBJECT,
    );
    for (const row of result.rows ?? []) {
      const list = byPdo.get(row.PDO_ID) ?? [];
      list.push({ surveyId: row.SURVEY_ID, prumadaId: row.PRUM_ID });
      byPdo.set(row.PDO_ID, list);
    }
  }
  return byPdo;
}
