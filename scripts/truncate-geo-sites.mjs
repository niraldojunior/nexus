#!/usr/bin/env node
/**
 * TRUNCATE do módulo Geo (Sites) — para zerar a base antes de uma carga do
 * zero (`estacoes_carregar.mjs --fast --apply`).
 *
 * Escopo padrão — todas as tabelas de Site e seu catálogo, num único statement:
 *   tmf_geographic_site_status_history
 *   tmf_geographic_site_relationship
 *   tmf_geographic_site
 *   tmf_geographic_address
 *   tmf_geographic_site_spec_containment_rule
 *   tmf_geographic_site_specification
 *
 * Isso apaga TUDO que vive nessas tabelas — não só o que `estacoes_carregar.mjs`
 * carregou. Inclui as 7 estações legadas de Niterói/São Gonçalo
 * (`load-estacoes-netwin.mjs`), a rede GPON de Icaraí (`seed-gpon-niteroi.mjs`,
 * a parte que é GeographicSite: Central Office → Andar → Sala) e qualquer Site
 * criado manualmente pela UI. As specs do catálogo (Central Office, Sala,
 * POP, Cabinet, Installation Point, Region...) também somem — o próximo load
 * que usa `ensureSpec`/`loadSpecsFast` recria o que precisar.
 *
 * `tmf_geographic_location` FICA DE FORA do escopo padrão — correção depois
 * de uma tentativa real ter falhado: `tmf_physical_resource.
 * geographic_location_id` tem FK de verdade para essa tabela, e o Postgres
 * recusa TRUNCATE sempre que existe essa FK, **mesmo com a tabela referenciante
 * vazia** (é checagem de metadado/constraint, não de linhas — `TRUNCATE`
 * não faz varredura de dados). Então incluir `tmf_geographic_location` no
 * statement principal quebra o script sempre que essa FK existir, hoje com
 * 0 linhas ou não. Sites/addresses truncados deixam as locations antigas
 * órfãs (nada mais aponta pra elas) — inofensivo, só lixo sem uso; a
 * recarga cria locations novas do zero mesmo assim.
 *
 * Use `--locations` se quiser tentar truncar `tmf_geographic_location`
 * também (statement separado, próprio try/catch) — só funciona se
 * `tmf_physical_resource`/`tmf_logical_resource` não tiverem essa FK ou
 * estiverem vazias o bastante para você optar por truncá-las também à parte
 * (este script não faz isso por você).
 *
 * Fora do escopo, DE PROPÓSITO — não é tocado:
 *   tmf_physical_resource / tmf_logical_resource (recursos do Netwin, GPON)
 *   tmf_customer_facing_service / tmf_resource_facing_service
 * Esses módulos referenciam Site por `serving_site_id`/`place_id` (sem FK —
 * texto solto), então depois do truncate eles ficam com referência órfã (o
 * mapa/árvore de Locais não vai achar o site) até você recarregar. Isso é
 * esperado neste fluxo (truncate → recarregar geografia do zero).
 *
 * Uso:
 *   node scripts/truncate-geo-sites.mjs                  # dry-run: só mostra as contagens
 *   node scripts/truncate-geo-sites.mjs --apply          # trunca de verdade
 *   node scripts/truncate-geo-sites.mjs --apply --locations   # tenta truncar location também
 *
 * Variável de ambiente:
 *   DATABASE_URL_DEV (ou DATABASE_URL) — endpoint -pooler do Neon.
 */

import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { sslFor } from './pg-ssl.mjs';
import { requirePostgresProvider } from './db-provider-guard.mjs';

loadEnv({ quiet: true });
requirePostgresProvider('truncate-geo-sites.mjs');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const WITH_LOCATIONS = argv.includes('--locations');
const DB_URL = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;

// Ordem não importa para o TRUNCATE em si (Postgres resolve as FKs entre as
// tabelas listadas no mesmo statement), mas importa para a leitura das
// contagens no dry-run — pai antes do filho, mais fácil de ler.
const TABLES = [
  'tmf_geographic_site_status_history',
  'tmf_geographic_site_relationship',
  'tmf_geographic_site',
  'tmf_geographic_address',
  'tmf_geographic_site_spec_containment_rule',
  'tmf_geographic_site_specification',
];

async function main() {
  if (!DB_URL) throw new Error('DATABASE_URL_DEV (ou DATABASE_URL) não definido no .env');

  const pool = new pg.Pool({
    connectionString: DB_URL,
    ssl: sslFor(DB_URL),
    connectionTimeoutMillis: 20_000,
  });
  const client = await pool.connect();

  try {
    console.log('Contagem atual:');
    let total = 0;
    for (const table of TABLES) {
      const {
        rows: [row],
      } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
      console.log(`  ${table.padEnd(42)} ${row.n}`);
      total += row.n;
    }
    const {
      rows: [locRow],
    } = await client.query(`SELECT count(*)::int AS n FROM tmf_geographic_location`);
    console.log(`  ${'tmf_geographic_location (fora do escopo padrão)'.padEnd(42)} ${locRow.n}`);

    if (total === 0) {
      console.log('\nNada para truncar nas tabelas do escopo padrão.');
    } else if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi apagado. Rode com --apply para truncar de verdade. —');
    } else {
      console.log('\nTruncando...');
      await client.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY`);
      console.log('Truncado. Sites/addresses/specs do módulo Geo zerados.');
    }

    if (!WITH_LOCATIONS) {
      if (locRow.n > 0) {
        console.log(
          `\n(${locRow.n} linhas em tmf_geographic_location não tocadas — passe --locations para tentar ` +
            'truncá-la também; falha se tmf_physical_resource/tmf_logical_resource tiverem FK pra ela.)',
        );
      }
      return;
    }

    if (!APPLY) {
      console.log('— DRY-RUN --locations: tentaria truncar tmf_geographic_location também. —');
      return;
    }

    try {
      await client.query('TRUNCATE TABLE tmf_geographic_location RESTART IDENTITY');
      console.log('tmf_geographic_location truncada.');
    } catch (err) {
      console.log(
        `\n⚠ Não foi possível truncar tmf_geographic_location: ${err.message}\n` +
          '   Alguma tabela (provavelmente tmf_physical_resource ou tmf_logical_resource) tem FK pra ela — ' +
          'decida separadamente se quer truncar essa tabela também antes de tentar de novo. As demais ' +
          'tabelas do escopo padrão já foram truncadas normalmente.',
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
