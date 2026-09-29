#!/usr/bin/env node
/**
 * Migrador Nativo Netwin -> V.tal Nexus
 *
 * Arquitetura em três fases com suporte a alto volume:
 * - Fase 1: Carga do Studio (Papéis, Organizações, Tipos de Locais, Tipos de Recursos)
 * - Fase 2: Carga de Dados (Locais, Hierarquias, Recursos, Topologia e Conectividade)
 * - Fase 3: Projeções geoespaciais derivadas no destino (mapa, densidade e cobertura GPON)
 *
 * Suporte a escopos:
 *   --uf <UF>             (ex: --uf RJ)
 *   --municipio <NOME>    (ex: --municipio "Niterói")
 *   --bairro <NOME>       (ex: --municipio "Niterói" --bairro "Icaraí")
 *   --full                (varredura nacional)
 *   --phase 1|2|2c|2d|3|all (default: all)
 *   --target-prefix       (default: NX_DEV1_ ou variável de ambiente)
 *   --tenant-id <ID>      (obrigatório em APPLY; NX_DEV1_ aceita apenas vtal)
 *   --batch-size <N>      (default: 2000; regula lotes e cadência-base dos relatórios)
 *   --max-records <N>     (limite de registros para teste)
 *
 * A Fase 2.C mostra progresso separado de Splitters, Portas e Conexões.
 *   --apply               (executa gravação; sem esta flag roda em modo DRY-RUN)
 */

import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  completeNativeMigrationJob,
  openNativeMigrationJob,
  pauseNativeMigrationJob,
} from './checkpoint.js';
import { createMigrationContext } from './context.js';
import { runPhase1Parties } from './phase1-parties.js';
import { runPhase1SiteSpecs } from './phase1-site-specs.js';
import { runPhase1ResourceSpecs } from './phase1-resource-specs.js';
import { runPhase2Locations } from './phase2-locations.js';
import { runPhase2Resources } from './phase2-resources.js';
import { runPhase2InternalPlant } from './phase2-internal-plant.js';
import { runPhase2StationInternalPlantDiscovery } from './phase2-station-internal-plant.js';
import { runPhase3Coverage } from './phase3-coverage.js';
import { runPhase3MapFeatures } from './phase3-map-features.js';
import type { CliOptions, MigrationPhase } from './types.js';

async function runPhase3(ctx: Awaited<ReturnType<typeof createMigrationContext>>): Promise<void> {
  console.log('\n>>> INICIANDO FASE 3: PROJEÇÕES GEOESPACIAIS DERIVADAS <<<');
  await runPhase3MapFeatures(ctx);
  await runPhase3Coverage(ctx);
}

loadEnv({ override: true });

