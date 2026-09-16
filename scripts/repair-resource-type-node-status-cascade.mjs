#!/usr/bin/env node
/**
 * Inativa ResourceType cujo ResourceCatalogNode (kind=RESOURCE_TYPE) já está inativo (issue
 * relatada pelo usuário: "_LIXO" seguia selecionável na combo de Relações mesmo depois de
 * inativado na árvore).
 *
 * O par ResourceCatalogNode↔ResourceType é 1:1 (ver `oracle-repository.ts#seedResourceCatalog`
 * e o cascade de `deleteResourceCatalogNode` em `service.ts`). O cascade atual cobre o fluxo de
 * inativação pela árvore, mas não corrige o passivo já gravado: linhas inativadas antes do
 * cascade existir (ou por qualquer caminho que tenha escapado dele) deixam o ResourceType
 * `status='active'` órfão, e é esse campo que a combo de Relações
 * (`ResourceRelationshipRulesPanel.tsx`) usa para decidir o que é selecionável.
 *
 * O reparo passa por `ResourceService.updateResourceType()`, nunca por UPDATE direto, para
 * preservar o evento TMF688 (C7) e a trilha de auditoria — mesmo racional do
 * `repair-resource-specification-type-link.mjs`. Só o campo `status` muda; nada é excluído (C6).
 *
 * Requer o dist compilado (npm run build).
 *
 * Uso:
 *   node scripts/repair-resource-type-node-status-cascade.mjs --tenant vtal
 *   node scripts/repair-resource-type-node-status-cascade.mjs --tenant vtal --apply
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
  actorSub: 'script:repair-resource-type-node-status-cascade',
  tenantId: TENANT,
  roles: ['catalog.admin', 'platform.admin'],
  traceId: createCanonicalId(),
};

console.log(`\nTenant: ${TENANT}   Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

let repaired = 0;
let skipped = 0;
let ambiguous = 0;
let blocked = 0;

try {
  const types = await service.listResourceTypes(context);
  const activeTypes = types.filter((type) => type.status === 'active');

  for (const type of activeTypes) {
    const nodes = await repository.listResourceCatalogNodesByResourceType(type.id, {
      tenantId: TENANT,
    });
    const typeNodes = nodes.filter((node) => node.kind === 'RESOURCE_TYPE');
    if (typeNodes.length === 0) continue; // Tipo sem nó de catálogo — fora do escopo deste reparo.

    const hasActiveNode = typeNodes.some((node) => node.status === 'active');
    if (hasActiveNode) {
      skipped += 1;
      continue;
    }

    // 1:1 esperado; se algum dia houver mais de um nó inativo apontando para o mesmo tipo, ainda
    // assim é seguro inativar — nenhum nó ativo o reivindica.
    if (typeNodes.length > 1) {
      console.log(
        `  ⚠ ${type.name} (${type.code}): ${typeNodes.length} nós inativos referenciam este tipo — inativando mesmo assim.`,
      );
      ambiguous += 1;
    }

    const line = `${type.name} (${type.code}): active → inactive [nó '${typeNodes[0].name}' já inativo]`;

    if (!APPLY) {
      console.log(`  [DRY-RUN] ${line}`);
      repaired += 1;
      continue;
    }

    try {
      await service.updateResourceType(type.id, { status: 'inactive' }, context);
      console.log(`  ✔ ${line}`);
      repaired += 1;
    } catch (err) {
      // Dado pré-existente e alheio a este reparo (ex.: mapPresence=true sem geometryKind) pode
      // barrar a validação de `updateResourceType`. Não abortamos o lote por isso — registramos e
      // seguimos; o tipo continua na lista de pendências para correção manual à parte.
      console.log(`  ✖ ${line} — BLOQUEADO: ${err instanceof Error ? err.message : err}`);
      blocked += 1;
    }
  }

  console.log(
    `\nResumo: ${repaired} inativado(s), ${skipped} já consistente(s), ${ambiguous} com múltiplos nós inativos, ${blocked} bloqueado(s).`,
  );
  if (!APPLY) console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —\n');
  else console.log('\nReparo concluído.\n');
  if (blocked > 0) process.exitCode = 1;
} finally {
  await db.close?.();
}
