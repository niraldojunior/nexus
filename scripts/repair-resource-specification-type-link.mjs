#!/usr/bin/env node
/**
 * Reaponta ResourceSpecifications ligadas ao ResourceType errado (issue #230).
 *
 * As cargas Netwin classificavam CDOE, CEO e CEOS todas sob o ResourceType `category:CDOI`
 * (ver a correção de `EQUIPMENT_TYPE_BY_SUBTYPE` em `migrate-netwin-osp.ts` e do classificador
 * de `migrate-netwin-infranode.ts`, que já nasceram certos daqui para frente). O efeito no
 * Oracle DEV é que ~700k recursos resolvem para o tipo errado: CDOE não existe como camada
 * própria no mapa, e 45k caixas de emenda (CEO/CEOS, `map_presence=0`) seriam desenhadas como
 * se fossem CDOI.
 *
 * A conferência que autoriza a correção é o prefixo do nome da instância: dentro de cada
 * Specification afetada, 100% dos recursos têm o prefixo da própria sigla (`CDOE-12532 (EMD)`,
 * `CEOS-231 (RVD)`). Ou seja, as instâncias estão na Specification certa — só o vínculo
 * Specification → ResourceType está errado. São 5 linhas de catálogo, não 700k de instância.
 *
 * O reponto passa por `ResourceService.updateResourceSpecification()`, nunca por UPDATE direto,
 * para preservar a trilha de auditoria e o evento TMF688 (C7/C9). Recursos e Specifications não
 * são criados, clonados nem excluídos — só a FK de catálogo muda.
 *
 * Antes de reapontar, confere que o alvo existe, está ativo e que o prefixo DOMINANTE das
 * instâncias é o esperado — o guard existe para barrar uma Specification misturada (metade CDOE,
 * metade CDOI), não um nome digitado torto. Instâncias fora do padrão são listadas nominalmente
 * e continuam onde estão: elas já pertencem a esta Specification hoje, e o reponto não as torna
 * mais erradas do que já são. Corrigi-las é trabalho de dado, à parte deste script.
 *
 * Requer o dist compilado (npm run build).
 *
 * Uso:
 *   node scripts/repair-resource-specification-type-link.mjs --tenant vtal
 *   node scripts/repair-resource-specification-type-link.mjs --tenant vtal --apply
 */

import { config as loadEnv } from 'dotenv';
import { resolveDatabaseConfig } from '../dist/src/shared/config/env.js';
import { createDatabaseClient } from '../dist/src/shared/persistence/database-factory.js';
import { OracleResourceRepository } from '../dist/src/modules/resource/oracle-repository.js';
import { ResourceService } from '../dist/src/modules/resource/service.js';
import { EventService } from '../dist/src/shared/tmf/index.js';
import { OracleEventRepository } from '../dist/src/shared/tmf/oracle-event-repository.js';
import { createCanonicalId } from '../dist/src/shared/utils/canonical-id.js';

loadEnv({ quiet: true });

const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const APPLY = argv.includes('--apply');
const TENANT = argOf('--tenant', 'vtal');

/**
 * O plano de reponto. `namePrefix` é a régua de conferência: toda instância da Specification
 * precisa começar com ele, senão a Specification não é homogênea e a correção não se aplica.
 */
// Abaixo disto a Specification não é homogênea o bastante para o reponto ser seguro.
const DOMINANCE_THRESHOLD = 0.99;

const REPAIRS = [
  { specName: 'CDOE', targetTypeCode: 'category:CDOE', namePrefix: 'CDOE' },
  { specName: 'Netwin CDOE', targetTypeCode: 'category:CDOE', namePrefix: 'CDOE' },
  {
    specName: 'CDOE 1:8 (caixa de distribuição)',
    targetTypeCode: 'category:CDOE',
    namePrefix: 'CDOE',
  },
  {
    specName: 'CEO',
    targetTypeCode: 'category:Infrastructure.Passive:type:SpliceClosure',
    namePrefix: 'CEO',
  },
  {
    specName: 'CEOS',
    targetTypeCode: 'category:Infrastructure.Passive:type:SpliceClosure',
    namePrefix: 'CEOS',
  },
];

// CEOS também casa com o prefixo 'CEO'; a conferência de 'CEO' precisa excluí-lo para não
// aprovar uma Specification misturada.
/**
 * `manufacturer` e `networkType` viraram campos de primeira classe na issue #171 e o
 * ResourceService recusa qualquer update que ainda os carregue como characteristic. O backfill
 * daquela issue só passou por 'CTO' e 'Splitter' — CDOE/CEO/CEOS ficaram com `networkType: GPON`
 * pendurado, o que trava este reponto. Removê-los aqui completa aquela migração no recorte
 * tocado; `model` e as demais characteristics seguem intactas.
 */
const LEGACY_CHARACTERISTICS = new Set(['manufacturer', 'networkType']);

