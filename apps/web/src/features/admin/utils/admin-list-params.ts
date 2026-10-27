/**
 * Admin lists keep their filters and page in the URL, like the pet list, so
 * Back and shared links restore them. Invalid values fall back to defaults.
 */
export const readEnum = <T extends string>(
  searchParams: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T | undefined => {
  const value = searchParams.get(name);

  return allowed.includes(value as T) ? (value as T) : undefined;
};

export const readPage = (searchParams: URLSearchParams): number => {
  const page = Number(searchParams.get('page'));

  return Number.isInteger(page) && page > 0 ? page : 1;
};

/**
 * Applies changes to the URL. Any change other than the page itself starts
 * again at page 1; empty values and page 1 are left out.
 */
export const withListChanges = (
  current: URLSearchParams,
  changes: Record<string, string | number | undefined>,
): URLSearchParams => {
  const next = new URLSearchParams(current);

  if (!('page' in changes)) {
    next.delete('page');
  }

  for (const [name, value] of Object.entries(changes)) {
    if (
      value === undefined ||
      value === '' ||
      (name === 'page' && value === 1)
    ) {
      next.delete(name);
    } else {
      next.set(name, String(value));
    }
  }

  return next;
};
