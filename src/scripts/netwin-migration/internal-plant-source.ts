import oracledb, { type Connection } from 'oracledb';
import {
  infranodeScopeBinds,
  municipalityInfranodePredicate,
  neighborhoodInfranodePredicate,
  ufInfranodePredicate,
} from './scope.js';
import type { MigrationScope } from './types.js';

export type InternalEquipmentRow = {
  ID_BD_EQUIPAMENTO: number;
  /** Chave OSP comprovada pelo espelho NS_RES_INS_NODE_MIRROR. */
  ID_BD_EQUIPAMENTO_OSP: number;
  ID_BD_LOCAL: number;
  DESIGNACAO: string | null;
  DESIGNACAO_ALTERNATIVA: string | null;
  IDENTIFICACAO: string | null;
  NUM_SERIE: string | null;
  ID_BD_TIPO_NE: number | null;
  ID_BD_TIPO_EQUIP: number | null;
  TIPO_NOME: string | null;
  TIPO_SIGLA: string | null;
  INVENTORY_TYPE: string | null;
  MODELO_NOME: string | null;
  MODELO_SIGLA: string | null;
  ESTADO_CICLO_VIDA: number | null;
  ESTADO_OPERACIONAL: number | null;
};

export type InternalPortRow = {
  ID_BD_PORTO_FISICO: number;
  ID_BD_EQUIPAMENTO: number | null;
  ID_BD_SUBBASTIDOR: number | null;
  ID_BD_CARTA: number | null;
  NOME: string | null;
  NOME_ALTERNATIVO: string | null;
  ID_PORTO: string | null;
  CODIFICACAO_PORTO: string | null;
  OCUPACAO: string | null;
  CIRCUITO: string | null;
  DEBITO: string | null;
  ESTADO_CICLO_VIDA: number | null;
  ESTADO_OPERACIONAL: number | null;
  ESTADO_PROVISAO: string | null;
  ID_SERVICO: number | string | null;
  TIPO_OCUPACAO: string | null;
  TIPO_NOME: string | null;
  DIRECCIONALIDADE: string | null;
};

export type InternalCardRow = {
  ID_BD_CARTA: number;
  NOME: string | null;
  NOME_ALTERNATIVO: string | null;
  N_SLOT: string | null;
  POSICAO_UF: string | null;
  ESTADO_CICLO_VIDA: number | null;
  ESTADO_OPERACIONAL: number | null;
  TIPO_NOME: string | null;
  TIPO_SIGLA: string | null;
};

export type InternalSlotRow = {
  ID_BD_SLOT: number;
  ID_BD_SUBBASTIDOR: number;
  ID_BD_CARTA: number | null;
  ID_BD_CARTA_PARENT: number | null;
  NOME: string | null;
  CODIFICACAO: string | null;
  ESTADO_OPERACIONAL: number | null;
  TIPO_NOME: string | null;
};

export type InternalSubrackRow = {
  ID_BD_SUBBASTIDOR: number;
  ID_BD_BASTIDOR: number;
  NOME: string | null;
  NOME_ALTERNATIVO: string | null;
  CODIGO: string | null;
  CODIGOSB: string | null;
  POSICAO: string | null;
  ESTADO_CICLO_VIDA: number | null;
  ESTADO_OPERACIONAL: number | null;
  TIPO_NOME: string | null;
  TIPO_SIGLA: string | null;
};

export type InternalRackRow = {
  ID_BD_BASTIDOR: number;
  NOME: string | null;
  NOME_ALTERNATIVO: string | null;
  CODIGO: string | null;
  FIADA: string | null;
  POSICAO: string | null;
  ESTADO_CICLO_VIDA: number | null;
  ESTADO_OPERACIONAL: number | null;
  TIPO_NOME: string | null;
  TIPO_SIGLA: string | null;
};

function inBinds(ids: number[]): { clause: string; binds: Record<string, number> } {
  const binds: Record<string, number> = {};
  const clause = ids
    .map((id, index) => {
      const key = `id${index}`;
      binds[key] = id;
      return `:${key}`;
    })
    .join(', ');
  return { clause, binds };
}

