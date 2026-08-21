#!/usr/bin/env node
/**
 * Gera a densidade agregada da planta (`geo_map_density` — Fase 4 da issue #69). Artefato
 * derivado e regenerável, no mesmo espírito de `build-map-features.mjs`.
 *
 * É a camada que o mapa desenha ACIMA da escala em que a feature individual some
 * (PASSIVE_INFRA_MAX_SCALE_METERS, 50 m). Abaixo disso o mapa lê `geo_map_feature` tile a tile;
 * acima, desenhar centenas de milhares de pontos não é só caro — vira borrão ilegível. Esta
 * tabela responde "onde HÁ planta", não "qual é cada item".
 *
 * A agregação NÃO cria uma grade métrica nova: reduz o próprio tile de `geo_map_feature` (z16)
 * por potência de 2 — z13 (~4,6 km), z10 (~36 km) e z7 (~300 km), ver
 * `src/modules/geo/map-density.js`. Isso mantém um só endereçamento entre índice, densidade,
 * servidor e cliente, e faz a redução virar divisão inteira: um GROUP BY por nível, inteiramente
 * dentro do banco, sem materializar linha nenhuma no processo Node (a fonte tem ~780 mil linhas).
 *
 * Duas decisões que valem registro:
 *   · COUNT(DISTINCT entity_id), não COUNT(*). Um cabo atravessa vários tiles z16 e tem uma
 *     linha em cada um; contá-las somaria trechos, não cabos. A pergunta aqui é "quanta planta
 *     há", então a entidade conta uma vez por célula.
 *   · lng/lat são a MÉDIA das features da célula (centroide), não o centro do tile. Assim o
 *     ponto desenhado cai onde a planta realmente está — numa célula de 36 km cujo conteúdo se
 *     concentra num canto, o centro do tile mentiria por dezenas de quilômetros.
 *
 * Sempre reconstrói o tenant inteiro: a agregação é barata (um GROUP BY por nível) e um rebuild
 * escopado deixaria células meio-atualizadas, que é pior que refazer. Rode depois de
 * `build-map-features.mjs` — esta tabela deriva daquela.
 *
 * Requer o dist compilado (npm run build).
 *
 * Uso:
 *   node scripts/build-map-density.mjs           # dry-run
 *   node scripts/build-map-density.mjs --apply
 */

import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import { MAP_DENSITY_ZOOMS, densityFactor } from '../dist/src/modules/geo/map-density.js';
import { MAP_TILE_ZOOM } from '../dist/src/modules/geo/map-tile.js';

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argOf = (flag, fallback) => {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const APPLY = has('--apply');
const TENANT = argOf('--tenant', 'default');
const PROVIDER = argOf('--provider', process.env.DATABASE_PROVIDER ?? 'postgres');

async function ensureDensityTable(client) {
  if (client.provider === 'oracle') {
    const ddl = `CREATE TABLE geo_map_density (
      tenant_id VARCHAR2(36 CHAR) DEFAULT 'default' NOT NULL,
      tile_z NUMBER(10) NOT NULL,
      tile_x NUMBER(10) NOT NULL,
      tile_y NUMBER(10) NOT NULL,
      feature_count NUMBER(10) DEFAULT 0 NOT NULL,
      resource_count NUMBER(10) DEFAULT 0 NOT NULL,
      site_count NUMBER(10) DEFAULT 0 NOT NULL,
      lng BINARY_DOUBLE NOT NULL,
      lat BINARY_DOUBLE NOT NULL,
      generated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, tile_z, tile_x, tile_y)
    )`;
    try {
      await client.query(ddl);
      console.log('Tabela geo_map_density criada no Oracle.');
    } catch (error) {
      if (!/ORA-00955/.test(String(error?.message ?? error))) throw error;
    }
    // Índice fica por conta do applyMigrations do app (MIGRATIONS_SQL em schema.ts), que é quem
    // sabe prefixar o NOME do índice além do da tabela — `transformOracleQuery` do loader só
    // reescreve referências a tabela, então um CREATE INDEX aqui falharia com ORA-00942. Mesma
    // razão pela qual build-map-features.mjs também só cria a tabela no caminho Oracle.
    return;
  }
  await client.query(`CREATE TABLE IF NOT EXISTS geo_map_density (
    tenant_id TEXT NOT NULL DEFAULT 'default',
    tile_z INTEGER NOT NULL,
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    feature_count INTEGER NOT NULL DEFAULT 0,
    resource_count INTEGER NOT NULL DEFAULT 0,
    site_count INTEGER NOT NULL DEFAULT 0,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, tile_z, tile_x, tile_y)
  )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_geo_map_density_bbox ON geo_map_density(tenant_id, tile_z, tile_x, tile_y, feature_count)`,
  );
}

// Um INSERT ... SELECT por nível. FLOOR(tile_x / factor) é a redução de zoom; o resto é
// agregação padrão. Nada volta para o Node — a fonte tem centenas de milhares de linhas.
const aggregateSql = (zoom, placeholder) => {
  const factor = densityFactor(zoom);
  return `INSERT INTO geo_map_density
    (tenant_id, tile_z, tile_x, tile_y, feature_count, resource_count, site_count, lng, lat)
   SELECT tenant_id,
          ${zoom},
          FLOOR(tile_x / ${factor}),
          FLOOR(tile_y / ${factor}),
          COUNT(DISTINCT entity_id),
          COUNT(DISTINCT CASE WHEN feature_kind = 'resource' THEN entity_id END),
          COUNT(DISTINCT CASE WHEN feature_kind = 'site' THEN entity_id END),
          AVG(lng),
          AVG(lat)
     FROM geo_map_feature
    WHERE tenant_id = ${placeholder} AND tile_z = ${MAP_TILE_ZOOM}
    GROUP BY tenant_id, FLOOR(tile_x / ${factor}), FLOOR(tile_y / ${factor})`;
};

async function main() {
  const client = await openLoaderDb({ provider: PROVIDER });
  try {
    console.log(`Tenant   : ${TENANT}`);
    console.log(`Níveis   : z${MAP_DENSITY_ZOOMS.join(', z')} (a partir de z${MAP_TILE_ZOOM})`);

    const placeholder = client.provider === 'oracle' ? ':1' : '$1';
    const source = await client.query(
      `SELECT COUNT(*) AS n FROM geo_map_feature WHERE tenant_id = ${placeholder} AND tile_z = ${MAP_TILE_ZOOM}`,
      [TENANT],
    );
    const sourceRows = Number(source.rows[0]?.n ?? source.rows[0]?.N ?? 0);
    console.log(`Fonte    : ${sourceRows} linhas em geo_map_feature (z${MAP_TILE_ZOOM})`);

    if (sourceRows === 0) {
      console.log(
        '\n⚠️  geo_map_feature está vazio para este tenant. Rode build-map-features.mjs antes.',
      );
    }

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
      return;
    }

    await ensureDensityTable(client);

    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM geo_map_density WHERE tenant_id = ${placeholder}`, [TENANT]);
      let total = 0;
      for (const zoom of MAP_DENSITY_ZOOMS) {
        const result = await client.query(aggregateSql(zoom, placeholder), [TENANT]);
        const inserted = Number(result.rowCount ?? result.rowsAffected ?? 0);
        total += inserted;
        console.log(`  z${zoom} (÷${densityFactor(zoom)}): ${inserted} células`);
      }
      await client.query('COMMIT');
      console.log(`\nGravado: ${total} células no total.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    await client.gatherStats('geo_map_density');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