export function parseCliArgs(argv: string[]): CliOptions {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);

  const phaseRaw = get('--phase') ?? 'all';
  if (!['1', '2', '2c', '2d', '3', 'all'].includes(phaseRaw)) {
    throw new Error(`Fase inválida: "${phaseRaw}". Use 1, 2, 2c, 2d, 3 ou all.`);
  }
  const phase = phaseRaw as MigrationPhase;

  const uf = get('--uf');
  const municipio = get('--municipio');
  const bairro = get('--bairro');
  const full = has('--full');

  if (full && (uf || municipio || bairro)) {
    throw new Error('--full não pode ser combinado com --uf, --municipio ou --bairro.');
  }
  if (bairro && !uf && !municipio) {
    throw new Error(
      '--bairro exige --municipio <NOME> ou --uf <UF> para evitar escopo nacional ambíguo.',
    );
  }
  if (phase === '3' && (uf || municipio || bairro)) {
    throw new Error('A Fase 3 reconstrói o tenant inteiro; não combine com --uf, --municipio ou --bairro.');
  }
  if (!full && !uf && !municipio && phase !== '1' && phase !== '3') {
    throw new Error(
      'Para as Fases 2, 2c, 2d ou All, informe um escopo: --uf <UF>, --municipio <NOME> ou --full.',
    );
  }

  const targetPrefix =
    get('--target-prefix') ??
    process.env.TARGET_ORACLE_OBJECT_PREFIX ??
    process.env.ORACLE_OBJECT_PREFIX ??
    'NX_DEV1_';

  const batchSize = Number(get('--batch-size') ?? 2000);
  const maxRecords = get('--max-records') ? Number(get('--max-records')) : undefined;
  const apply = has('--apply');
  const resume = has('--resume');
  const jobId = get('--job-id');
  if (resume && !apply) {
    throw new Error('--resume exige --apply, pois checkpoints só existem no destino gravável.');
  }
  if (resume && !jobId) {
    throw new Error('--resume exige --job-id para identificar a execução a retomar.');
  }
  if (jobId && !apply) {
    throw new Error('--job-id exige --apply; DRY-RUN não cria nem altera jobs persistidos.');
  }
  if (jobId && !resume) {
    throw new Error('--job-id só pode ser usado com --resume.');
  }
  if (phase === '3' && (resume || jobId || maxRecords)) {
    throw new Error('A Fase 3 não aceita --resume, --job-id ou --max-records; ela reconstrói o tenant integralmente.');
  }

  return {
    phase,
    scope: {
      ...(uf ? { uf } : {}),
      ...(municipio ? { municipio } : {}),
      ...(bairro ? { bairro } : {}),
      full,
    },
    targetPrefix,
    tenantId: get('--tenant-id') ?? 'default',
    ownerPartyId: get('--owner-party-id') ?? 'vtal',
    batchSize: Math.max(100, Math.min(batchSize, 10000)),
    ...(maxRecords ? { maxRecords } : {}),
    apply,
    resume,
    ...(jobId ? { jobId } : {}),
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        V.TAL NEXUS — MIGRADOR NATIVO NETWIN (DR ORACLE)         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(
    `Modo de Execução : ${options.apply ? 'APPLY (GRAVAÇÃO ATIVA)' : 'DRY-RUN (SIMULAÇÃO)'}`,
  );
  console.log(`Instância Destino: Prefixo "${options.targetPrefix}"`);
  console.log(`Fase Selecionada : ${options.phase}`);
  const scopeLabel = options.scope.full
    ? 'FULL (NACIONAL)'
    : [
        options.scope.uf ? `UF: ${options.scope.uf}` : undefined,
        options.scope.municipio ? `Município: ${options.scope.municipio}` : undefined,
        options.scope.bairro ? `Bairro: ${options.scope.bairro}` : undefined,
      ]
        .filter(Boolean)
        .join(' | ') || (options.phase === '3' ? 'TENANT INTEGRAL (Fase 3)' : 'NÃO INFORMADO');
  console.log(`Escopo           : ${scopeLabel}`);
  console.log(`Lote (batchSize) : ${options.batchSize}`);
  console.log(`Tenant Destino  : ${options.tenantId}`);
  if (options.maxRecords) console.log(`Limite Registros : ${options.maxRecords}`);

  const ctx = await createMigrationContext(options);

  try {
    const nativePhase2Selected = ['2', 'all'].includes(options.phase);
    if (nativePhase2Selected && options.apply) {
      const jobId = await openNativeMigrationJob(ctx);
      if (!jobId) throw new Error('Não foi possível abrir o job nativo da Fase 2.');
      options.jobId = jobId;
      console.log(`[Job] Fase 2 nativa: ${jobId}${options.resume ? ' (retomado)' : ''}.`);
    }

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
      const locations = await runPhase2Locations(ctx);
      const resources = locations.paused ? undefined : await runPhase2Resources(ctx);
      if (locations.paused || resources?.paused) {
        await pauseNativeMigrationJob(ctx);
        console.log(`\n>>> Fase 2 pausada; retome com --resume --job-id ${options.jobId}. <<<`);
      } else {
        await runPhase2InternalPlant(ctx);
        const stationPlantDiscovery = await runPhase2StationInternalPlantDiscovery(ctx);
        if (stationPlantDiscovery.blocked) {
          await pauseNativeMigrationJob(ctx);
          console.log(
            `\n>>> Fase 2 bloqueada pela descoberta da 2.D; a finalização topológica não foi executada. O job ${options.jobId} permanece pausado até os contratos pendentes serem comprovados. <<<`,
          );
        } else {
          await completeNativeMigrationJob(ctx);
          if (options.phase === 'all') await runPhase3(ctx);
        }
      }
    } else if (options.phase === '3') {
      await runPhase3(ctx);
    } else if (options.phase === '2c') {
      console.log('\n>>> INICIANDO FASE 2.C: CDOs E PORTAS FÍSICAS <<<');
      await runPhase2InternalPlant(ctx);
    } else if (options.phase === '2d') {
      console.log('\n>>> INICIANDO FASE 2.D: DESCOBERTA DE PLANTA INTERNA DE ESTAÇÕES <<<');
      await runPhase2StationInternalPlantDiscovery(ctx);
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