/**
 * Default do node-oracledb (100) força um round-trip de rede a cada 100 linhas — mesma
 * medição de [oracle-database.ts](../../shared/persistence/oracle-database.ts): 7,5s -> 0,6s
 * num SELECT de 62k linhas só por subir para 2000. O pool de origem do migrador (`context.ts`)
 * não define isto globalmente, então toda consulta aqui precisa pedir explicitamente.
 */
const FETCH_OPTIONS = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchArraySize: 2000,
  prefetchRows: 2000,
} as const;

/** IDs de tipo de equipamento CDO — mesmas chaves de `CDO_TYPE_TO_SPEC` em phase2-internal-plant.ts. */
const CDO_TYPE_IDS = [270, 271, 272] as const;

export type CdoEquipmentIdRow = {
  ID_BD_EQUIPAMENTO: number;
  ID_BD_EQUIPAMENTO_OSP: number;
  ID_BD_LOCAL: number;
  ID_BD_TIPO_NE: number | null;
};

export async function loadInternalEquipment(
  source: Connection,
  locationIds: number[],
  maxRecords: number,
): Promise<InternalEquipmentRow[]> {
  if (locationIds.length === 0 || maxRecords <= 0) return [];
  const rows: InternalEquipmentRow[] = [];

  for (let offset = 0; offset < locationIds.length && rows.length < maxRecords; offset += 900) {
    const { clause, binds } = inBinds(locationIds.slice(offset, offset + 900));
    const result = await source.execute<InternalEquipmentRow>(
      `SELECT * FROM (
         SELECT DISTINCT e.ID_BD_EQUIPAMENTO, nm.ID_BD_ENTITY_OSP AS ID_BD_EQUIPAMENTO_OSP,
                oq.INFRANODE_ID AS ID_BD_LOCAL,
                e.DESIGNACAO, e.DESIGNACAO_ALTERNATIVA, e.IDENTIFICACAO, e.NUM_SERIE,
                e.ID_BD_TIPO_NE, e.ID_BD_TIPO_EQUIP, e.ESTADO_CICLO_VIDA, e.ESTADO_OPERACIONAL,
                ne.NOME AS TIPO_NOME, ne.SIGLA AS TIPO_SIGLA, ne.INVENTORY_TYPE,
                me.NOME_EQUIP AS MODELO_NOME, me.SIGLA_EQUIP AS MODELO_SIGLA
           FROM NETWIN.ISP_INS_EQUIPAMENTO e
           JOIN NETWIN.NS_RES_INS_NODE_MIRROR nm ON nm.ID_BD_ENTITY_ISP = e.ID_BD_EQUIPAMENTO
           JOIN NETWIN.OSP_EQUIPMENT oq ON oq.ID = nm.ID_BD_ENTITY_OSP
           LEFT JOIN NETWIN.ISP_CAT_TIPO_EQUIPAMENTO ne ON ne.ID_BD_TIPO_EQUIPAMENTO = e.ID_BD_TIPO_NE
           LEFT JOIN NETWIN.ISP_CAT_MODELO_EQUIP me ON me.ID_BD_TIPO_EQUIP = e.ID_BD_TIPO_EQUIP
          WHERE nm.ENTITY_ISP = 'AC_GEN_INS_EQUIPAMENTO'
            AND oq.INFRANODE_ID IN (${clause})
          ORDER BY e.ID_BD_EQUIPAMENTO
       ) WHERE ROWNUM <= :maxRecords`,
      { ...binds, maxRecords: maxRecords - rows.length },
      FETCH_OPTIONS,
    );
    rows.push(...(result.rows ?? []));
  }

  return rows;
}

/**
 * Projeção slim de equipamento, filtrada a CDO **em SQL**, para a Fase 2.C paginada.
 *
 * `loadInternalEquipment` continua intacta e não deve ganhar este filtro: a Fase 2.D
 * (`phase2-station-internal-plant.ts`) consome equipamento NÃO-CDO e campos de catálogo
 * (`TIPO_NOME`/`TIPO_SIGLA`) que esta função não carrega. Ver Passo 5 do plano de paginação
 * da Fase 2.C — empurrar o filtro para dentro de `loadInternalEquipment` faria o relatório de
 * contratos da 2.D sair silenciosamente errado.
 *
 * Sem `DISTINCT`: medido no RJ (amostra de 900 locais) que o join
 * ISP_INS_EQUIPAMENTO -> NS_RES_INS_NODE_MIRROR -> OSP_EQUIPMENT não faz fan-out
 * (COUNT(*) == COUNT(DISTINCT ID_BD_EQUIPAMENTO)). Sem stop-key para proteger (o
 * `maxRecords` real é `Number.MAX_SAFE_INTEGER`), `DISTINCT` só pagaria um SORT UNIQUE
 * desnecessário.
 */
