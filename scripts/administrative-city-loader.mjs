/**
 * Diretório geográfico canônico (issue #329) para os loaders diretos: resolve/insere municípios em
 * `geographic_administrative_city` pela chave natural (país + UF + município normalizado), sem duplicar,
 * e devolve o `administrative_city_id` de cada endereço. Requer `npm run build` (usa dist/).
 */
import {
  administrativeCityNaturalKey,
  normalizeAdministrativeCity,
} from '../dist/src/modules/geo/administrative-city.js';
import { createCanonicalId } from '../dist/src/shared/utils/canonical-id.js';

/**
 * Preenche `administrative_city_id` (e padroniza city/state_or_province/country) nas linhas de
 * endereço. Linhas com tupla incompleta/inválida mantêm os textos e ficam sem vínculo.
 * @param client resultado de openLoaderDb()
 * @param rows linhas com `city`, `state_or_province` e `country`
 */
export async function linkAdministrativeCities(client, rows) {
  const tuples = new Map();
  const perRow = rows.map((row) => {
    const tuple = normalizeAdministrativeCity({
      country: row.country,
      stateOrProvince: row.state_or_province,
      city: row.city,
    });
    if (tuple) tuples.set(administrativeCityNaturalKey(tuple), tuple);
    return tuple;
  });

  const ids = new Map();
  if (tuples.size > 0) {
    const { rows: existing } = await client.query(
      'SELECT id, country_code, state_code, city_key FROM geographic_administrative_city',
    );
    for (const item of existing) {
      const key = `${item.country_code ?? item.COUNTRY_CODE}|${item.state_code ?? item.STATE_CODE}|${item.city_key ?? item.CITY_KEY}`;
      ids.set(key, item.id ?? item.ID);
    }
    for (const [key, tuple] of tuples) {
      if (ids.has(key)) continue;
      const id = createCanonicalId();
      await client.query(
        `INSERT INTO geographic_administrative_city
           (id, country_code, country_name, state_code, city_name, city_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, tuple.countryCode, tuple.countryName, tuple.stateCode, tuple.cityName, tuple.cityKey],
      );
      ids.set(key, id);
    }
    await client.query('COMMIT');
  }

  rows.forEach((row, index) => {
    const tuple = perRow[index];
    if (!tuple) {
      row.administrative_city_id = null;
      return;
    }
    row.administrative_city_id = ids.get(administrativeCityNaturalKey(tuple)) ?? null;
    row.city = tuple.cityName;
    row.state_or_province = tuple.stateCode;
    row.country = tuple.countryCode;
  });
  return rows;
}

/**
 * Município direto do Site (issue #339). Preenche `administrative_city_id` em cada linha de Site a
 * partir do endereço (`geographic_address_id`): primeiro pelas linhas de endereço da própria carga
 * (já vinculadas por `linkAdministrativeCities`), depois pela tupla postal gravada no banco.
 * Garante as linhas tenant–município (pai da FK composta) ANTES de o Site ser inserido e recontagem
 * é feita ao final por `recountAdministrativeCityTenant`. Sites sem município continuam válidos.
 * @param client resultado de openLoaderDb()
 * @param siteRows linhas de Site com `tenant_id` e `geographic_address_id`
 * @param addressRows linhas de endereço da carga, já passadas por linkAdministrativeCities
 */
export async function linkSiteAdministrativeCities(client, siteRows, addressRows = []) {
  const cityByAddress = new Map();
  for (const address of addressRows) {
    if (address.administrative_city_id)
      cityByAddress.set(address.id, address.administrative_city_id);
  }
  const missing = [
    ...new Set(
      siteRows
        .filter(
          (site) => site.geographic_address_id && !cityByAddress.has(site.geographic_address_id),
        )
        .map((site) => site.geographic_address_id),
    ),
  ];
  if (missing.length > 0) {
    const stored = [];
    for (let i = 0; i < missing.length; i += 500) {
      const part = missing.slice(i, i + 500);
      const { rows } = await client.query(
        `SELECT id, city, state_or_province, country FROM geographic_address
          WHERE id IN (${part.map((_, index) => `$${index + 1}`).join(', ')})`,
        part,
      );
      for (const row of rows) {
        stored.push({
          id: row.id ?? row.ID,
          city: row.city ?? row.CITY,
          state_or_province: row.state_or_province ?? row.STATE_OR_PROVINCE,
          country: row.country ?? row.COUNTRY,
        });
      }
    }
    await linkAdministrativeCities(client, stored);
    for (const address of stored) {
      if (address.administrative_city_id)
        cityByAddress.set(address.id, address.administrative_city_id);
    }
  }

  const pairs = new Map();
  for (const site of siteRows) {
    site.administrative_city_id = site.geographic_address_id
      ? (cityByAddress.get(site.geographic_address_id) ?? null)
      : null;
    if (site.administrative_city_id) {
      pairs.set(`${site.tenant_id}|${site.administrative_city_id}`, [
        site.tenant_id,
        site.administrative_city_id,
      ]);
    }
  }
  for (const [tenantId, cityId] of pairs.values()) {
    await client.query(
      `MERGE INTO geographic_administrative_city_tenant k
       USING (SELECT $1 AS tenant_id, $2 AS city_id FROM DUAL) c
          ON (k.tenant_id = c.tenant_id AND k.administrative_city_id = c.city_id)
        WHEN NOT MATCHED THEN INSERT (tenant_id, administrative_city_id, active_site_count, updated_at)
             VALUES (c.tenant_id, c.city_id, 0, SYSTIMESTAMP)`,
      [tenantId, cityId],
    );
  }
  return siteRows;
}

/**
 * Recontagem set-based de `geographic_administrative_city_tenant.active_site_count` (Sites raiz
 * não-Retired). Nunca incrementa; linhas sem Site ativo ficam com 0 (jamais apagadas).
 */
export async function recountAdministrativeCityTenant(client) {
  await client.query(
    `MERGE INTO geographic_administrative_city_tenant k
     USING (SELECT s.tenant_id, s.administrative_city_id AS city_id, COUNT(*) AS total
              FROM geographic_site s
             WHERE s.parent_site_id IS NULL AND s.status <> 'Retired'
               AND s.administrative_city_id IS NOT NULL
             GROUP BY s.tenant_id, s.administrative_city_id) c
        ON (k.tenant_id = c.tenant_id AND k.administrative_city_id = c.city_id)
      WHEN MATCHED THEN UPDATE SET k.active_site_count = c.total, k.updated_at = SYSTIMESTAMP`,
  );
  await client.query(
    `UPDATE geographic_administrative_city_tenant k
        SET k.active_site_count = 0, k.updated_at = SYSTIMESTAMP
      WHERE k.active_site_count <> 0
        AND NOT EXISTS (SELECT 1 FROM geographic_site s
                         WHERE s.tenant_id = k.tenant_id AND s.parent_site_id IS NULL
                           AND s.status <> 'Retired'
                           AND s.administrative_city_id = k.administrative_city_id)`,
  );
  await client.query('COMMIT');
  await client.gatherStats('geographic_administrative_city_tenant');
}
