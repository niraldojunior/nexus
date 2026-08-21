#!/usr/bin/env node
/**
 * Fase 2 do eixo `siteRole` (C11): `INSTALLATION_POINT` estava cadastrado errado como
 * GeographicSiteSpecification — conceitualmente é recurso de rede (capacidade reservável), não
 * lugar. Decisão do usuário: migrar todo site que aponta para `INSTALLATION_POINT` para
 * `CUSTOMER_SITE` (siteRole: 'service'), que já assumiu o papel de "unidade atendida" no
 * bootstrap (ver BOOTSTRAP_SPECIFICATIONS em src/modules/geo/service.ts). `INSTALLATION_POINT`
 * permanece no catálogo com lifecycleStatus 'Retired' — C6, nunca DELETE físico.
 *
 * O script também corrige `geo_map_feature.sublabel` das linhas afetadas (guarda o code da spec,
 * ver src/modules/geo/map-feature-synchronizer.ts) — esse índice já ficou desatualizado no Oracle
 * uma vez antes depois de uma migração de spec (ver memória `geo-map-feature-oracle-migration-gap`),
 * então este script fecha os dois bancos antes de terminar.
 *
 * Pré-requisito: o backend precisa já ter subido pelo menos uma vez com o bootstrap desta fase
 * (ensureBootstrapSpecifications) para que a spec CUSTOMER_SITE exista no banco alvo.
 *
 * Uso:
 *   node scripts/migrate-installation-point-to-customer-site.mjs            # dry-run
 *   node scripts/migrate-installation-point-to-customer-site.mjs --apply    # grava
 *
 * Funciona em Postgres e Oracle (DATABASE_PROVIDER + ORACLE_OBJECT_PREFIX), via scripts/loader-db.mjs.
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv({ quiet: true });

const APPLY = process.argv.slice(2).includes('--apply');

async function main() {
  const client = await openLoaderDb();
  try {
    const { rows: customerSiteRows } = await client.query(
      `SELECT id FROM tmf_geographic_site_specification WHERE code = 'CUSTOMER_SITE'`,
    );
    const customerSiteId = customerSiteRows[0]?.id ?? customerSiteRows[0]?.ID;
    if (!customerSiteId) {
      throw new Error(
        "Spec CUSTOMER_SITE não encontrada. Suba o backend uma vez (ensureBootstrapSpecifications) antes de rodar este script.",
      );
    }

    const { rows: installationPointRows } = await client.query(
      `SELECT id FROM tmf_geographic_site_specification WHERE code = 'INSTALLATION_POINT'`,
    );
    const installationPointIds = installationPointRows.map((row) => row.id ?? row.ID);
    if (installationPointIds.length === 0) {
      console.log('Nenhuma spec INSTALLATION_POINT encontrada. Nada a fazer.');
      return;
    }
    // Specs podem estar duplicadas por corrida de bootstrap — nunca assumir 1 linha por code.
    console.log(
      `Specs INSTALLATION_POINT encontradas: ${installationPointIds.length} (${installationPointIds.join(', ')})`,
    );

    const placeholders = installationPointIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) AS n FROM tmf_geographic_site WHERE site_specification_id IN (${placeholders})`,
      installationPointIds,
    );
    const siteCount = Number(countRows[0]?.n ?? countRows[0]?.N ?? 0);
    console.log(`Sites apontando para INSTALLATION_POINT: ${siteCount}`);

    const { rows: mapFeatureCountRows } = await client.query(
      `SELECT COUNT(*) AS n FROM geo_map_feature WHERE feature_kind = 'site' AND sublabel = 'INSTALLATION_POINT'`,
    );
    const mapFeatureCount = Number(mapFeatureCountRows[0]?.n ?? mapFeatureCountRows[0]?.N ?? 0);
    console.log(`Linhas de geo_map_feature com sublabel INSTALLATION_POINT: ${mapFeatureCount}`);

    if (siteCount === 0 && mapFeatureCount === 0) {
      console.log('Nada a fazer.');
      return;
    }
    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Rode com --apply para executar. —');
      return;
    }

    const t0 = Date.now();
    await client.query('BEGIN');

    const { rowCount: sitesUpdated } = await client.query(
      `UPDATE tmf_geographic_site SET site_specification_id = $${installationPointIds.length + 1}
        WHERE site_specification_id IN (${placeholders})`,
      [...installationPointIds, customerSiteId],
    );
    console.log(`Sites migrados: ${sitesUpdated ?? siteCount}`);

    const { rowCount: mapFeaturesUpdated } = await client.query(
      `UPDATE geo_map_feature SET sublabel = 'CUSTOMER_SITE'
        WHERE feature_kind = 'site' AND sublabel = 'INSTALLATION_POINT'`,
    );
    console.log(`Linhas de geo_map_feature corrigidas: ${mapFeaturesUpdated ?? mapFeatureCount}`);

    const ruleParentPlaceholders = installationPointIds.map((_, i) => `$${i + 1}`).join(', ');
    const ruleChildPlaceholders = installationPointIds
      .map((_, i) => `$${installationPointIds.length + i + 1}`)
      .join(', ');
    await client.query(
      `DELETE FROM tmf_geographic_site_spec_containment_rule
        WHERE parent_spec_id IN (${ruleParentPlaceholders}) OR child_spec_id IN (${ruleChildPlaceholders})`,
      [...installationPointIds, ...installationPointIds],
    );
    console.log('Regras de containment órfãs removidas.');

    await client.query('COMMIT');
    console.log(`Gravado em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

    await client.gatherStats('tmf_geographic_site');
    await client.gatherStats('geo_map_feature');
    console.log('Estatísticas atualizadas.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