/**
 * SQL puro, exportado à parte para ser testável por forma sem DR — mesmo padrão de
 * `fullTableIdQuery` em `source-batches.ts`. Nenhuma consulta neste arquivo era
 * estruturada assim antes do Passo 1 do plano de paginação da Fase 2.C.
 */
export const cdoEquipmentIdQuery = (clause: string): string => `
  SELECT * FROM (
     SELECT e.ID_BD_EQUIPAMENTO, nm.ID_BD_ENTITY_OSP AS ID_BD_EQUIPAMENTO_OSP,
            oq.INFRANODE_ID AS ID_BD_LOCAL, e.ID_BD_TIPO_NE
       FROM NETWIN.ISP_INS_EQUIPAMENTO e
       JOIN NETWIN.NS_RES_INS_NODE_MIRROR nm ON nm.ID_BD_ENTITY_ISP = e.ID_BD_EQUIPAMENTO
       JOIN NETWIN.OSP_EQUIPMENT oq ON oq.ID = nm.ID_BD_ENTITY_OSP
      WHERE nm.ENTITY_ISP = 'AC_GEN_INS_EQUIPAMENTO'
        AND oq.INFRANODE_ID IN (${clause})
        AND e.ID_BD_TIPO_NE IN (${CDO_TYPE_IDS.join(', ')})
      ORDER BY e.ID_BD_EQUIPAMENTO
   ) WHERE ROWNUM <= :maxRecords`;

export async function loadInternalCdoEquipmentIds(
  source: Connection,
  locationIds: number[],
  maxRecords: number,
): Promise<CdoEquipmentIdRow[]> {
  if (locationIds.length === 0 || maxRecords <= 0) return [];
  const rows: CdoEquipmentIdRow[] = [];

  for (let offset = 0; offset < locationIds.length && rows.length < maxRecords; offset += 900) {
    const { clause, binds } = inBinds(locationIds.slice(offset, offset + 900));
    const result = await source.execute<CdoEquipmentIdRow>(
      cdoEquipmentIdQuery(clause),
      { ...binds, maxRecords: maxRecords - rows.length },
      FETCH_OPTIONS,
    );
    rows.push(...(result.rows ?? []));
  }

  return rows;
}

