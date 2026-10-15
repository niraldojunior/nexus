#!/usr/bin/env node
/**
 * Normaliza place_id e place_type de recursos contidos no Oracle Nexus.
 *
 * Canônico V.tal Nexus (TMF-first / Planta Interna e Externa):
 * - Nó raiz físico: possui `place_id` preenchido (GeographicSite onde está instalado).
 * - Recursos contidos (`containsAsChild`): ficam com `place_id = null` e `place_type = null`.
 *   O local geográfico deles é resolvido exclusivamente pelo nó pai que os contém.
 *
 * Exemplos:
 * 1) Prédio -> CDOI -> Splitter -> Porta: apenas CDOI possui place_id com o site do prédio.
 *    Splitter e Porta ficam com place_id = null.
 * 2) Estação -> Sala -> Bastidor -> Shelf -> Slot -> Placa -> Porta: apenas Bastidor possui
 *    place_id com o site da Sala. Shelf, Slot, Placa e Porta ficam com place_id = null.
 *
 * Auditoria (somente leitura):
 *   npm run normalize:containment-places
 *   npx tsx src/scripts/normalize-netwin-phase2-contained-resources.ts --target-prefix NX_DEV16_
 *
 * Aplicação (requer confirmação explícita):
 *   npm run normalize:containment-places -- --apply --confirm-normalize-containment-places
 *   npx tsx src/scripts/normalize-netwin-phase2-contained-resources.ts --target-prefix NX_DEV16_ --apply --confirm-normalize-containment-places
 */

import { config as loadEnv } from 'dotenv';
import oracledb, { type Connection } from 'oracledb';
import { fileURLToPath } from 'node:url';
import { makeTablePrefixer } from './netwin-migration-kit.js';

loadEnv();

export type NormalizeContainmentOptions = {
  targetPrefix: string;
  tenantId: string;
  batchSize: number;
  apply: boolean;
  confirmed: boolean;
};

export function parseCliArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): NormalizeContainmentOptions {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);

  const targetPrefix =
    get('--target-prefix') ??
    env.TARGET_ORACLE_OBJECT_PREFIX ??
    env.ORACLE_OBJECT_PREFIX ??
    'NX_DEV16_';

  const tenantId = get('--tenant-id') ?? 'vtal';
  const batchSize = Math.max(100, Math.min(Number(get('--batch-size') ?? 10000), 50000));
  const apply = has('--apply');
  const confirmed = has('--confirm-normalize-containment-places');

  return {
    targetPrefix,
    tenantId,
    batchSize,
    apply,
    confirmed,
  };
}

export type SpecCountRow = {
  specName: string;
  count: number;
};

export type SampleRow = {
  id: string;
  name: string;
  specName: string;
  placeId: string;
  placeType: string | null;
  parentResourceId: string;
};

export type ContainmentAuditReport = {
  targetPrefix: string;
  tenantId: string;
  totalWithPlace: number;
  specCounts: SpecCountRow[];
  samples: SampleRow[];
};

