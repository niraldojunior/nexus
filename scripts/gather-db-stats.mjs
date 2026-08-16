#!/usr/bin/env node
/**
 * Atualiza as estatísticas do otimizador (DBMS_STATS no Oracle, ANALYZE no Postgres) para as
 * tabelas do Nexus. Sem isto o CBO decide o plano de execução com base na última contagem que viu
 * — depois de uma carga massiva ele pode achar que uma tabela com 62 mil linhas tem 6 (visto no
 * Oracle de dev após a carga de sites do projeto ONITEL), trocando um HASH JOIN por um NESTED
 * LOOPS avaliado linha a linha.
 *
 * Rodar uma vez agora (base já carregada e sem estatísticas atuais) e, dali em diante, ao final de
 * qualquer carga massiva (`sites_carregar.mjs`, `load-recursos-netwin.mjs`,
 * `estacoes_carregar.mjs` já chamam isto sozinhos com --apply).
 *
 * Uso:
 *   npm run build                                              # obrigatório uma vez
 *   node scripts/gather-db-stats.mjs                            # todas as tabelas do schema
 *   node scripts/gather-db-stats.mjs --table tmf_geographic_site,geo_project_site
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import { TABLE_NAMES } from '../dist/src/shared/persistence/schema.js';

loadEnv({ quiet: true });

const args = process.argv.slice(2);
const argOf = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const tableArg = argOf('--table');
const tables = tableArg
  ? tableArg.split(',').map((t) => t.trim())
  : [...TABLE_NAMES];

async function main() {
  const client = await openLoaderDb();
  console.log(`Coletando estatísticas (${client.provider}) de ${tables.length} tabela(s)...\n`);
  try {
    for (const table of tables) {
      const t0 = Date.now();
      await client.gatherStats(table);
      console.log(`  ${table.padEnd(42)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    console.log('\nEstatísticas atualizadas.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