const matchesPrefix = (resourceName, prefix) => {
  const upper = String(resourceName ?? '').toUpperCase();
  if (prefix === 'CEO') return upper.startsWith('CEO') && !upper.startsWith('CEOS');
  return upper.startsWith(prefix);
};

async function instancesOf(db, specificationId, tenantId) {
  return await db.all(
    `SELECT name FROM tmf_physical_resource
      WHERE resource_specification_id = ? AND tenant_id = ?`,
    [specificationId, tenantId],
  );
}

const database = resolveDatabaseConfig(process.env, 'development');
if (database.provider !== 'oracle') throw new Error('Oracle não configurado (C10: Oracle-only).');

const db = createDatabaseClient(database);
await db.initialize();
const repository = new OracleResourceRepository(db);
await repository.initialize();
const service = new ResourceService(repository, new EventService(new OracleEventRepository(db)), {
  db,
});

const context = {
  actorSub: 'script:repair-resource-specification-type-link',
  tenantId: TENANT,
  roles: ['catalog.admin', 'platform.admin'],
  traceId: createCanonicalId(),
};

console.log(`\nTenant: ${TENANT}   Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const resourceTypes = await service.listResourceTypes(context);
const typeByCode = new Map(resourceTypes.map((type) => [type.code, type]));

let repaired = 0;
let skipped = 0;
let blocked = 0;

try {
  for (const repair of REPAIRS) {
    const target = typeByCode.get(repair.targetTypeCode);
    if (!target) {
      console.log(`✖ ${repair.specName}: ResourceType '${repair.targetTypeCode}' não existe.`);
      blocked += 1;
      continue;
    }
    if (target.status !== 'active') {
      console.log(`✖ ${repair.specName}: ResourceType '${target.code}' está ${target.status}.`);
      blocked += 1;
      continue;
    }

    const candidates = (await service.listResourceSpecifications({ name: repair.specName }, context))
      .filter((spec) => spec.name === repair.specName);

    if (candidates.length === 0) {
      console.log(`· ${repair.specName}: nenhuma Specification com esse nome no tenant.`);
      continue;
    }

    for (const spec of candidates) {
      if (spec.resourceTypeId === target.id) {
        console.log(`· ${spec.name}: já aponta para ${target.code}.`);
        skipped += 1;
        continue;
      }

      const instances = await instancesOf(db, spec.id, TENANT);
      const divergent = instances.filter((row) => !matchesPrefix(row.name, repair.namePrefix));
      const dominance =
        instances.length === 0 ? 0 : (instances.length - divergent.length) / instances.length;

      if (instances.length === 0) {
        console.log(`✖ ${spec.name}: sem instâncias no tenant — nada a conferir. Não reapontado.`);
        blocked += 1;
        continue;
      }
      if (dominance < DOMINANCE_THRESHOLD) {
        const sample = divergent.slice(0, 3).map((row) => row.name).join(', ');
        console.log(
          `✖ ${spec.name}: só ${(dominance * 100).toFixed(1)}% das ${instances.length} instâncias ` +
            `têm prefixo '${repair.namePrefix}' (ex.: ${sample}). Specification misturada, ` +
            `não reapontada.`,
        );
        blocked += 1;
        continue;
      }
      if (divergent.length > 0) {
        // Outlier nominal: não impede o reponto, mas fica registrado para conferência posterior.
        const sample = divergent.map((row) => row.name).slice(0, 10).join(', ');
        console.log(
          `  ⚠ ${spec.name}: ${divergent.length} instância(s) fora do prefixo — ${sample}` +
            `${divergent.length > 10 ? ' …' : ''}`,
        );
      }

      const characteristics = spec.resourceSpecificationCharacteristic ?? [];
      const legacy = characteristics.filter((c) => LEGACY_CHARACTERISTICS.has(c.name));
      const kept = characteristics.filter((c) => !LEGACY_CHARACTERISTICS.has(c.name));

      const line =
        `${spec.name} (${instances.length} recursos): ` +
        `${spec.resourceType?.code ?? spec.resourceTypeId} → ${target.code}` +
        (legacy.length > 0 ? ` [remove legado: ${legacy.map((c) => c.name).join(', ')}]` : '');

      if (!APPLY) {
        console.log(`  [DRY-RUN] ${line}`);
        repaired += 1;
        continue;
      }

      await service.updateResourceSpecification(
        spec.id,
        {
          resourceTypeId: target.id,
          ...(legacy.length > 0 ? { resourceSpecificationCharacteristic: kept } : {}),
        },
        context,
      );
      console.log(`  ✔ ${line}`);
      repaired += 1;
    }
  }

  console.log(
    `\nResumo: ${repaired} reapontada(s), ${skipped} já corretas, ${blocked} bloqueada(s).`,
  );
  if (!APPLY) console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —\n');
  else console.log('\nReponto concluído. Reconstrua o índice do mapa (build-map-features).\n');
  if (blocked > 0) process.exitCode = 1;
} finally {
  await db.close?.();
}