export async function loadInternalEquipmentByNeighborhood(
  source: Connection,
  scope: Pick<MigrationScope, 'bairro' | 'municipio' | 'uf'>,
  maxRecords: number,
): Promise<InternalEquipmentRow[]> {
  if (!scope.bairro || maxRecords <= 0) return [];

  const binds: Record<string, string | number> = {
    ...infranodeScopeBinds(scope),
    maxRecords,
  };
  const predicates = [neighborhoodInfranodePredicate('infranode')];
  if (scope.municipio) {
    predicates.push(municipalityInfranodePredicate('infranode'));
  }
  if (scope.uf) {
    predicates.push(ufInfranodePredicate('infranode'));
  }

  const result = await source.execute<InternalEquipmentRow>(
    `SELECT * FROM (
       SELECT DISTINCT e.ID_BD_EQUIPAMENTO, nm.ID_BD_ENTITY_OSP AS ID_BD_EQUIPAMENTO_OSP,
              osp.INFRANODE_ID AS ID_BD_LOCAL,
              e.DESIGNACAO, e.DESIGNACAO_ALTERNATIVA, e.IDENTIFICACAO, e.NUM_SERIE,
              e.ID_BD_TIPO_NE, e.ID_BD_TIPO_EQUIP, e.ESTADO_CICLO_VIDA, e.ESTADO_OPERACIONAL,
              ne.NOME AS TIPO_NOME, ne.SIGLA AS TIPO_SIGLA, ne.INVENTORY_TYPE,
              me.NOME_EQUIP AS MODELO_NOME, me.SIGLA_EQUIP AS MODELO_SIGLA
         FROM NETWIN.ISP_INS_EQUIPAMENTO e
         JOIN NETWIN.NS_RES_INS_NODE_MIRROR nm ON nm.ID_BD_ENTITY_ISP = e.ID_BD_EQUIPAMENTO
         JOIN NETWIN.OSP_EQUIPMENT osp ON osp.ID = nm.ID_BD_ENTITY_OSP
         JOIN NETWINOI.DL_INFRANODE infranode ON infranode.PI_ID = osp.INFRANODE_ID
         LEFT JOIN NETWIN.ISP_CAT_TIPO_EQUIPAMENTO ne ON ne.ID_BD_TIPO_EQUIPAMENTO = e.ID_BD_TIPO_NE
         LEFT JOIN NETWIN.ISP_CAT_MODELO_EQUIP me ON me.ID_BD_TIPO_EQUIP = e.ID_BD_TIPO_EQUIP
        WHERE nm.ENTITY_ISP = 'AC_GEN_INS_EQUIPAMENTO'
          AND ${predicates.join('\n          AND ')}
        ORDER BY e.ID_BD_EQUIPAMENTO
     ) WHERE ROWNUM <= :maxRecords`,
    binds,
    FETCH_OPTIONS,
  );
  return result.rows ?? [];
}

export async function loadInternalPorts(
  source: Connection,
  equipmentIds: number[],
): Promise<InternalPortRow[]> {
  const rows: InternalPortRow[] = [];
  for (let offset = 0; offset < equipmentIds.length; offset += 900) {
    const { clause, binds } = inBinds(equipmentIds.slice(offset, offset + 900));
    const result = await source.execute<InternalPortRow>(
      `SELECT p.ID_BD_PORTO_FISICO, p.ID_BD_EQUIPAMENTO, p.ID_BD_SUBBASTIDOR, p.ID_BD_CARTA,
              p.NOME, p.NOME_ALTERNATIVO, p.ID_PORTO, p.CODIFICACAO_PORTO, p.OCUPACAO, p.CIRCUITO, p.DEBITO,
              p.ESTADO_CICLO_VIDA, p.ESTADO_OPERACIONAL,
              p.ESTADO_PROVISAO, p.ID_SERVICO, p.TIPO_OCUPACAO,
              cp.TIPO AS TIPO_NOME, cp.DIRECCIONALIDADE
         FROM NETWIN.ISP_INS_PORTO_FISICO p
         LEFT JOIN NETWIN.ISP_CAT_PORTO_FISICO cp ON cp.ID_BD_TIPO_PORTO_FISICO = p.ID_BD_TIPO_PORTO_FISICO
         JOIN NETWIN.NS_RES_INS_TP_MIRROR_ALL mirror ON mirror.ID_BD_ENTITY_ISP = p.ID_BD_PORTO_FISICO
        WHERE p.ID_BD_EQUIPAMENTO IN (${clause})
          AND (cp.TIPO IS NULL OR UPPER(cp.TIPO) IN ('ADAPTER', 'FO.I', 'FO.O'))
        ORDER BY p.ID_BD_PORTO_FISICO`,
      binds,
      FETCH_OPTIONS,
    );
    rows.push(...(result.rows ?? []));
  }
  return rows;
}

/**
 * Determinismo do card para a Fase 2.C paginada (Passo 3 do plano de paginação).
 *
 * Um card pode pertencer a portas de mais de um equipamento (confirmado no RJ: 10 casos).
 * Sem isto, `cardToEquipmentId` em `phase2-internal-plant.ts` ligava o card ao primeiro
 * equipamento **visto**, o que depende da ordem — e portanto da página. Aqui o pai é
 * resolvido em SQL por `MIN(ID_BD_EQUIPAMENTO)`, restrito a equipamento tipo CDO, replicando
 * os dois predicados de `loadInternalPorts` acima (join com `NS_RES_INS_TP_MIRROR_ALL` e o
 * filtro `cp.TIPO IN ('ADAPTER','FO.I','FO.O')`) — sem replicá-los, o `MIN` pode devolver um
 * equipamento cujas portas nunca foram carregadas, rejeitando o splitter em toda página.
 */
