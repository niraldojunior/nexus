// Diretório geográfico canônico (país + UF + município) — issue #329.
// Normalização única, usada por repositórios, migrador Netwin, loaders e backfill. Sem dependências
// para poder ser importada de `dist/` pelos scripts `.mjs`.

export const BRAZIL_COUNTRY_CODE = 'BR';
export const BRAZIL_COUNTRY_NAME = 'Brasil';

export const VALID_BRAZIL_UF: ReadonlySet<string> = new Set(
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '),
);

const BRAZIL_ALIASES = new Set(['BR', 'BRA', 'BRASIL', 'BRAZIL']);

export type AdministrativeCityTuple = {
  countryCode: string;
  countryName: string;
  stateCode: string;
  cityName: string;
  cityKey: string;
};

export type AdministrativeCityInput = {
  country?: string | null | undefined;
  stateOrProvince?: string | null | undefined;
  city?: string | null | undefined;
};

const collapse = (value: string): string => value.trim().replace(/\s+/g, ' ');

export function normalizeCountryCode(raw: string | null | undefined): string | null {
  const value = collapse(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  return BRAZIL_ALIASES.has(value) ? BRAZIL_COUNTRY_CODE : null;
}

/** Sigla de UF: só os 2 primeiros caracteres alfabéticos, aceita apenas as 27 siglas válidas. */
export function normalizeStateCode(raw: string | null | undefined): string | null {
  const match = collapse(raw ?? '')
    .toUpperCase()
    .match(/^([A-Z]{2})(?![A-Z])/);
  return match?.[1] && VALID_BRAZIL_UF.has(match[1]) ? match[1] : null;
}

/** Chave de comparação: caixa única, sem acentos, espaços colapsados. */
export function cityKeyOf(raw: string | null | undefined): string {
  return collapse(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

/**
 * Normaliza a tupla do endereço. Devolve `null` se país, UF ou município estiverem ausentes ou
 * inválidos — tuplas incompletas não entram no diretório.
 */
export function normalizeAdministrativeCity(
  input: AdministrativeCityInput,
): AdministrativeCityTuple | null {
  const countryCode = normalizeCountryCode(input.country ?? BRAZIL_COUNTRY_CODE);
  const stateCode = normalizeStateCode(input.stateOrProvince);
  const cityName = collapse(input.city ?? '');
  const cityKey = cityKeyOf(cityName);
  if (!countryCode || !stateCode || !cityKey) return null;
  return {
    countryCode,
    countryName: BRAZIL_COUNTRY_NAME,
    stateCode,
    cityName,
    cityKey,
  };
}

/** Chave natural usada para deduplicar tuplas em memória antes do upsert. */
export const administrativeCityNaturalKey = (tuple: AdministrativeCityTuple): string =>
  `${tuple.countryCode}|${tuple.stateCode}|${tuple.cityKey}`;
