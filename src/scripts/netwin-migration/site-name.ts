const MAX_SITE_NAME_LENGTH = 255;

const collapseWhitespace = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\s+/g, ' ');

const comparisonKey = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const descriptionAlreadyContainsName = (name: string, description: string): boolean => {
  const normalizedName = comparisonKey(name);
  const normalizedDescription = comparisonKey(description);
  if (normalizedDescription === normalizedName) return true;
  if (!normalizedDescription.startsWith(normalizedName)) return false;
  const next = normalizedDescription.charAt(normalizedName.length);
  return next === '' || /[\s\-–—:;/]/u.test(next);
};

const limitSiteName = (value: string): string => {
  if (value.length <= MAX_SITE_NAME_LENGTH) return value;
  const prefix = value
    .slice(0, MAX_SITE_NAME_LENGTH - 1)
    .trimEnd()
    .replace(/[\s\-–—:;/]+$/u, '')
    .trimEnd();
  return `${prefix}…`.slice(0, MAX_SITE_NAME_LENGTH);
};

/** Compõe o rótulo operacional do Site sem duplicar a sigla já presente na descrição. */
export function composeNetwinSiteName(
  sourceId: string | number,
  name: string | null | undefined,
  description: string | null | undefined,
): string {
  const normalizedName = collapseWhitespace(name);
  const normalizedDescription = collapseWhitespace(description);
  if (!normalizedName && !normalizedDescription) return `Local ${sourceId}`;
  if (!normalizedName) return limitSiteName(normalizedDescription);
  if (!normalizedDescription) return limitSiteName(normalizedName);
  if (descriptionAlreadyContainsName(normalizedName, normalizedDescription)) {
    return limitSiteName(normalizedDescription);
  }
  return limitSiteName(`${normalizedName} - ${normalizedDescription}`);
}