export async function resolveCardCanonicalEquipmentIds(
  source: Connection,
  cardIds: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  for (let offset = 0; offset < cardIds.length; offset += 900) {
    const { clause, binds } = inBinds(cardIds.slice(offset, offset + 900));
    const page = await source.execute<{ ID_BD_CARTA: number; PARENT_ID: number }>(
      `SELECT p.ID_BD_CARTA, MIN(p.ID_BD_EQUIPAMENTO) AS PARENT_ID
         FROM NETWIN.ISP_INS_PORTO_FISICO p
         LEFT JOIN NETWIN.ISP_CAT_PORTO_FISICO cp ON cp.ID_BD_TIPO_PORTO_FISICO = p.ID_BD_TIPO_PORTO_FISICO
         JOIN NETWIN.NS_RES_INS_TP_MIRROR_ALL mirror ON mirror.ID_BD_ENTITY_ISP = p.ID_BD_PORTO_FISICO
         JOIN NETWIN.ISP_INS_EQUIPAMENTO e ON e.ID_BD_EQUIPAMENTO = p.ID_BD_EQUIPAMENTO
        WHERE p.ID_BD_CARTA IN (${clause})
          AND (cp.TIPO IS NULL OR UPPER(cp.TIPO) IN ('ADAPTER', 'FO.I', 'FO.O'))
          AND e.ID_BD_TIPO_NE IN (${CDO_TYPE_IDS.join(', ')})
        GROUP BY p.ID_BD_CARTA`,
      binds,
      FETCH_OPTIONS,
    );
    for (const row of page.rows ?? []) result.set(row.ID_BD_CARTA, row.PARENT_ID);
  }
  return result;
}

export async function loadInternalCards(
  source: Connection,
  cardIds: number[],
): Promise<InternalCardRow[]> {
  const rows: InternalCardRow[] = [];
  for (let offset = 0; offset < cardIds.length; offset += 900) {
    const { clause, binds } = inBinds(cardIds.slice(offset, offset + 900));
    const result = await source.execute<InternalCardRow>(
      `SELECT c.ID_BD_CARTA, c.NOME, c.NOME_ALTERNATIVO, c.N_SLOT, c.POSICAO_UF,
              c.ESTADO_CICLO_VIDA, c.ESTADO_OPERACIONAL,
              cc.NOME_CARTA AS TIPO_NOME, cc.SIGLA_CARTA AS TIPO_SIGLA
         FROM NETWIN.ISP_INS_CARTA c
         LEFT JOIN NETWIN.ISP_CAT_CARTA cc ON cc.ID_BD_TIPO_CARTA = c.ID_BD_TIPO_CARTA
        WHERE c.ID_BD_CARTA IN (${clause})`,
      binds,
      FETCH_OPTIONS,
    );
    rows.push(...(result.rows ?? []));
  }
  return rows;
}

export async function loadInternalSlots(
  source: Connection,
  cardIds: number[],
): Promise<InternalSlotRow[]> {
  if (cardIds.length === 0) return [];
  const { clause, binds } = inBinds(cardIds);
  const result = await source.execute<InternalSlotRow>(
    `SELECT s.ID_BD_SLOT, s.ID_BD_SUBBASTIDOR, s.ID_BD_CARTA, s.ID_BD_CARTA_PARENT,
            s.NOME, s.CODIFICACAO, s.ESTADO_OPERACIONAL, cs.NOME_SLOT AS TIPO_NOME
       FROM NETWIN.ISP_INS_SLOT s
       LEFT JOIN NETWIN.ISP_CAT_SLOT cs ON cs.ID_BD_TIPO_SLOT = s.ID_BD_TIPO_SLOT
      WHERE s.ID_BD_CARTA IN (${clause}) OR s.ID_BD_CARTA_PARENT IN (${clause})`,
    binds,
    FETCH_OPTIONS,
  );
  return result.rows ?? [];
}