export async function auditContainmentPlaces(
  conn: Connection,
  options: NormalizeContainmentOptions,
): Promise<ContainmentAuditReport> {
  const t = makeTablePrefixer(options.targetPrefix);
  const rpTable = t('resource_physical');
  const rrTable = t('resource_relationship');
  const rsTable = t('resource_specification');

  // Total de recursos contidos com place_id preenchido.
  // O hint PARALLEL(8) e o join direcionado com rrTable utilizam o índice reverso
  // NX_DEV16_RESOURCE_IDX_RELATIONSHIP_REVERSE e Bloom Filter para contagem rápida em base com 38M+ linhas.
  const countSql = `
    SELECT /*+ PARALLEL(8) */ COUNT(*) AS total
      FROM ${rrTable} rr
      JOIN ${rpTable} rp ON rp.id = rr.resource_to_id
     WHERE rr.relationship_type = 'containsAsChild'
       AND rp.place_id IS NOT NULL
       AND rp.tenant_id = :tenantId
  `;
  const countResult = await conn.execute<{ TOTAL: number }>(
    countSql,
    { tenantId: options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const totalWithPlace = Number(countResult.rows?.[0]?.TOTAL ?? 0);

  if (totalWithPlace === 0) {
    return {
      targetPrefix: options.targetPrefix,
      tenantId: options.tenantId,
      totalWithPlace: 0,
      specCounts: [],
      samples: [],
    };
  }

  // Agrupamento por especificação de recurso (top 30 specs mais representativas)
  const specSql = `
    SELECT /*+ PARALLEL(8) */
           COALESCE(rs.name, 'Sem Especificação') AS spec_name,
           COUNT(*) AS cnt
      FROM ${rrTable} rr
      JOIN ${rpTable} rp ON rp.id = rr.resource_to_id
      LEFT JOIN ${rsTable} rs ON rs.id = rp.resource_specification_id
     WHERE rr.relationship_type = 'containsAsChild'
       AND rp.place_id IS NOT NULL
       AND rp.tenant_id = :tenantId
     GROUP BY rs.name
     ORDER BY cnt DESC
     FETCH FIRST 30 ROWS ONLY
  `;
  const specResult = await conn.execute<{ SPEC_NAME: string; CNT: number }>(
    specSql,
    { tenantId: options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const specCounts: SpecCountRow[] = (specResult.rows ?? []).map((row) => ({
    specName: row.SPEC_NAME,
    count: Number(row.CNT),
  }));

  // Amostra de até 10 registros com detalhes de pai e especificação
  const sampleSql = `
    SELECT /*+ PARALLEL(8) */
           rp.id AS "ID",
           rp.name AS "NAME",
           COALESCE(rs.name, 'Sem Spec') AS "SPEC_NAME",
           rp.place_id AS "PLACE_ID",
           rp.place_type AS "PLACE_TYPE",
           rr.resource_from_id AS "PARENT_ID"
      FROM ${rrTable} rr
      JOIN ${rpTable} rp ON rp.id = rr.resource_to_id
      LEFT JOIN ${rsTable} rs ON rs.id = rp.resource_specification_id
     WHERE rr.relationship_type = 'containsAsChild'
       AND rp.place_id IS NOT NULL
       AND rp.tenant_id = :tenantId
     FETCH FIRST 10 ROWS ONLY
  `;
  const sampleResult = await conn.execute<{
    ID: string;
    NAME: string;
    SPEC_NAME: string;
    PLACE_ID: string;
    PLACE_TYPE: string | null;
    PARENT_ID: string;
  }>(sampleSql, { tenantId: options.tenantId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const samples: SampleRow[] = (sampleResult.rows ?? []).map((row) => ({
    id: row.ID,
    name: row.NAME,
    specName: row.SPEC_NAME,
    placeId: row.PLACE_ID,
    placeType: row.PLACE_TYPE,
    parentResourceId: row.PARENT_ID,
  }));

  return {
    targetPrefix: options.targetPrefix,
    tenantId: options.tenantId,
    totalWithPlace,
    specCounts,
    samples,
  };
}

export async function applyContainmentNormalization(
  conn: Connection,
  options: NormalizeContainmentOptions,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ updatedCount: number; durationMs: number }> {
  const t = makeTablePrefixer(options.targetPrefix);
  const rpTable = t('resource_physical');
  const rrTable = t('resource_relationship');

  const startTime = Date.now();

  // 1. Coleta os ROWIDs dos recursos elegíveis via hash join paralelo rápido
  const selectRowidsSql = `
    SELECT /*+ PARALLEL(8) */ rp.ROWID AS "ROW_ID"
      FROM ${rrTable} rr
      JOIN ${rpTable} rp ON rp.id = rr.resource_to_id
     WHERE rr.relationship_type = 'containsAsChild'
       AND rp.place_id IS NOT NULL
       AND rp.tenant_id = :tenantId
  `;

  console.log('   Identificando ROWIDs dos recursos a normalizar...');
  const selectResult = await conn.execute<{ ROW_ID: string }>(
    selectRowidsSql,
    { tenantId: options.tenantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  const rowids = (selectResult.rows ?? []).map((r) => r.ROW_ID);
  const total = rowids.length;

  if (total === 0) {
    return { updatedCount: 0, durationMs: Date.now() - startTime };
  }

  console.log(`   Total de registros a atualizar por ROWID: ${total.toLocaleString('pt-BR')}`);

  // 2. Executa UPDATE por ROWID em lotes (batchSize) com COMMIT por lote
  const updateSql = `
    UPDATE ${rpTable}
       SET place_id = NULL,
           place_type = NULL
     WHERE ROWID = :1
  `;

  let updatedCount = 0;
  for (let i = 0; i < total; i += options.batchSize) {
    const chunk = rowids.slice(i, i + options.batchSize);
    const binds = chunk.map((rowid) => [rowid]);

    await conn.executeMany(updateSql, binds, { autoCommit: false });
    await conn.commit();

    updatedCount += chunk.length;
    if (onProgress) {
      onProgress(updatedCount, total);
    }
  }

  const durationMs = Date.now() - startTime;
  return { updatedCount, durationMs };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  V.TAL NEXUS — NORMALIZAÇÃO DE PLACE_ID EM RECURSOS CONTIDOS   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`Prefixo Alvo : ${options.targetPrefix}`);
  console.log(`Tenant       : ${options.tenantId}`);
  console.log(`Modo         : ${options.apply ? 'APPLY (GRAVAÇÃO ATIVA)' : 'AUDITORIA / DRY-RUN'}`);
  console.log(`Tamanho Lote : ${options.batchSize}`);

  const connectString =
    process.env.TARGET_ORACLE_CONNECT_STRING || process.env.ORACLE_CONNECTION_STRING;
  const user = process.env.TARGET_ORACLE_USER || process.env.ORACLE_USER;
  const password = process.env.TARGET_ORACLE_PASSWORD || process.env.ORACLE_PASSWORD;
  const tnsAdmin = process.env.TARGET_ORACLE_TNS_ADMIN || process.env.TNS_ADMIN;

  if (!connectString || !user || !password) {
    throw new Error('Variáveis de conexão Oracle não configuradas (.env).');
  }

  const conn = await oracledb.getConnection({
    connectString,
    user,
    password,
    ...(tnsAdmin ? { configDir: tnsAdmin } : {}),
  });

  try {
    console.log('\n>>> 1. AUDITORIA / PRÉ-CONFERÊNCIA <<<');
    const auditReport = await auditContainmentPlaces(conn, options);

    console.log(
      `Recursos contidos com place_id preenchido: ${auditReport.totalWithPlace.toLocaleString('pt-BR')}`,
    );

    if (auditReport.totalWithPlace === 0) {
      console.log('\n Base já está 100% canônica! Nenhum recurso contido possui place_id.');
      return;
    }

    console.log('\nDetalhamento por Especificação (Top 30):');
    for (const spec of auditReport.specCounts) {
      console.log(`  - ${spec.specName}: ${spec.count.toLocaleString('pt-BR')}`);
    }

    console.log('\nAmostra de Registros a Normalizar (até 10):');
    for (const sample of auditReport.samples) {
      console.log(
        `  - [${sample.specName}] ${sample.name} (id: ${sample.id}) | place_id: ${sample.placeId} | pai: ${sample.parentResourceId}`,
      );
    }

    if (!options.apply || !options.confirmed) {
      console.log('\n──────────────────────────────────────────────────────────────────');
      console.log(' MODO DRY-RUN: Nenhuma linha foi alterada.');
      console.log('Para aplicar a normalização no banco, execute com as flags:');
      console.log(
        `  npm run normalize:containment-places -- --target-prefix ${options.targetPrefix} --apply --confirm-normalize-containment-places`,
      );
      console.log('──────────────────────────────────────────────────────────────────');
      return;
    }

    console.log('\n>>> 2. APLICAÇÃO DA NORMALIZAÇÃO (CHUNKS COM ROWID E COMMITS PERIÓDICOS) <<<');
    const { updatedCount, durationMs } = await applyContainmentNormalization(
      conn,
      options,
      (processed, total) => {
        const pct = ((processed / total) * 100).toFixed(1);
        console.log(
          `   [Progresso] ${processed.toLocaleString('pt-BR')} / ${total.toLocaleString('pt-BR')} (${pct}%)`,
        );
      },
    );
    console.log(`\n Normalização concluída em ${(durationMs / 1000).toFixed(2)}s!`);
    console.log(`Total de linhas atualizadas: ${updatedCount.toLocaleString('pt-BR')}`);

    console.log('\n>>> 3. PÓS-CONFERÊNCIA DE SEGURANÇA <<<');
    const postAudit = await auditContainmentPlaces(conn, options);
    if (postAudit.totalWithPlace === 0) {
      console.log(' Sucesso: 0 recursos contidos permanecem com place_id preenchido.');
    } else {
      console.warn(
        ` Atenção: ainda restam ${postAudit.totalWithPlace} recursos contidos com place_id.`,
      );
    }
  } finally {
    await conn.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('\n❌ Erro durante a normalização:', err);
    process.exit(1);
  });
}
