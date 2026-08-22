#!/usr/bin/env node
/**
 * Mesmo objetivo de scripts/merge-sala-into-room.mjs (unificar SALA/TECHNICAL_ROOM em
 * "Room"), mas em SQL direto em vez de um PATCH por site via API.
 *
 * Por quê: a versão via API (PATCH /v1/geo/sites/:id, um por site) processou os 3446
 * sites da spec "Sala" a 9-46s por request no Oracle dev e travou com 500 no 7º site —
 * carga incompatível com uma correção de catálogo (a mesma classe de problema já
 * resolvida em Postgres via SQL direto para o merge Estação→Central Office, ver memória
 * "estacao-central-office-duplicate-spec"). Os sites de SALA/TECHNICAL_ROOM não têm
 * containment declarado (allowedParentSpecIds/allowedChildSpecIds vazios) nem
 * characteristics fora do padrão atual, então não há validação de escrita a preservar —
 * um UPDATE em massa na coluna é equivalente ao que o PATCH faria, sem o custo por linha.
 *
 * O que este script faz, numa única transação:
 *   1. UPDATE tmf_geographic_site: site_specification_id das specs duplicadas → "Room".
 *   2. UPDATE tmf_geographic_site_specification: lifecycle_status='Retired' nas duplicadas.
 *
 * Uso:
 *   node scripts/merge-sala-into-room-sql.mjs            # dry-run (só mostra as contagens)
 *   node scripts/merge-sala-into-room-sql.mjs --apply    # executa
 *
 * Requer `npm run build` (dist/) e as mesmas env vars de conexão dos loaders
 * (DATABASE_PROVIDER, ORACLE_* / DATABASE_URL_DEV — lidas do .env).
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.includes('--apply');
const DUPLICATE_CODES = ['SALA', 'TECHNICAL_ROOM'];

async function main() {
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY-RUN (combine com --apply para executar) ===');
  const db = await openLoaderDb();
  console.log(`Provider: ${db.provider}`);

  try {
    await db.query('BEGIN');

    const specsResult = await db.query(
      `SELECT id, code, name, lifecycle_status FROM tmf_geographic_site_specification WHERE category = $1`,
      ['SubSite'],
    );
    const specs = specsResult.rows;
    const room = specs.find((s) => s.code === 'ROOM' && s.lifecycle_status === 'Active');
    if (!room) throw new Error('spec "Room" (code ROOM) ativa não encontrada — bootstrap não rodou?');
    console.log(`Room (canônica): ${room.id}`);

    const duplicates = specs.filter(
      (s) => DUPLICATE_CODES.includes(s.code) && s.lifecycle_status === 'Active' && s.id !== room.id,
    );
    if (duplicates.length === 0) {
      console.log('Nenhuma spec duplicada (SALA/TECHNICAL_ROOM) ativa encontrada — nada para migrar.');
      await db.query('ROLLBACK');
      return;
    }

    for (const dup of duplicates) {
      const countResult = await db.query(
        `SELECT COUNT(*) as count FROM tmf_geographic_site WHERE site_specification_id = $1`,
        [dup.id],
      );
      const count = Number(countResult.rows[0].count);
      console.log(`\n--- ${dup.name} (${dup.code}) — ${dup.id} ---`);
      console.log(`[1/2] ${count} site(s) usando "${dup.name}".`);
      if (APPLY) {
        const updateResult = await db.query(
          `UPDATE tmf_geographic_site SET site_specification_id = $1 WHERE site_specification_id = $2`,
          [room.id, dup.id],
        );
        console.log(`  repontados: ${updateResult.rowCount}`);
      } else {
        console.log(`  (dry-run — ${count} seriam repontados)`);
      }

      console.log(`[2/2] Aposentando "${dup.name}"…`);
      if (APPLY) {
        await db.query(
          `UPDATE tmf_geographic_site_specification SET lifecycle_status = $1 WHERE id = $2`,
          ['Retired', dup.id],
        );
        console.log(`  "${dup.name}" aposentada (lifecycleStatus=Retired).`);
      } else {
        console.log('  (dry-run — seria aposentada aqui)');
      }
    }

    if (APPLY) {
      await db.query('COMMIT');
      console.log('\nTransação confirmada.');
    } else {
      await db.query('ROLLBACK');
    }
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
