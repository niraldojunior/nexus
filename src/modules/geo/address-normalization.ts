const DIACRITICS = /\p{Diacritic}/gu;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

// Prefixos qualificam o logradouro, mas nao fazem parte de sua identidade. A remocao ocorre
// apenas no inicio para preservar palavras legitimas no restante do nome.
const STREET_PREFIXES = new Set([
  'al',
  'alameda',
  'av',
  'avenida',
  'doutor',
  'doutora',
  'dr',
  'dra',
  'est',
  'estrada',
  'largo',
  'pca',
  'praca',
  'r',
  'rod',
  'rodovia',
  'rua',
  'trav',
  'travessa',
  'tv',
]);

export const normalizeAddressText = (value: string | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const normalizeStreetSearch = (value: string | undefined): string => {
  const tokens = normalizeAddressText(value).split(' ').filter(Boolean);
  while (tokens.length > 1 && STREET_PREFIXES.has(tokens[0] ?? '')) tokens.shift();
  return tokens.join(' ');
};

export const normalizePostcodeSearch = (value: string | undefined): string =>
  (value ?? '').replace(/\D/g, '');

export const normalizeStreetNumberSearch = (value: string | undefined): string =>
  normalizeAddressText(value).replace(/\s/g, '');

export const normalizeCountrySearch = (value: string | undefined): string => {
  const normalized = normalizeAddressText(value).toUpperCase();
  return ['BR', 'BRA', 'BRASIL', 'BRAZIL'].includes(normalized) ? 'BR' : normalized;
};

export const addressStreetLikePattern = (normalizedStreet: string): string =>
  `%${normalizedStreet.split(' ').filter(Boolean).join('%')}%`;