export async function loadInternalSubracks(
  source: Connection,
  subrackIds: number[],
): Promise<InternalSubrackRow[]> {
  if (subrackIds.length === 0) return [];
  const { clause, binds } = inBinds(subrackIds);
  const result = await source.execute<InternalSubrackRow>(
    `SELECT s.ID_BD_SUBBASTIDOR, s.ID_BD_BASTIDOR, s.NOME, s.NOME_ALTERNATIVO,
            s.CODIGO, s.CODIGOSB, s.POSICAO, s.ESTADO_CICLO_VIDA, s.ESTADO_OPERACIONAL,
            cs.NOME_SUBBASTIDOR AS TIPO_NOME, cs.SIGLA_SUBBASTIDOR AS TIPO_SIGLA
       FROM NETWIN.ISP_INS_SUBBASTIDOR s
       LEFT JOIN NETWIN.ISP_CAT_SUBBASTIDOR cs ON cs.ID_BD_TIPO_SUBBASTIDOR = s.ID_BD_TIPO_SUBBASTIDOR
      WHERE s.ID_BD_SUBBASTIDOR IN (${clause})`,
    binds,
    FETCH_OPTIONS,
  );
  return result.rows ?? [];
}

/**
 * Guarda de existência para `NETWIN.MRD_CONECTOR` (Passo 4 do plano de paginação da Fase 2.C).
 * Confirmado no DR inteiro: a tabela está **vazia**. Chamar isto uma vez antes do estágio de
 * conexões evita 9.944 consultas contra uma tabela sem linhas (~133s medidos no run do RJ).
 */
export async function hasAnyPhysicalConnections(source: Connection): Promise<boolean> {
  const result = await source.execute<{ ONE: number }>(
    'SELECT 1 AS ONE FROM NETWIN.MRD_CONECTOR WHERE ROWNUM = 1',
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return (result.rows?.length ?? 0) > 0;
}

export async function loadInternalPortConnections(
  source: Connection,
  portIds: number[],
): Promise<Array<{ ID_BD_PORTO_FISICO_A: number; ID_BD_PORTO_FISICO_Z: number }>> {
  const rows: Array<{ ID_BD_PORTO_FISICO_A: number; ID_BD_PORTO_FISICO_Z: number }> = [];
  for (let offset = 0; offset < portIds.length; offset += 900) {
    const { clause, binds } = inBinds(portIds.slice(offset, offset + 900));
    const result = await source.execute<{
      ID_BD_PORTO_FISICO_A: number;
      ID_BD_PORTO_FISICO_Z: number;
    }>(
      `SELECT ID_BD_PORTO_FISICO_A, ID_BD_PORTO_FISICO_Z
         FROM NETWIN.MRD_CONECTOR
        WHERE ID_BD_PORTO_FISICO_A IN (${clause})
       UNION ALL
       SELECT ID_BD_PORTO_FISICO_A, ID_BD_PORTO_FISICO_Z
         FROM NETWIN.MRD_CONECTOR
        WHERE ID_BD_PORTO_FISICO_Z IN (${clause})`,
      binds,
      FETCH_OPTIONS,
    );
    rows.push(...(result.rows ?? []));
  }
  return rows;
}

export async function loadInternalRacks(
  source: Connection,
  rackIds: number[],
): Promise<InternalRackRow[]> {
  if (rackIds.length === 0) return [];
  const { clause, binds } = inBinds(rackIds);
  const result = await source.execute<InternalRackRow>(
    `SELECT b.ID_BD_BASTIDOR, b.NOME, b.NOME_ALTERNATIVO, b.CODIGO, b.FIADA, b.POSICAO,
            b.ESTADO_CICLO_VIDA, b.ESTADO_OPERACIONAL,
            cb.NOME_BASTIDOR AS TIPO_NOME, cb.SIGLA_BASTIDOR AS TIPO_SIGLA
       FROM NETWIN.ISP_INS_BASTIDOR b
       LEFT JOIN NETWIN.ISP_CAT_BASTIDOR cb ON cb.ID_BD_TIPO_BASTIDOR = b.ID_BD_TIPO_BASTIDOR
      WHERE b.ID_BD_BASTIDOR IN (${clause})`,
    binds,
    FETCH_OPTIONS,
  );
  return result.rows ?? [];
}
