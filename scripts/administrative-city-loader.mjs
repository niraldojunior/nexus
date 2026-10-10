/**
 * Diretório geográfico canônico (issue #329) para os loaders diretos: resolve/insere municípios em
 * `geo_administrative_city` pela chave natural (país + UF + município normalizado), sem duplicar,
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
      'SELECT id, country_code, state_code, city_key FROM geo_administrative_city',
    );
    for (const item of existing) {
      const key = `${item.country_code ?? item.COUNTRY_CODE}|${item.state_code ?? item.STATE_CODE}|${item.city_key ?? item.CITY_KEY}`;
      ids.set(key, item.id ?? item.ID);
    }
    for (const [key, tuple] of tuples) {
      if (ids.has(key)) continue;
      const id = createCanonicalId();
      await client.query(
        `INSERT INTO geo_administrative_city
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
