#!/usr/bin/env node
/**
 * Restaura a hierarquia do catálogo de recursos (tmf_resource_catalog_node.parent_node_id)
 * achatada por uma publicação do Studio "Modelo de recursos" — issue #214.
 *
 * O que aconteceu: `ResourceModelStudioAdapter.materialize` resolvia `parentNodeId` (um UUID)
 * contra um mapa indexado só por código, então nunca casava; todo nó recebeu `parentNodeId =
 * null` e virou raiz. A causa raiz foi corrigida em
 * `src/modules/studio/adapters/resource-model-adapter.ts`. Este script repara o estrago já
 * feito.
 *
 * Fonte da verdade: `studio_version.snapshot` da última versão *published* anterior à
 * publicação destrutiva — a captura de draft (`ResourceModelStudio.tsx: handleCaptureAsDraft`)
 * lê a árvore ainda saudável direto do banco antes de salvar, então o snapshot é fiel.
 * Confirmado por leitura direta no Oracle dev: domain='resource-model', version_number=2,
 * status='published' tem 53 nós / 40 com pai; a versão seguinte publicada (3) tem 54/0 —
 * exatamente o achatamento.
 *
 * Não usa a API do Studio nem republica — republicar rodaria o mesmo `materialize` (ainda que
 * já corrigido, republicar carrega o risco de reintroduzir a via de destruição enquanto ela não
 * for validada em produção). O reparo é um UPDATE direto de `parent_node_id`/`sort_order` por
 * `id`, casando snapshot → banco por id (99% dos nós) e por code como reforço.
 *
 * Nós presentes no banco mas ausentes do snapshot de referência (criados depois da última
 * versão boa) não são tocados — permanecem como estão hoje.
 *
 * Uso:
 *   node scripts/repair-resource-catalog-hierarchy.mjs                          # dry-run
 *   node scripts/repair-resource-catalog-hierarchy.mjs --apply
 *   node scripts/repair-resource-catalog-hierarchy.mjs --apply --version=2      # versão explícita
 *
 * Requer `npm run build` (dist/) e as env vars de conexão dos loaders (DATABASE_PROVIDER,
 * ORACLE_* / DATABASE_URL_DEV — lidas do .env).
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.includes('--apply');
const DOMAIN = 'resource-model';

const versionArg = process.argv.find((a) => a.startsWith('--version='));
const EXPLICIT_VERSION = versionArg ? Number(versionArg.split('=')[1]) : null;

async function countRootsVsChildren(db) {
  const r = await db.query(
    `SELECT CASE WHEN parent_node_id IS NULL THEN 'RAIZ' ELSE 'COM_PAI' END AS pos, COUNT(*) AS qtd
       FROM tmf_resource_catalog_node
      GROUP BY CASE WHEN parent_node_id IS NULL THEN 'RAIZ' ELSE 'COM_PAI' END`,
  );
  const byPos = Object.fromEntries(r.rows.map((row) => [row.pos, Number(row.qtd)]));
  return { raiz: byPos.RAIZ ?? 0, comPai: byPos.COM_PAI ?? 0 };
}

async function findReferenceSnapshot(db) {
  if (EXPLICIT_VERSION) {
    const r = await db.query(
      `SELECT version_number, status, published_at, snapshot
         FROM studio_version
        WHERE domain = $1 AND version_number = $2 AND status = 'published'`,
      [DOMAIN, EXPLICIT_VERSION],
    );
    if (r.rows.length === 0) throw new Error(`Versão ${EXPLICIT_VERSION} publicada não encontrada para domain='${DOMAIN}'.`);
    return r.rows[0];
  }

  // Sem --version explícito: escolhe a versão publicada mais antiga cuja árvore tenha algum
  // vínculo de pai — a última "boa" antes de qualquer achatamento. Não assume que é sempre a
  // v2 (ambientes diferentes têm históricos diferentes).
  const r = await db.query(
    `SELECT version_number, status, published_at, snapshot
       FROM studio_version
      WHERE domain = $1 AND status = 'published'
      ORDER BY version_number ASC`,
    [DOMAIN],
  );
  for (const row of r.rows) {
    let snap;
    try {
      snap = JSON.parse(row.snapshot);
    } catch {
      continue;
    }
    const nodes = snap?.nodes ?? [];
    const comPai = nodes.filter((n) => n.parentNodeId).length;
    if (comPai > 0) return row;
  }
  throw new Error(`Nenhuma versão publicada de '${DOMAIN}' tem hierarquia (todas as árvores estão achatadas).`);
}

async function main() {
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');
  const db = await openLoaderDb();
  console.log(`Provider: ${db.provider}`);

  try {
    const before = await countRootsVsChildren(db);
    console.log(`\nEstado atual: ${before.raiz} raiz / ${before.comPai} com pai`);

    const ref = await findReferenceSnapshot(db);
    const snapshot = JSON.parse(ref.snapshot);
    console.log(
      `Referência: v${ref.version_number} publicada em ${ref.published_at} — ${snapshot.nodes.length} nós no snapshot, catálogo '${snapshot.catalog?.code}'`,
    );

    const currentResult = await db.query('SELECT id, code, parent_node_id, sort_order FROM tmf_resource_catalog_node');
    const currentById = new Map(currentResult.rows.map((r) => [r.id, r]));
    const currentByCode = new Map(currentResult.rows.map((r) => [r.code, r]));

    const snapById = new Map(snapshot.nodes.filter((n) => n.id).map((n) => [n.id, n]));

    const plan = []; // { nodeId, code, fromParent, toParent, fromSort, toSort }
    const skipped = [];

    for (const n of snapshot.nodes) {
      const dbNode = (n.id && currentById.get(n.id)) ?? currentByCode.get(n.code);
      if (!dbNode) {
        skipped.push({ code: n.code, reason: 'nó do snapshot não existe mais no banco' });
        continue;
      }

      let targetParentId = null;
      if (n.parentNodeId) {
        const parentDbNode = currentById.get(n.parentNodeId) ?? currentByCode.get(snapById.get(n.parentNodeId)?.code ?? '');
        if (!parentDbNode) {
          skipped.push({ code: n.code, reason: `pai '${n.parentNodeId}' do snapshot não existe mais no banco` });
          continue;
        }
        targetParentId = parentDbNode.id;
      }

      const targetSort = n.sortOrder ?? 0;
      if (dbNode.parent_node_id === targetParentId && Number(dbNode.sort_order) === Number(targetSort)) {
        continue; // já está correto
      }

      plan.push({
        nodeId: dbNode.id,
        code: n.code,
        fromParent: dbNode.parent_node_id,
        toParent: targetParentId,
        fromSort: dbNode.sort_order,
        toSort: targetSort,
      });
    }

    const extras = currentResult.rows.filter((r) => !snapshot.nodes.some((n) => n.code === r.code));

    console.log(`\n${plan.length} nó(s) a corrigir:`);
    for (const p of plan.slice(0, 20)) {
      console.log(`  ${p.code}: pai ${p.fromParent ?? '(raiz)'} → ${p.toParent ?? '(raiz)'}, sort ${p.fromSort} → ${p.toSort}`);
    }
    if (plan.length > 20) console.log(`  ... e mais ${plan.length - 20}`);

    if (skipped.length > 0) {
      console.log(`\n${skipped.length} nó(s) do snapshot ignorados:`);
      for (const s of skipped) console.log(`  ${s.code}: ${s.reason}`);
    }

    console.log(`\n${extras.length} nó(s) no banco fora do snapshot de referência (não tocados):`);
    for (const e of extras) console.log(`  ${e.code} (id=${e.id})`);

    if (!APPLY) {
      console.log('\n(dry-run — nada foi alterado; rode com --apply para gravar)');
      return;
    }

    await db.query('BEGIN');
    for (const p of plan) {
      await db.query('UPDATE tmf_resource_catalog_node SET parent_node_id = $1, sort_order = $2 WHERE id = $3', [
        p.toParent,
        p.toSort,
        p.nodeId,
      ]);
    }
    await db.query('COMMIT');
    console.log(`\n${plan.length} nó(s) atualizado(s).`);

    const after = await countRootsVsChildren(db);
    console.log(`Estado final: ${after.raiz} raiz / ${after.comPai} com pai`);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.close();
  }

  console.log('\n=== fim ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
