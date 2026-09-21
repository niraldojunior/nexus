#!/usr/bin/env node
/**
 * Migrador Nativo Netwin -> V.tal Nexus
 *
 * Arquitetura em duas fases com suporte a alto volume:
 * - Fase 1: Carga do Studio (Papéis, Organizações, Tipos de Locais, Tipos de Recursos)
 * - Fase 2: Carga de Dados (Locais, Hierarquias, Recursos, Topologia e Conectividade)
 *
 * Suporte a escopos:
 *   --uf <UF>             (ex: --uf RJ)
 *   --municipio <NOME>    (ex: --municipio "Niterói")
 *   --full                (varredura nacional)
 *   --phase 1|2|all       (default: all)
 *   --target-prefix       (default: NX_DEV1_ ou variável de ambiente)
 *   --batch-size <N>      (default: 2000)
 *   --max-records <N>     (limite de registros para teste)
 *   --apply               (executa gravação; sem esta flag roda em modo DRY-RUN)
 */

import { config as loadEnv } from 'dotenv';
import { createMigrationContext } from './context.js';
import { runPhase1Parties } from './phase1-parties.js';
import { runPhase1SiteSpecs } from './phase1-site-specs.js';
import { runPhase1ResourceSpecs } from './phase1-resource-specs.js';
import { runPhase2Locations } from './phase2-locations.js';
import { runPhase2Resources } from './phase2-resources.js';
import type { CliOptions, MigrationPhase } from './types.js';

loadEnv({ override: true });

function parseCliArgs(argv: string[]): CliOptions {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);

  const phaseRaw = get('--phase') ?? 'all';
  const phase: MigrationPhase = phaseRaw === '1' || phaseRaw === '2' ? phaseRaw : 'all';

  const uf = get('--uf');
  const municipio = get('--municipio');
  const full = has('--full');

  if (!full && !uf && !municipio && phase !== '1') {
    throw new Error(
      'Para a Fase 2 ou All, informe um escopo: --uf <UF>, --municipio <NOME> ou --full.',
    );
  }

  const targetPrefix =
    get('--target-prefix') ??
    process.env.TARGET_ORACLE_OBJECT_PREFIX ??
    process.env.ORACLE_OBJECT_PREFIX ??
    'NX_DEV1_';

  const batchSize = Number(get('--batch-size') ?? 2000);
  const maxRecords = get('--max-records') ? Number(get('--max-records')) : undefined;

  return {
    phase,
    scope: { ...(uf ? { uf } : {}), ...(municipio ? { municipio } : {}), full },
    targetPrefix,
    tenantId: get('--tenant-id') ?? 'default',
    ownerPartyId: get('--owner-party-id') ?? 'vtal',
    batchSize: Math.max(100, Math.min(batchSize, 10000)),
    ...(maxRecords ? { maxRecords } : {}),
    apply: has('--apply'),
    resume: has('--resume'),
    ...(get('--job-id') ? { jobId: get('--job-id')! } : {}),
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        V.TAL NEXUS — MIGRADOR NATIVO NETWIN (DR ORACLE)         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`Modo de Execução : ${options.apply ? 'APPLY (GRAVAÇÃO ATIVA)' : 'DRY-RUN (SIMULAÇÃO)'}`);
  console.log(`Instância Destino: Prefixo "${options.targetPrefix}"`);
  console.log(`Fase Selecionada : ${options.phase}`);
  console.log(
    `Escopo           : ${options.scope.full ? 'FULL (NACIONAL)' : options.scope.uf ? `UF: ${options.scope.uf}` : `Município: ${options.scope.municipio}`}`,
  );
  console.log(`Lote (batchSize) : ${options.batchSize}`);
  if (options.maxRecords) console.log(`Limite Registros : ${options.maxRecords}`);

  const ctx = await createMigrationContext(options);

  try {
    // FASE 1: STUDIO
    if (options.phase === '1' || options.phase === 'all') {
      console.log('\n>>> INICIANDO FASE 1: CARGA DO STUDIO <<<');
      await runPhase1Parties(ctx);
      await runPhase1SiteSpecs(ctx);
      await runPhase1ResourceSpecs(ctx);
    }

    // FASE 2: DADOS
    if (options.phase === '2' || options.phase === 'all') {
      console.log('\n>>> INICIANDO FASE 2: CARGA DE DADOS <<<');
      await runPhase2Locations(ctx);
      await runPhase2Resources(ctx);
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n Migração finalizada com sucesso em ${elapsedSec}s!`);
  } catch (error) {
    console.error('\n❌ Erro durante a execução da migração:', error);
    process.exit(1);
  } finally {
    await ctx.close();
  }
}

main();
